import { parseTeamId, type TeamId } from "../domain/team-id.js";
import type { WorkspaceView } from "../domain/workspace.js";
import { normalizeWorkspaceDomain, validateWorkspaceAlias } from "../workspace/schema.js";
import { TargetError } from "./errors.js";
import {
  parseTargetEvidence,
  type ParseTargetRequest,
  type ParsedTargetEvidence,
} from "./parser.js";
import type { ChannelId, EnterpriseId, SlackTimestamp } from "./values.js";

export interface WorkspaceCatalog {
  list(): Promise<readonly WorkspaceView[]>;
}

export type ResolveSlackTargetRequest = ParseTargetRequest & {
  explicitWorkspace?: string;
  targetTeamIds?: readonly string[];
};

export type TargetWorkspaceSelection =
  | "explicit"
  | "target-team-id"
  | "url-team-id"
  | "registered-hostname"
  | "default";

export type SlackTarget = {
  readonly workspaceTeamId: TeamId;
  readonly workspaceAlias: string;
  readonly workspaceDomain: string;
  readonly selectedBy: TargetWorkspaceSelection;
  readonly source: ParsedTargetEvidence["source"];
  readonly channelId: ChannelId;
  readonly messageTs?: SlackTimestamp;
  readonly threadTs?: SlackTimestamp;
  readonly enterpriseId?: EnterpriseId;
  readonly channelOwnership: "unknown";
};

type WorkspaceMetadata = {
  readonly teamId: TeamId;
  readonly alias: string;
  readonly domain: string;
  readonly previousDomains: readonly string[];
  readonly isDefault: boolean;
};

export class TargetResolver {
  readonly #catalog: WorkspaceCatalog;

  constructor(catalog: WorkspaceCatalog) {
    this.#catalog = catalog;
  }

  async resolve(request: ResolveSlackTargetRequest): Promise<SlackTarget> {
    const evidence = parseTargetEvidence(request);
    const workspaces = await readWorkspaceMetadata(this.#catalog);
    const explicit = request.explicitWorkspace !== undefined
      ? resolveSelector(workspaces, request.explicitWorkspace)
      : undefined;
    const targetTeamIds = normalizeTargetTeamIds(request.targetTeamIds);
    const urlWorkspace = resolveUrlWorkspace(workspaces, evidence);

    if (explicit) {
      assertSameWorkspace(explicit, urlWorkspace);
      if (targetTeamIds.length > 0 && !targetTeamIds.includes(explicit.teamId)) {
        throw conflict();
      }
      return createTarget(evidence, explicit, "explicit");
    }

    if (targetTeamIds.length > 1) {
      throw new TargetError(
        "WORKSPACE_AMBIGUOUS",
        "Target contains multiple possible execution workspaces",
      );
    }
    if (targetTeamIds.length === 1) {
      const targetWorkspace = resolveTeamId(workspaces, targetTeamIds[0]);
      assertSameWorkspace(targetWorkspace, urlWorkspace);
      return createTarget(evidence, targetWorkspace, "target-team-id");
    }
    if (evidence.enterpriseId) {
      throw new TargetError(
        "ENTERPRISE_CONTEXT_AMBIGUOUS",
        "Enterprise URL does not identify one execution workspace",
      );
    }
    if (evidence.teamId) {
      return createTarget(evidence, resolveTeamId(workspaces, evidence.teamId), "url-team-id");
    }
    if (evidence.hostname) {
      return createTarget(evidence, resolveDomain(workspaces, evidence.hostname), "registered-hostname");
    }
    if (!evidence.isUrl) {
      return createTarget(evidence, resolveDefault(workspaces), "default");
    }
    throw notRegistered();
  }
}

function resolveUrlWorkspace(
  workspaces: readonly WorkspaceMetadata[],
  evidence: ParsedTargetEvidence,
): WorkspaceMetadata | undefined {
  if (evidence.teamId) return resolveTeamId(workspaces, evidence.teamId);
  if (evidence.hostname) return resolveDomain(workspaces, evidence.hostname);
  return undefined;
}

function resolveSelector(
  workspaces: readonly WorkspaceMetadata[],
  selector: string,
): WorkspaceMetadata {
  const normalized = selector.toLowerCase();
  return requireOne(
    workspaces.filter(
      (workspace) =>
        workspace.teamId === selector ||
        workspace.alias === selector ||
        workspace.domain === normalized ||
        workspace.previousDomains.includes(normalized),
    ),
  );
}

function resolveTeamId(workspaces: readonly WorkspaceMetadata[], teamId: TeamId): WorkspaceMetadata {
  return requireOne(workspaces.filter((workspace) => workspace.teamId === teamId));
}

function resolveDomain(workspaces: readonly WorkspaceMetadata[], hostname: string): WorkspaceMetadata {
  const normalized = hostname.toLowerCase();
  return requireOne(
    workspaces.filter(
      (workspace) =>
        workspace.domain === normalized || workspace.previousDomains.includes(normalized),
    ),
  );
}

function resolveDefault(workspaces: readonly WorkspaceMetadata[]): WorkspaceMetadata {
  const matches = workspaces.filter((workspace) => workspace.isDefault);
  if (matches.length === 0) {
    throw new TargetError("DEFAULT_NOT_FOUND", "Default workspace is not configured");
  }
  if (matches.length > 1) {
    throw new TargetError("WORKSPACE_AMBIGUOUS", "Multiple default workspaces are configured");
  }
  return matches[0]!;
}

function requireOne(matches: readonly WorkspaceMetadata[]): WorkspaceMetadata {
  if (matches.length === 0) throw notRegistered();
  if (matches.length > 1) {
    throw new TargetError("WORKSPACE_AMBIGUOUS", "Workspace evidence matches multiple records");
  }
  return matches[0]!;
}

function normalizeTargetTeamIds(values: readonly string[] | undefined): TeamId[] {
  if (!values) return [];
  const result: TeamId[] = [];
  for (const value of values) {
    let teamId: TeamId;
    try {
      teamId = parseTeamId(value);
    } catch {
      throw new TargetError("INVALID_TARGET", "Target Team ID evidence is invalid");
    }
    if (!result.includes(teamId)) result.push(teamId);
  }
  return result;
}

function assertSameWorkspace(
  selected: WorkspaceMetadata,
  evidenceWorkspace: WorkspaceMetadata | undefined,
): void {
  if (evidenceWorkspace && selected.teamId !== evidenceWorkspace.teamId) throw conflict();
}

function createTarget(
  evidence: ParsedTargetEvidence,
  workspace: WorkspaceMetadata,
  selectedBy: TargetWorkspaceSelection,
): SlackTarget {
  return Object.freeze({
    workspaceTeamId: workspace.teamId,
    workspaceAlias: workspace.alias,
    workspaceDomain: workspace.domain,
    selectedBy,
    source: evidence.source,
    channelId: evidence.channelId,
    ...(evidence.messageTs ? { messageTs: evidence.messageTs } : {}),
    ...(evidence.threadTs ? { threadTs: evidence.threadTs } : {}),
    ...(evidence.enterpriseId ? { enterpriseId: evidence.enterpriseId } : {}),
    channelOwnership: "unknown",
  });
}

function notRegistered(): TargetError {
  return new TargetError(
    "WORKSPACE_NOT_REGISTERED",
    "Target workspace is not registered",
  );
}

function conflict(): TargetError {
  return new TargetError(
    "WORKSPACE_CONFLICT",
    "Explicit and target workspace evidence conflict",
  );
}

async function readWorkspaceMetadata(catalog: WorkspaceCatalog): Promise<readonly WorkspaceMetadata[]> {
  try {
    const values = await catalog.list();
    if (!Array.isArray(values)) throw new Error("invalid catalog");
    return Object.freeze(values.map(snapshotWorkspaceMetadata));
  } catch {
    throw new TargetError(
      "WORKSPACE_CATALOG_INVALID",
      "Workspace catalog could not provide valid routing metadata",
    );
  }
}

function snapshotWorkspaceMetadata(workspace: WorkspaceView): WorkspaceMetadata {
  const teamId = parseTeamId(workspace.teamId);
  const alias = validateWorkspaceAlias(workspace.alias);
  const rawDomain = workspace.domain;
  const domain = normalizeWorkspaceDomain(rawDomain);
  if (rawDomain !== domain) throw new Error("non-normalized domain");
  const rawPreviousDomains = workspace.previousDomains;
  if (!Array.isArray(rawPreviousDomains)) throw new Error("invalid domain history");
  const previousDomains = rawPreviousDomains.map((value) => {
    const normalized = normalizeWorkspaceDomain(value);
    if (value !== normalized) throw new Error("non-normalized domain history");
    return normalized;
  });
  const isDefault = workspace.isDefault;
  if (typeof isDefault !== "boolean") throw new Error("invalid default marker");
  return Object.freeze({
    teamId,
    alias,
    domain,
    previousDomains: Object.freeze(previousDomains),
    isDefault,
  });
}
