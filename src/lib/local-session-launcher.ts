import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { LocalSessionConnection } from "./local-session-web-client.js";

const START_TIMEOUT_MS = 10_000;

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export async function launchLocalSessionDaemon(
  input: {
    readonly cliPath: string;
    readonly executablePath: string;
    readonly token: string;
    readonly configHome: string;
    readonly connection: LocalSessionConnection;
  },
  spawnProcess: SpawnProcess = spawn,
): Promise<{ readonly pid: number }> {
  const child = spawnProcess(input.executablePath, [input.cliPath, "__session-daemon"], {
    detached: true,
    stdio: ["pipe", "pipe", "ignore"],
    env: safeDaemonEnvironment(process.env),
  });
  if (!child.stdin || !child.stdout) {
    child.kill();
    throw new Error("Local session daemon did not provide secure pipes");
  }

  const ready = waitForReady(child);
  child.stdin.end(
    `${JSON.stringify({
      version: 1,
      token: input.token,
      configHome: input.configHome,
      connection: input.connection,
    })}\n`,
  );
  await ready;
  const pid = child.pid;
  if (!pid) {
    child.kill();
    throw new Error("Local session daemon did not start");
  }
  child.stdout.destroy();
  child.unref();
  return Object.freeze({ pid });
}

function waitForReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const stdout = child.stdout!;
    let output = "";
    const timeout = setTimeout(() => fail(), START_TIMEOUT_MS);
    timeout.unref();
    const onData = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (output.length > 64 || !output.includes("\n")) return;
      if (output.slice(0, output.indexOf("\n")) !== "READY") return fail();
      cleanup();
      resolve();
    };
    const onExit = () => fail();
    const onError = () => fail();
    const fail = () => {
      cleanup();
      child.kill();
      reject(new Error("Local session daemon failed to start"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stdout.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    stdout.on("data", onData);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function safeDaemonEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...(env.LANG ? { LANG: env.LANG } : {}),
    ...(env.LC_ALL ? { LC_ALL: env.LC_ALL } : {}),
    ...(env.TZ ? { TZ: env.TZ } : {}),
  };
}
