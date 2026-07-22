import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../domain/team-id.js";
import { registerChannelManagementCommands } from "../cli/channels.js";

describe("channels create CLI", () => {
  it("prints a JSON dry-run plan without resolving credentials", async () => {
    const writeOut = vi.fn();
    const credentialResolverFactory = vi.fn();
    const program = new Command().option("--json");
    const channels = program.command("channels");
    registerChannelManagementCommands(channels, program, {
      registryFactory: () => ({
        resolve: vi.fn().mockResolvedValue({
          teamId: parseTeamId("T00000001"),
          alias: "wedgeai",
          domain: "wedgeai.slack.com",
          previousDomains: [],
          displayName: "Wedge AI, Inc.",
          isDefault: false,
        }),
      }) as never,
      credentialResolverFactory,
      slackFactory: vi.fn(),
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
    expect(credentialResolverFactory).not.toHaveBeenCalled();
  });
});
