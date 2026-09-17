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

describe("channels invite-shared CLI", () => {
  it("accepts a legacy G-prefixed private channel ID", async () => {
    const inviteSharedChannel = vi.fn().mockResolvedValue({
      status: "planned", teamId: "T00000001", workspace: "wedgeai", channelId: "G0123ABC",
      emails: ["advisor@example.com"], externalLimited: true,
    });
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel: vi.fn(), inviteSharedChannel,
      writeOut: vi.fn(), writeErr: vi.fn(),
    });

    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai", "channels", "invite-shared", "G0123ABC",
      "--email", "advisor@example.com", "--dry-run",
    ]);

    expect(inviteSharedChannel).toHaveBeenCalledWith(expect.objectContaining({
      channelId: "G0123ABC", dryRun: true,
    }), expect.any(Function));
  });

  it("passes all recipients and access policy, and shows the final external-send target on stderr", async () => {
    const inviteSharedChannel = vi.fn().mockImplementation(async (_request, beforeExecute) => {
      beforeExecute({
        workspace: "wedgeai", teamId: "T00000001", channelId: "C0123ABC",
        emails: ["advisor@example.com", "tax@example.com"],
      });
      return {
        status: "invited", teamId: "T00000001", workspace: "wedgeai", channelId: "C0123ABC",
        emails: ["advisor@example.com", "tax@example.com"], externalLimited: false, inviteId: "I0123ABC",
      };
    });
    const writeErr = vi.fn();
    const writeOut = vi.fn();
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel: vi.fn(), inviteSharedChannel, writeOut, writeErr,
    });

    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai", "channels", "invite-shared", "C0123ABC",
      "--email", "advisor@example.com", "--email", "tax@example.com", "--full-access",
    ]);

    expect(inviteSharedChannel).toHaveBeenCalledWith({
      workspace: "wedgeai", channelId: "C0123ABC", emails: ["advisor@example.com", "tax@example.com"],
      externalLimited: false, dryRun: false,
    }, expect.any(Function));
    expect(writeErr.mock.calls.map(([line]) => line)).toEqual([
      "workspace alias: wedgeai", "Team ID: T00000001", "channel ID: C0123ABC",
      "recipient email: advisor@example.com", "recipient email: tax@example.com",
    ]);
    expect(writeOut.mock.calls[0]![0]).not.toContain("url");
    expect(writeOut.mock.calls[0]![0]).not.toContain("conf_code");
  });

  it.each([
    ["D0123ABC", ["advisor@example.com"]],
    ["C0123ABC", ["not-an-email"]],
    ["C0123ABC", ["advisor@example.com", "advisor@example.com"]],
  ])("rejects invalid channel or email input before the API call", async (channelId, emails) => {
    const inviteSharedChannel = vi.fn();
    const writeErr = vi.fn();
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel: vi.fn(), inviteSharedChannel, writeOut: vi.fn(), writeErr,
    });

    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai", "channels", "invite-shared", channelId,
      ...emails.flatMap((email) => ["--email", email]),
    ]);

    expect(inviteSharedChannel).not.toHaveBeenCalled();
    expect(writeErr).toHaveBeenCalledWith(expect.stringMatching(/^Error: /));
  });

  it("rejects zero email recipients before the API call", async () => {
    const inviteSharedChannel = vi.fn();
    const writeErr = vi.fn();
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel: vi.fn(), inviteSharedChannel, writeOut: vi.fn(), writeErr,
    });

    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai", "channels", "invite-shared", "C0123ABC",
    ]);

    expect(inviteSharedChannel).not.toHaveBeenCalled();
    expect(writeErr).toHaveBeenCalledWith("Error: At least one email is required");
  });
});

describe("channels rename CLI", () => {
  it("prints the documented JSON dry-run plan", async () => {
    const renameChannel = vi.fn().mockResolvedValue({
      status: "planned", channelId: "C0123ABC", name: "001-general",
    });
    const writeOut = vi.fn();
    const program = new Command().option("--json").option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel: vi.fn(), renameChannel, writeOut, writeErr: vi.fn(),
    });

    await program.parseAsync([
      "node", "slamy", "--json", "--workspace", "wedgeai", "channels", "rename",
      "C0123ABC", "001-general", "--dry-run",
    ]);

    expect(renameChannel).toHaveBeenCalledWith({
      workspace: "wedgeai", channelId: "C0123ABC", name: "001-general", dryRun: true,
    });
    expect(JSON.parse(writeOut.mock.calls[0]![0])).toEqual({
      status: "planned", channelId: "C0123ABC", name: "001-general",
    });
  });

  it("accepts a legacy G-prefixed private channel ID", async () => {
    const renameChannel = vi.fn().mockResolvedValue({
      status: "planned", channelId: "G0123ABC", name: "001-private",
    });
    const program = new Command().option("--workspace <selector>");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      ensureChannel: vi.fn(), inviteChannel: vi.fn(), renameChannel, writeOut: vi.fn(), writeErr: vi.fn(),
    });

    await program.parseAsync([
      "node", "slamy", "--workspace", "wedgeai", "channels", "rename",
      "G0123ABC", "001-private", "--dry-run",
    ]);

    expect(renameChannel).toHaveBeenCalledWith({
      workspace: "wedgeai", channelId: "G0123ABC", name: "001-private", dryRun: true,
    });
  });

  it.each([["D0123ABC", "001-general"], ["C0123ABC", "Invalid Name"]])(
    "rejects invalid rename input without calling the API",
    async (channelId, name) => {
      const renameChannel = vi.fn();
      const writeErr = vi.fn();
      const program = new Command().option("--workspace <selector>");
      const channels = program.command("channels");
      registerChannelManagementCommands(channels, program, {
        ensureChannel: vi.fn(), inviteChannel: vi.fn(), renameChannel, writeOut: vi.fn(), writeErr,
      });

      await program.parseAsync(["node", "slamy", "--workspace", "wedgeai", "channels", "rename", channelId, name]);
      expect(renameChannel).not.toHaveBeenCalled();
      expect(writeErr).toHaveBeenCalledWith(expect.stringContaining("Channel"));
    },
  );
});
