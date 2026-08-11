import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import { launchLocalSessionDaemon } from "../local-session-launcher.js";

describe("local session daemon launcher", () => {
  it("passes the token once over stdin and never through argv or the daemon environment", async () => {
    let stdinText = "";
    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        stdinText += chunk.toString();
        callback();
      },
    });
    const stdout = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      stdin,
      stdout,
      pid: 4321,
      unref: vi.fn(),
      kill: vi.fn(),
    });
    const spawnProcess = vi.fn().mockReturnValue(child);
    const token = "xoxp-launch-secret-canary";
    const launching = launchLocalSessionDaemon(
      {
        cliPath: "/opt/slamy/dist/cli/index.js",
        executablePath: "/opt/node/bin/node",
        token,
        configHome: "/private/config",
        connection: {
          version: 1,
          teamId: parseTeamId("T0BJ9SG2M0R"),
          credentialKind: "user",
          socketPath: "/tmp/slamy-501/T0BJ9SG2M0R-user.sock",
          capability: "local-capability-canary",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      },
      spawnProcess,
    );
    stdout.write("READY\n");

    await expect(launching).resolves.toEqual({ pid: 4321 });
    const [, argv, options] = spawnProcess.mock.calls[0];
    expect(JSON.stringify(argv)).not.toContain(token);
    expect(JSON.stringify(options.env)).not.toContain(token);
    expect(stdinText.match(new RegExp(token, "g"))).toHaveLength(1);
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
