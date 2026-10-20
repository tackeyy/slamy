import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import { daemonLoaderArguments, launchLocalSessionDaemon } from "../local-session-launcher.js";

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

describe("daemonLoaderArguments", () => {
  it("keeps the module loader flags that tsx needs to run the source CLI", () => {
    expect(
      daemonLoaderArguments([
        "--require",
        "/n/tsx/dist/preflight.cjs",
        "--import",
        "file:///n/tsx/dist/loader.mjs",
      ]),
    ).toEqual([
      "--require",
      "/n/tsx/dist/preflight.cjs",
      "--import",
      "file:///n/tsx/dist/loader.mjs",
    ]);
    expect(daemonLoaderArguments(["--import=tsx", "-r", "a.cjs", "--loader", "x.mjs"])).toEqual([
      "--import=tsx",
      "-r",
      "a.cjs",
      "--loader",
      "x.mjs",
    ]);
  });

  it("drops debugger, eval and unknown flags so the daemon holding the token cannot be inspected", () => {
    expect(
      daemonLoaderArguments([
        "--inspect",
        "--inspect-brk=9229",
        "--inspect-port",
        "9230",
        "--debug-port=1",
        "--eval",
        "x",
        "-e",
        "y",
        "--print",
        "--expose-gc",
        "--require",
        "a.cjs",
      ]),
    ).toEqual(["--require", "a.cjs"]);
  });

  it("drops a loader flag whose value is missing or is another flag", () => {
    expect(daemonLoaderArguments(["--import"])).toEqual([]);
    expect(daemonLoaderArguments(["--import", "--inspect"])).toEqual([]);
    expect(daemonLoaderArguments(["--import="])).toEqual([]);
    expect(daemonLoaderArguments([])).toEqual([]);
  });

  it("passes the loader flags before the CLI path when spawning", async () => {
    const stdout = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout,
      pid: 1,
      unref: vi.fn(),
      kill: vi.fn(),
    });
    const spawnProcess = vi.fn().mockReturnValue(child);
    const launching = launchLocalSessionDaemon(
      {
        cliPath: "/opt/slamy/src/cli/index.ts",
        executablePath: "/opt/node/bin/node",
        execArgv: ["--inspect", "--import", "file:///tsx/loader.mjs"],
        token: "xoxp-t",
        configHome: "/c",
        connection: {
          version: 1,
          teamId: parseTeamId("T0BJ9SG2M0R"),
          credentialKind: "user",
          socketPath: "/tmp/s.sock",
          capability: "cap",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      },
      spawnProcess,
    );
    stdout.write("READY\n");
    await launching;
    expect(spawnProcess.mock.calls[0][1]).toEqual([
      "--import",
      "file:///tsx/loader.mjs",
      "/opt/slamy/src/cli/index.ts",
      "__session-daemon",
    ]);
  });
});
