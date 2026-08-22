import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerChannelManagementCommands } from "../cli/channels.js";

afterEach(() => {
  process.exitCode = undefined;
});

describe("channels create CLI", () => {
  it("prints a JSON dry-run plan without resolving credentials", async () => {
    const writeOut = vi.fn();
    const ensureChannel = vi.fn().mockResolvedValue({
      status: "planned",
      teamId: "T00000001",
      workspace: "wedgeai",
      name: "01-engineering",
      isPrivate: false,
      topic: "AI・開発",
      purpose: "AI・ソフトウェア開発と技術判断を共有します。",
    });
    const program = new Command()
      .option("--json")
      .option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel,
      inviteChannel: vi.fn(),
      writeOut,
      writeErr: vi.fn(),
    });

    await program.parseAsync([
      "node",
      "slamy",
      "--json",
      "channels",
      "create",
      "01-engineering",
      "--workspace",
      "wedgeai",
      "--topic",
      "AI・開発",
      "--purpose",
      "AI・ソフトウェア開発と技術判断を共有します。",
      "--dry-run",
    ]);

    expect(JSON.parse(writeOut.mock.calls[0]![0])).toMatchObject({
      status: "planned",
      workspace: "wedgeai",
      name: "01-engineering",
    });
    expect(ensureChannel).toHaveBeenCalledWith({
      workspace: "wedgeai",
      name: "01-engineering",
      isPrivate: false,
      topic: "AI・開発",
      purpose: "AI・ソフトウェア開発と技術判断を共有します。",
      dryRun: true,
    });
  });

  it("accepts the root workspace selector instead of requiring a command-local selector", async () => {
    const ensureChannel = vi.fn().mockResolvedValue({
      status: "planned",
      teamId: "T00000001",
      workspace: "wedgeai",
      name: "01-engineering",
      isPrivate: false,
      topic: "AI・開発",
      purpose: "共有します。",
    });
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel,
      inviteChannel: vi.fn(),
      writeOut: vi.fn(),
      writeErr: vi.fn(),
    });

    await program.parseAsync([
      "node",
      "slamy",
      "--workspace",
      "wedgeai",
      "channels",
      "create",
      "01-engineering",
      "--topic",
      "AI・開発",
      "--purpose",
      "共有します。",
      "--dry-run",
    ]);

    expect(ensureChannel).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: "wedgeai" }),
    );
  });

  it("uses SLAMY_DEFAULT_WORKSPACE through the shared selector path", async () => {
    const ensureChannel = vi.fn().mockResolvedValue({
      status: "planned",
      teamId: "T00000001",
      workspace: "wedgeai",
      name: "01-engineering",
      isPrivate: false,
      topic: "AI・開発",
      purpose: "共有します。",
    });
    const program = new Command();
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel,
      inviteChannel: vi.fn(),
      writeOut: vi.fn(),
      writeErr: vi.fn(),
      env: { SLAMY_DEFAULT_WORKSPACE: "wedgeai.slack.com" },
    });

    await program.parseAsync([
      "node",
      "slamy",
      "channels",
      "create",
      "01-engineering",
      "--topic",
      "AI・開発",
      "--purpose",
      "共有します。",
      "--dry-run",
    ]);

    expect(ensureChannel).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: "wedgeai.slack.com" }),
    );
  });

});

describe("channels invite CLI", () => {
  it("prints a JSON dry-run plan through the shared workspace selector", async () => {
    const writeOut = vi.fn();
    const inviteChannel = vi.fn().mockResolvedValue({
      status: "planned",
      channelId: "C0123ABC",
      invited: ["U00000001", "W00000002"],
      alreadyInChannel: [],
    });
    const program = new Command()
      .exitOverride()
      .option("--json")
      .option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(),
      inviteChannel,
      writeOut,
      writeErr: vi.fn(),
    });

    await program.parseAsync([
      "node",
      "slamy",
      "--json",
      "--workspace",
      "wedgeai",
      "channels",
      "invite",
      "C0123ABC",
      "U00000001",
      "W00000002",
      "--dry-run",
    ]);

    expect(inviteChannel).toHaveBeenCalledWith({
      workspace: "wedgeai",
      channelId: "C0123ABC",
      userIds: ["U00000001", "W00000002"],
      dryRun: true,
    });
    expect(JSON.parse(writeOut.mock.calls[0]![0])).toEqual({
      status: "planned",
      channelId: "C0123ABC",
      invited: ["U00000001", "W00000002"],
      alreadyInChannel: [],
    });
  });

  it("rejects a non-C channel ID without calling the invite API", async () => {
    const inviteChannel = vi.fn();
    const writeErr = vi.fn();
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(),
      inviteChannel,
      writeOut: vi.fn(),
      writeErr,
    });

    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai",
      "channels", "invite", "G0123ABC", "U00000001",
    ]);

    expect(inviteChannel).not.toHaveBeenCalled();
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining("Channel ID"));
  });

  it("rejects an invalid user ID without calling the invite API", async () => {
    const inviteChannel = vi.fn();
    const writeErr = vi.fn();
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel, writeOut: vi.fn(), writeErr,
    });

    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai",
      "channels", "invite", "C0123ABC", "B00000001",
    ]);

    expect(inviteChannel).not.toHaveBeenCalled();
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining("User IDs"));
  });

  it("requires at least one user before calling the invite API", async () => {
    const inviteChannel = vi.fn();
    const program = new Command().exitOverride().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel, writeOut: vi.fn(), writeErr: vi.fn(),
    });

    await expect(program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai",
      "channels", "invite", "C0123ABC",
    ])).rejects.toMatchObject({ code: "commander.missingArgument" });
    expect(inviteChannel).not.toHaveBeenCalled();
  });

  it("prints the Slack platform error code and marks the command failed", async () => {
    const inviteChannel = vi.fn().mockRejectedValue(
      Object.assign(new Error("Slack rejected the operation"), {
        platformCode: "channel_not_found",
      }),
    );
    const writeErr = vi.fn();
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel, writeOut: vi.fn(), writeErr,
    });
    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai",
      "channels", "invite", "C0123ABC", "U00000001",
    ]);

    expect(writeErr).toHaveBeenCalledWith("Error: channel_not_found");
    expect(process.exitCode).toBe(1);
  });
});
