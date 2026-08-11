import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import { registerLocalSessionCommands } from "../session.js";

const workspace = {
  teamId: parseTeamId("T0BJ9SG2M0R"),
  alias: "wedgeai",
  domain: "wedgeai.slack.com",
  previousDomains: [],
  displayName: "WedgeAI",
  credentialRefs: { user: { provider: "environment" as const, name: "WEDGE_TOKEN" } },
};

function commandHarness(
  dependencies: Parameters<typeof registerLocalSessionCommands>[2] = {},
) {
  const program = new Command()
    .option("--workspace <selector>")
    .option("--json")
    .option("--plain");
  const auth = program.command("auth");
  const writeOut = vi.fn();
  const writeErr = vi.fn();
  registerLocalSessionCommands(auth, program, {
    env: { XDG_CONFIG_HOME: "/private/config" },
    registryFactory: () => ({ resolve: vi.fn().mockResolvedValue(workspace) }) as never,
    readToken: vi.fn().mockResolvedValue("xoxp-cli-secret-canary"),
    writeOut,
    writeErr,
    cliPath: "/opt/slamy/dist/cli/index.js",
    executablePath: "/opt/node/bin/node",
    ...dependencies,
  });
  return { program, writeOut, writeErr };
}

const status = {
  workspace: "wedgeai",
  teamId: "T0BJ9SG2M0R",
  credentialKind: "user" as const,
  createdAt: "2029-01-01T00:00:00.000Z",
  expiresAt: "2029-01-08T00:00:00.000Z",
};

describe("local session CLI", () => {
  it("starts a 7-day session from stdin and emits only public status", async () => {
    const program = new Command()
      .option("--workspace <selector>")
      .option("--json")
      .option("--plain");
    const auth = program.command("auth");
    const writeOut = vi.fn();
    const writeErr = vi.fn();
    const token = "xoxp-cli-secret-canary";
    const workspace = {
      teamId: parseTeamId("T0BJ9SG2M0R"),
      alias: "wedgeai",
      domain: "wedgeai.slack.com",
      previousDomains: [],
      displayName: "WedgeAI",
      credentialRefs: { user: { provider: "environment", name: "WEDGE_TOKEN" } },
    };
    const start = vi.fn().mockResolvedValue({
      workspace: "wedgeai",
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-08T00:00:00.000Z",
    });
    registerLocalSessionCommands(auth, program, {
      env: { XDG_CONFIG_HOME: "/private/config" },
      registryFactory: () => ({ resolve: vi.fn().mockResolvedValue(workspace) }) as never,
      readToken: vi.fn().mockResolvedValue(token),
      start,
      writeOut,
      writeErr,
      cliPath: "/opt/slamy/dist/cli/index.js",
      executablePath: "/opt/node/bin/node",
    });

    await program.parseAsync([
      "node",
      "slamy",
      "--workspace",
      "wedgeai",
      "--json",
      "auth",
      "session",
      "start",
      "--ttl",
      "7d",
    ]);

    expect(start).toHaveBeenCalledWith(expect.objectContaining({ token, ttlMs: 604_800_000 }));
    expect(JSON.stringify(writeOut.mock.calls)).not.toContain(token);
    expect(writeOut).toHaveBeenCalledWith(expect.stringContaining('"active":true'));
  });

  it("warns for a human-readable 7-day session and formats plain output", async () => {
    const start = vi.fn().mockResolvedValue(status);
    const human = commandHarness({ start });
    await human.program.parseAsync(["node", "slamy", "auth", "session", "start", "--ttl", "7d"]);
    expect(human.writeOut).toHaveBeenCalledWith(expect.stringContaining("Local session started"));
    expect(human.writeErr).toHaveBeenCalledWith(expect.stringContaining("macOS user"));

    const plain = commandHarness({ start });
    await plain.program.parseAsync(["node", "slamy", "--plain", "auth", "session", "start"]);
    expect(plain.writeOut).toHaveBeenCalledWith(
      "wedgeai\tT0BJ9SG2M0R\tuser\t2029-01-01T00:00:00.000Z\t2029-01-08T00:00:00.000Z",
    );
    expect(plain.writeErr).not.toHaveBeenCalled();
  });

  it("uses the in-process broker when foreground mode is requested", async () => {
    const start = vi.fn();
    const startForeground = vi.fn().mockResolvedValue(status);
    const foreground = commandHarness({ start, startForeground } as never);

    await foreground.program.parseAsync([
      "node",
      "slamy",
      "--json",
      "auth",
      "session",
      "start",
      "--ttl",
      "7d",
      "--foreground",
    ]);

    expect(startForeground).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(foreground.writeOut).toHaveBeenCalledWith(expect.stringContaining('"active":true'));
  });

  it("reports inactive and active status in JSON, human, and plain modes", async () => {
    const inactiveJson = commandHarness({ status: vi.fn().mockResolvedValue(undefined) });
    await inactiveJson.program.parseAsync(["node", "slamy", "--json", "auth", "session", "status"]);
    expect(inactiveJson.writeOut).toHaveBeenCalledWith('{"active":false}');

    const inactiveHuman = commandHarness({ status: vi.fn().mockResolvedValue(undefined) });
    await inactiveHuman.program.parseAsync(["node", "slamy", "auth", "session", "status"]);
    expect(inactiveHuman.writeOut).toHaveBeenCalledWith("No active local session");

    const activeHuman = commandHarness({ status: vi.fn().mockResolvedValue(status) });
    await activeHuman.program.parseAsync(["node", "slamy", "auth", "session", "status"]);
    expect(activeHuman.writeOut).toHaveBeenCalledWith(expect.stringContaining("Local session active"));

    const activePlain = commandHarness({ status: vi.fn().mockResolvedValue(status) });
    await activePlain.program.parseAsync(["node", "slamy", "--plain", "auth", "session", "status"]);
    expect(activePlain.writeOut).toHaveBeenCalledWith(expect.stringContaining("wedgeai\tT0BJ9SG2M0R"));
  });

  it("reports revoke outcomes without implying that the Slack token was rotated", async () => {
    const revoked = commandHarness({ revoke: vi.fn().mockResolvedValue(true) });
    await revoked.program.parseAsync(["node", "slamy", "auth", "session", "revoke"]);
    expect(revoked.writeOut).toHaveBeenCalledWith(expect.stringContaining("token itself was not rotated"));

    const missing = commandHarness({ revoke: vi.fn().mockResolvedValue(false) });
    await missing.program.parseAsync(["node", "slamy", "auth", "session", "revoke"]);
    expect(missing.writeOut).toHaveBeenCalledWith("No active local session");

    const json = commandHarness({ revoke: vi.fn().mockResolvedValue(true) });
    await json.program.parseAsync(["node", "slamy", "--json", "auth", "session", "revoke"]);
    expect(json.writeOut).toHaveBeenCalledWith('{"revoked":true}');
  });

  it("normalizes command errors and sets a failing exit code", async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      const failed = commandHarness({ status: vi.fn().mockRejectedValue("non-error rejection") });
      await failed.program.parseAsync(["node", "slamy", "auth", "session", "status"]);
      expect(failed.writeErr).toHaveBeenCalledWith("Error: Local session command failed");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
