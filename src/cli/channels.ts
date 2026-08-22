import type { Command } from "commander";
import {
  ensureWorkspaceChannel,
  type EnsureWorkspaceChannelRequest,
  inviteWorkspaceChannelUsers,
  type InviteWorkspaceChannelUsersRequest,
} from "../lib/channel-management.js";
import {
  formatEnsureChannelResult,
  formatInviteToChannelResult,
} from "../output/channel-management.js";
import { resolveCliWorkspaceSelector } from "./api-client.js";

export type ChannelManagementCommandDependencies = {
  ensureChannel: (request: EnsureWorkspaceChannelRequest) => ReturnType<typeof ensureWorkspaceChannel>;
  inviteChannel: (
    request: InviteWorkspaceChannelUsersRequest,
  ) => ReturnType<typeof inviteWorkspaceChannelUsers>;
  writeOut: (line: string) => void;
  writeErr: (line: string) => void;
  env?: NodeJS.ProcessEnv;
};

const defaultDependencies: ChannelManagementCommandDependencies = {
  ensureChannel: (request) => ensureWorkspaceChannel(request),
  inviteChannel: (request) => inviteWorkspaceChannelUsers(request),
  writeOut: (line) => console.log(line),
  writeErr: (line) => console.error(line),
};

type CreateOptions = {
  topic: string;
  purpose: string;
  private?: boolean;
  dryRun?: boolean;
};

type InviteOptions = {
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
    .requiredOption("--topic <text>", "Channel topic")
    .requiredOption("--purpose <text>", "Channel description")
    .option("--private", "Create a private channel")
    .option("--dry-run", "Print the planned operation without reading credentials or Slack")
    .action(async (name: string, options: CreateOptions) => {
      try {
        validateInput(name, options.topic, options.purpose);
        const rootWorkspace = program.opts<{ workspace?: string }>().workspace;
        const workspace = resolveCliWorkspaceSelector(
          rootWorkspace,
          dependencies.env ?? process.env,
        );
        if (workspace === undefined) {
          throw new Error("A workspace selector is required");
        }
        const isPrivate = Boolean(options.private);
        const result = await dependencies.ensureChannel({
          workspace,
          name,
          isPrivate,
          topic: options.topic,
          purpose: options.purpose,
          dryRun: Boolean(options.dryRun),
        });
        dependencies.writeOut(formatEnsureChannelResult(result, outputMode(program)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Channel management failed";
        dependencies.writeErr(`Error: ${message}`);
        process.exitCode = 1;
      }
    });

  channels
    .command("invite <channel> <user...>")
    .description("Invite one or more users to a channel in an explicit workspace")
    .option("--dry-run", "Print the planned operation without reading credentials or Slack")
    .action(async (channelId: string, userIds: string[], options: InviteOptions) => {
      try {
        validateInviteInput(channelId, userIds);
        const rootWorkspace = program.opts<{ workspace?: string }>().workspace;
        const workspace = resolveCliWorkspaceSelector(
          rootWorkspace,
          dependencies.env ?? process.env,
        );
        if (workspace === undefined) throw new Error("A workspace selector is required");
        const result = await dependencies.inviteChannel({
          workspace,
          channelId,
          userIds,
          dryRun: Boolean(options.dryRun),
        });
        dependencies.writeOut(formatInviteToChannelResult(result, outputMode(program)));
      } catch (error) {
        dependencies.writeErr(`Error: ${channelManagementErrorMessage(error)}`);
        process.exitCode = 1;
      }
    });
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

function validateInviteInput(channelId: string, userIds: readonly string[]): void {
  if (!/^C[A-Z0-9]+$/.test(channelId)) {
    throw new Error("Channel ID must start with C and contain only uppercase letters or numbers");
  }
  if (userIds.length < 1) throw new Error("At least one user ID is required");
  if (userIds.some((userId) => !/^[UW][A-Z0-9]+$/.test(userId))) {
    throw new Error("User IDs must start with U or W and contain only uppercase letters or numbers");
  }
}

function channelManagementErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "platformCode" in error) {
    const code = error.platformCode;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return error instanceof Error ? error.message : "Channel management failed";
}

function outputMode(program: Command): "human" | "json" | "plain" {
  const options = program.opts<{ json?: boolean; plain?: boolean }>();
  if (options.json) return "json";
  if (options.plain) return "plain";
  return "human";
}
