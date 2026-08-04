import { timingSafeEqual } from "node:crypto";
import { chmod, rm } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { LogLevel, WebClient } from "@slack/web-api";
import type { LocalSessionPaths } from "./local-session-files.js";
import { writeLocalSessionConnection } from "./local-session-files.js";
import { decodeLocalSessionValue, encodeLocalSessionValue } from "./local-session-codec.js";
import {
  isAllowedLocalSessionMethod,
  type LocalSessionConnection,
} from "./local-session-web-client.js";

const MAX_MESSAGE_BYTES = 32 * 1024 * 1024;
const MAX_CONCURRENT_CONNECTIONS = 4;
const REQUEST_TIMEOUT_MS = 30_000;

export type LocalSessionSlackInvoker = (
  token: string,
  method: string,
  argumentsValue: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export type RunningLocalSessionBroker = {
  close(): Promise<void>;
};

export async function invokeSlackWebApi(
  token: string,
  method: string,
  argumentsValue: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  if (!isAllowedLocalSessionMethod(method)) {
    throw new Error("Slack API method is not allowed in a local session");
  }
  if (method === "files.download") {
    return downloadSlackFile(token, argumentsValue);
  }
  const client = new WebClient(token, {
    rejectRateLimitedCalls: true,
    retryConfig: { retries: 0 },
    timeout: REQUEST_TIMEOUT_MS,
    logLevel: LogLevel.ERROR,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
      setLevel() {},
      getLevel: () => LogLevel.ERROR,
      setName() {},
    },
  });
  const segments = method.split(".");
  let parent: unknown = client;
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(parent)) throw new Error("Slack API method is unavailable");
    parent = parent[segment];
  }
  const finalSegment = segments.at(-1);
  if (!finalSegment || !isRecord(parent) || typeof parent[finalSegment] !== "function") {
    throw new Error("Slack API method is unavailable");
  }
  return Reflect.apply(parent[finalSegment] as (...args: unknown[]) => unknown, parent, [
    argumentsValue,
  ]);
}

async function downloadSlackFile(
  token: string,
  argumentsValue: Readonly<Record<string, unknown>>,
): Promise<{ readonly status: number; readonly headers: Record<string, string>; readonly body: Buffer }> {
  if (typeof argumentsValue.url !== "string") throw new Error("Invalid Slack file URL");
  let url = new URL(argumentsValue.url);
  if (url.protocol !== "https:" || url.hostname !== "files.slack.com") {
    throw new Error("Invalid Slack file URL");
  }
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetch(url, {
      headers: isSlackOwnedHost(url.hostname) ? { Authorization: `Bearer ${token}` } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) break;
    url = new URL(location, url);
    if (url.protocol !== "https:") throw new Error("Unsafe Slack file redirect");
  }
  if (!response?.ok) throw new Error("Slack file download failed");
  const body = await readResponseBody(response, MAX_MESSAGE_BYTES / 2);
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

async function readResponseBody(response: Response, limit: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error("Slack file is too large for local session IPC");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Slack file is too large for local session IPC");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, size);
}

function isSlackOwnedHost(hostname: string): boolean {
  return (
    hostname === "slack.com" ||
    hostname.endsWith(".slack.com") ||
    hostname === "slack-files.com" ||
    hostname.endsWith(".slack-files.com")
  );
}

export async function startLocalSessionBroker(input: {
  readonly paths: LocalSessionPaths;
  readonly connection: LocalSessionConnection;
  readonly token: string;
  readonly invokeSlack: LocalSessionSlackInvoker;
  readonly now?: () => Date;
  readonly onRevoked?: () => void;
}): Promise<RunningLocalSessionBroker> {
  const now = input.now ?? (() => new Date());
  if (Date.parse(input.connection.expiresAt) <= now().getTime()) {
    throw new Error("Local session is already expired");
  }
  let closed = false;
  let revoking = false;
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    if (revoking || sockets.size >= MAX_CONCURRENT_CONNECTIONS) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    // クライアントが応答前に切断すると writable 側が自動 end される。error リスナーが
    // ないと後続の end() が ERR_STREAM_WRITE_AFTER_END で broker プロセスごと落ちる
    socket.on("error", () => socket.destroy());
    const respond = (payload: string, onDone?: () => void): void => {
      if (socket.destroyed || socket.writableEnded) {
        socket.destroy();
        onDone?.();
        return;
      }
      socket.end(payload, onDone);
    };
    receiveLine(socket)
      .then((line) => handleRequest(line, input, now, () => revoking))
      .then(
        async (result) => {
          if (result.revoke) {
            revoking = true;
            clearTimeout(expiryTimer);
            server.close();
            for (const activeSocket of sockets) {
              if (activeSocket !== socket) activeSocket.destroy();
            }
            await Promise.all([
              rm(input.paths.socketPath, { force: true }),
              rm(input.paths.metadataPath, { force: true }),
            ]);
          }
          respond(
            `${JSON.stringify({ ok: true, value: encodeLocalSessionValue(result.value) })}\n`,
            () => {
              if (result.revoke) {
                closed = true;
                input.onRevoked?.();
              }
            },
          );
        },
        () => respond(`${JSON.stringify({ ok: false, error: "Local session request failed" })}\n`),
      );
  });

  await listen(server, input.paths.socketPath);
  try {
    await chmod(input.paths.socketPath, 0o600);
    await writeLocalSessionConnection(input.paths, input.connection);
  } catch (error) {
    await closeServer(server, sockets);
    await rm(input.paths.socketPath, { force: true });
    throw error;
  }

  const remainingMs = Date.parse(input.connection.expiresAt) - now().getTime();
  const expiryTimer = setTimeout(() => void close(), Math.min(remainingMs, 2_147_483_647));
  expiryTimer.unref();

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    clearTimeout(expiryTimer);
    await closeServer(server, sockets);
    await Promise.all([
      rm(input.paths.socketPath, { force: true }),
      rm(input.paths.metadataPath, { force: true }),
    ]);
  };

  return Object.freeze({ close });
}

export async function callLocalSessionBroker(
  connection: LocalSessionConnection,
  method: string,
  argumentsValue: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  if (!isAllowedLocalSessionMethod(method)) {
    throw new Error("Slack API method is not allowed in a local session");
  }
  if (Date.parse(connection.expiresAt) <= Date.now()) {
    throw new Error("Local session has expired");
  }
  const request = JSON.stringify({
    version: 1,
    action: "call",
    capability: connection.capability,
    teamId: connection.teamId,
    method,
    argumentsValue: encodeLocalSessionValue(argumentsValue),
  });
  const responseLine = await exchangeLine(connection.socketPath, request);
  let response: unknown;
  try {
    response = JSON.parse(responseLine);
  } catch {
    throw new Error("Local session returned an invalid response");
  }
  if (!isRecord(response) || response.ok !== true || !("value" in response)) {
    throw new Error("Local session request failed");
  }
  return decodeLocalSessionValue(response.value as never);
}

export async function revokeLocalSessionBroker(
  connection: LocalSessionConnection,
): Promise<void> {
  const responseLine = await exchangeLine(
    connection.socketPath,
    JSON.stringify({
      version: 1,
      action: "revoke",
      capability: connection.capability,
      teamId: connection.teamId,
    }),
  );
  let response: unknown;
  try {
    response = JSON.parse(responseLine);
  } catch {
    throw new Error("Local session returned an invalid response");
  }
  if (!isRecord(response) || response.ok !== true) {
    throw new Error("Local session revoke failed");
  }
}

async function handleRequest(
  line: string,
  input: {
    readonly connection: LocalSessionConnection;
    readonly token: string;
    readonly invokeSlack: LocalSessionSlackInvoker;
  },
  now: () => Date,
  isRevoking: () => boolean,
): Promise<{ readonly value: unknown; readonly revoke: boolean }> {
  if (isRevoking()) throw new Error("revoked");
  if (Date.parse(input.connection.expiresAt) <= now().getTime()) {
    throw new Error("expired");
  }
  const request = JSON.parse(line) as unknown;
  if (
    !isRecord(request) ||
    request.version !== 1 ||
    (request.action !== "call" && request.action !== "revoke") ||
    typeof request.capability !== "string" ||
    !sameSecret(request.capability, input.connection.capability) ||
    request.teamId !== input.connection.teamId ||
    (request.action === "call" &&
      (typeof request.method !== "string" ||
        !isAllowedLocalSessionMethod(request.method) ||
        !("argumentsValue" in request)))
  ) {
    throw new Error("invalid request");
  }
  if (request.action === "revoke") return { value: { revoked: true }, revoke: true };
  const argumentsValue = decodeLocalSessionValue(request.argumentsValue as never);
  if (!isRecord(argumentsValue)) throw new Error("invalid arguments");
  const boundArguments = bindWorkspaceArguments(
    request.method as string,
    argumentsValue,
    input.connection.teamId,
  );
  return {
    value: await input.invokeSlack(input.token, request.method as string, boundArguments),
    revoke: false,
  };
}

const WORKSPACE_ARGUMENTS = new Map<string, "team" | "team_id">([
  ["team.info", "team"],
  ["conversations.list", "team_id"],
  ["conversations.create", "team_id"],
  ["search.messages", "team_id"],
  ["users.conversations", "team_id"],
  ["users.info", "team_id"],
  ["users.list", "team_id"],
]);

function bindWorkspaceArguments(
  method: string,
  argumentsValue: Readonly<Record<string, unknown>>,
  teamId: string,
): Readonly<Record<string, unknown>> {
  for (const name of ["team", "team_id"] as const) {
    const supplied = argumentsValue[name];
    if (supplied !== undefined && supplied !== teamId) {
      throw new Error("workspace mismatch");
    }
  }
  const requiredArgument = WORKSPACE_ARGUMENTS.get(method);
  return Object.freeze({
    ...argumentsValue,
    ...(requiredArgument ? { [requiredArgument]: teamId } : {}),
  });
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(socketPath);
  });
}

function exchangeLine(socketPath: string, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    socket.setTimeout(REQUEST_TIMEOUT_MS);
    const onFailure = () => {
      socket.destroy();
      reject(new Error("Local session broker is unavailable"));
    };
    socket.once("error", onFailure);
    socket.once("timeout", onFailure);
    socket.once("connect", () => socket.write(`${line}\n`));
    receiveLine(socket).then(
      (response) => {
        socket.destroy();
        resolve(response);
      },
      () => onFailure(),
    );
  });
}

function receiveLine(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_MESSAGE_BYTES) {
        cleanup();
        reject(new Error("Local session IPC message is too large"));
        return;
      }
      const newline = chunk.indexOf(0x0a);
      if (newline === -1) {
        chunks.push(chunk);
        return;
      }
      chunks.push(chunk.subarray(0, newline));
      cleanup();
      socket.setTimeout(0);
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("Local session IPC message ended early"));
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("end", onEnd);
    };
    socket.on("data", onData);
    socket.once("end", onEnd);
  });
}

async function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function sameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
