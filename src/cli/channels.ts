import type { Command } from "commander";
import {
  ensureWorkspaceChannel,
  type EnsureWorkspaceChannelRequest,
} from "../lib/channel-management.js";
import { formatEnsureChannelResult } from "../output/channel-management.js";

export type ChannelManagementCommandDependencies = {
  ensureChannel: (request: EnsureWorkspaceChannelRequest) => ReturnType<typeof ensureWorkspaceChannel>;
  writeOut: (line: string) => void;
  writeErr: (line: string) => void;
};

const defaultDependencies: ChannelManagementCommandDependencies = {
  ensureChannel: (request) => ensureWorkspaceChannel(request),
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
        const isPrivate = Boolean(options.private);
        const result = await dependencies.ensureChannel({
          workspace: options.workspace,
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

function outputMode(program: Command): "human" | "json" | "plain" {
  const options = program.opts<{ json?: boolean; plain?: boolean }>();
  if (options.json) return "json";
  if (options.plain) return "plain";
  return "human";
}
