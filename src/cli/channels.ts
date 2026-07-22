import type { Command } from "commander";
import { ensureChannel } from "../channels/manager.js";
import type { CredentialResolver } from "../credentials/index.js";
import { createCredentialResolver } from "../lib/credentials.js";
import { jsonOutput } from "../lib/cli-format.js";
import { createWorkspaceSlackAdapter } from "../lib/slack.js";
import { createWorkspaceRegistry, type WorkspaceRegistry } from "../lib/workspace.js";
import { createSlackWorkspaceContext, type WorkspaceSlackOperations } from "../slack/index.js";

export type ChannelManagementCommandDependencies = {
  registryFactory: () => WorkspaceRegistry;
  credentialResolverFactory: () => CredentialResolver;
  slackFactory: () => WorkspaceSlackOperations;
  writeOut: (line: string) => void;
  writeErr: (line: string) => void;
};

const defaultDependencies: ChannelManagementCommandDependencies = {
  registryFactory: () => createWorkspaceRegistry(),
  credentialResolverFactory: () => createCredentialResolver(),
  slackFactory: () => createWorkspaceSlackAdapter(),
  writeOut: (line) => console.log(line),
  writeErr: (line) => console.error(line),
};

type CreateOptions = {
  workspace: string;
  topic: string;
  purpose: string;
  private?: boolean;
  dryRun?: boolean;
};

export function registerChannelManagementCommands(
  channels: Command,
  program: Command,
  dependencies: ChannelManagementCommandDependencies = defaultDependencies,
): void {
  channels
    .command("create <name>")
    .description("Create or reconcile a channel in an explicit workspace")
    .requiredOption("--workspace <selector>", "Workspace Team ID or alias")
    .requiredOption("--topic <text>", "Channel topic")
    .requiredOption("--purpose <text>", "Channel description")
    .option("--private", "Create a private channel")
    .option("--dry-run", "Print the planned operation without reading credentials or Slack")
    .action(async (name: string, options: CreateOptions) => {
      try {
        validateInput(name, options.topic, options.purpose);
        const workspace = await dependencies.registryFactory().resolve(options.workspace);
        const isPrivate = Boolean(options.private);
        const result = await ensureChannel(
          {
            workspace: {
              teamId: workspace.teamId,
              alias: workspace.alias,
              domain: workspace.domain,
              displayName: workspace.displayName,
            },
            name,
            isPrivate,
            topic: options.topic,
            purpose: options.purpose,
            dryRun: Boolean(options.dryRun),
          },
          async () => {
            const credentials = await dependencies.credentialResolverFactory().resolveForWorkspace(
              workspace,
              {
                requiredKinds: ["user"],
                requiredScopes: { user: requiredUserScopes(isPrivate) },
                operation: "channels.create",
              },
            );
            return {
              context: createSlackWorkspaceContext({ teamId: workspace.teamId, credentials }),
              slack: dependencies.slackFactory(),
              dispose: () => credentials.destroy(),
            };
          },
        );
        dependencies.writeOut(formatResult(result, program));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Channel management failed";
        dependencies.writeErr(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}

function requiredUserScopes(isPrivate: boolean): readonly string[] {
  return Object.freeze([
    "channels:read",
    "groups:read",
    ...(isPrivate
      ? ["groups:write", "groups:write.topic"]
      : ["channels:write", "channels:write.topic"]),
  ]);
}

function validateInput(name: string, topic: string, purpose: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(name)) {
    throw new Error("Channel name must use lowercase letters, numbers, hyphens, or underscores");
  }
  for (const [label, value] of [["topic", topic], ["purpose", purpose]] as const) {
    if (value.length < 1 || value.length > 250 || /[\u0000\u007f]/.test(value)) {
      throw new Error(`Channel ${label} must contain 1 to 250 safe characters`);
    }
  }
}

function formatResult(result: Awaited<ReturnType<typeof ensureChannel>>, program: Command): string {
  const options = program.opts<{ json?: boolean; plain?: boolean }>();
  if (options.json) return jsonOutput(result);
  if (options.plain) {
    return [
      result.status,
      result.teamId,
      result.workspace,
      result.channelId ?? "",
      result.name,
      result.isPrivate ? "private" : "public",
      result.topic,
      result.purpose,
    ].join("\t");
  }
  const id = result.channelId ? ` (${result.channelId})` : "";
  return `${result.status}: #${result.name}${id} in ${result.workspace} [${result.isPrivate ? "private" : "public"}]`;
}
