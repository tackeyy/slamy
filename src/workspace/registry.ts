import { WorkspaceRegistryError } from "./errors.js";
import { decodeWorkspaceRegistry, normalizeWorkspaceDomain } from "./schema.js";
import type { WorkspaceStore } from "./store.js";
import type { WorkspaceView } from "../domain/workspace.js";
import type { WorkspaceRecord, WorkspaceRegistryDocument } from "./types.js";

export class WorkspaceRegistry {
  readonly #store: WorkspaceStore;

  constructor(store: WorkspaceStore) {
    this.#store = store;
  }

  async list(): Promise<WorkspaceView[]> {
    const document = await this.#read();
    return document.workspaces.map((workspace) => ({
      ...workspace,
      isDefault: workspace.teamId === document.defaultTeamId,
    }));
  }

  async resolve(selector?: string): Promise<WorkspaceView> {
    const document = await this.#read();
    const workspace = resolveRecord(document, selector);
    return { ...workspace, isDefault: workspace.teamId === document.defaultTeamId };
  }

  async add(record: WorkspaceRecord, options: { makeDefault?: boolean } = {}): Promise<WorkspaceView> {
    const next = await this.#mutate((document) => ({
      ...document,
      ...(options.makeDefault ? { defaultTeamId: record.teamId } : {}),
      workspaces: [...document.workspaces, record],
    }));
    const added = next.workspaces.find((workspace) => workspace.teamId === record.teamId);
    if (!added) throw new WorkspaceRegistryError("STORE_WRITE_FAILED", "Workspace was not added");
    return { ...added, isDefault: added.teamId === next.defaultTeamId };
  }

  async remove(selector: string): Promise<WorkspaceView> {
    let removed: WorkspaceRecord | undefined;
    const next = await this.#mutate((document) => {
      removed = resolveRecord(document, selector);
      return {
        version: 1,
        ...(document.defaultTeamId === removed.teamId
          ? {}
          : document.defaultTeamId === undefined
            ? {}
            : { defaultTeamId: document.defaultTeamId }),
        workspaces: document.workspaces.filter((workspace) => workspace.teamId !== removed?.teamId),
      };
    });
    if (!removed) throw new WorkspaceRegistryError("WORKSPACE_NOT_FOUND", "Workspace not found");
    return { ...removed, isDefault: removed.teamId === next.defaultTeamId };
  }

  async setDefault(selector: string): Promise<WorkspaceView> {
    let selected: WorkspaceRecord | undefined;
    const next = await this.#mutate((document) => {
      selected = resolveRecord(document, selector);
      return { ...document, defaultTeamId: selected.teamId };
    });
    if (!selected) throw new WorkspaceRegistryError("WORKSPACE_NOT_FOUND", "Workspace not found");
    return { ...selected, isDefault: selected.teamId === next.defaultTeamId };
  }

  async clearDefault(): Promise<void> {
    await this.#mutate((document) => ({ version: 1, workspaces: document.workspaces }));
  }

  async #read(): Promise<WorkspaceRegistryDocument> {
    return decodeWorkspaceRegistry(await this.#store.read());
  }

  async #mutate(
    mutate: (document: WorkspaceRegistryDocument) => WorkspaceRegistryDocument,
  ): Promise<WorkspaceRegistryDocument> {
    const current = await this.#read();
    const next = decodeWorkspaceRegistry(mutate(structuredClone(current)));
    await this.#store.write(next);
    return next;
  }
}

function resolveRecord(
  document: WorkspaceRegistryDocument,
  selector?: string,
): WorkspaceRecord {
  if (selector === undefined) {
    if (document.defaultTeamId === undefined) {
      throw new WorkspaceRegistryError("DEFAULT_NOT_FOUND", "Default workspace is not configured");
    }
    const byDefault = document.workspaces.find(
      (workspace) => workspace.teamId === document.defaultTeamId,
    );
    if (byDefault) return byDefault;
  } else {
    const exact = document.workspaces.find(
      (workspace) => workspace.teamId === selector || workspace.alias === selector,
    );
    if (exact) return exact;

    let domain: string | undefined;
    try {
      domain = normalizeWorkspaceDomain(selector);
    } catch {
      domain = undefined;
    }
    if (domain !== undefined) {
      const byDomain = document.workspaces.find(
        (workspace) => workspace.domain === domain || workspace.previousDomains.includes(domain),
      );
      if (byDomain) return byDomain;
    }
  }

  throw new WorkspaceRegistryError("WORKSPACE_NOT_FOUND", "Workspace not found");
}
