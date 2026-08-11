import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerChannelManagementCommands } from "../cli/channels.js";

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
