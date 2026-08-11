import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createConnection } from "node:net";
import { parseTeamId } from "../../domain/team-id.js";
import {
  callLocalSessionBroker,
  revokeLocalSessionBroker,
  startLocalSessionBroker,
  type RunningLocalSessionBroker,
} from "../local-session-broker.js";
import { prepareLocalSessionPaths } from "../local-session-files.js";

const tempPaths: string[] = [];
const brokers: RunningLocalSessionBroker[] = [];

afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local session broker", () => {
  it("executes an allowlisted method over an owner-only socket without returning the token", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-broker-"));
    const runtimeRoot = await mkdtemp("/tmp/slamy-sb-");
    tempPaths.push(root, runtimeRoot);
    const paths = await prepareLocalSessionPaths({
      configHome: root,
      runtimeRoot,
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
    });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: paths.socketPath,
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-02T00:00:00.000Z",
    };
    const apiCall = vi.fn().mockResolvedValue({ ok: true, ts: "1.000001" });
    const broker = await startLocalSessionBroker({
      paths,
      connection,
      token: "xoxp-secret-canary",
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      invokeSlack: apiCall,
    });
    brokers.push(broker);

    const response = await callLocalSessionBroker(connection, "chat.postMessage", {
      channel: "C1",
      text: "hello",
    });

    expect(response).toEqual({ ok: true, ts: "1.000001" });
    expect(apiCall).toHaveBeenCalledWith("xoxp-secret-canary", "chat.postMessage", {
      channel: "C1",
      text: "hello",
    });
    expect(JSON.stringify(response)).not.toContain("secret-canary");
    expect((await stat(paths.socketPath)).mode & 0o777).toBe(0o600);
  });

  it("survives a client that disconnects before the response is written", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-abort-"));
    const runtimeRoot = await mkdtemp("/tmp/slamy-sa-");
    tempPaths.push(root, runtimeRoot);
    const paths = await prepareLocalSessionPaths({
      configHome: root,
      runtimeRoot,
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
    });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: paths.socketPath,
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-02T00:00:00.000Z",
    };
    const apiCall = vi.fn().mockResolvedValue({ ok: true, ts: "1.000001" });
    const broker = await startLocalSessionBroker({
      paths,
      connection,
      token: "xoxp-secret-canary",
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      invokeSlack: apiCall,
    });
    brokers.push(broker);

    // 改行を送らず write 側を閉じるクライアント: broker は readable 'end' 後に
    // エラー応答を書こうとして ERR_STREAM_WRITE_AFTER_END で crash してはならない
    const probe = createConnection(paths.socketPath);
    await once(probe, "connect");
    probe.end();
    await once(probe, "close");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // リクエスト送信後すぐ half-close するクライアントでも crash しない
    const halfClose = createConnection(paths.socketPath);
    await once(halfClose, "connect");
    halfClose.resume();
    halfClose.end(
      `${JSON.stringify({
        version: 1,
        action: "call",
        capability: connection.capability,
        teamId: connection.teamId,
        method: "chat.postMessage",
        argumentsValue: { channel: "C1", text: "hello" },
      })}\n`,
    );
    await once(halfClose, "close");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // broker が生存していれば通常のリクエストは引き続き成功する
    const response = await callLocalSessionBroker(connection, "chat.postMessage", {
      channel: "C1",
      text: "hello",
    });
    expect(response).toEqual({ ok: true, ts: "1.000001" });
  });

  it("revokes access and removes the socket and metadata before returning", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-revoke-"));
    const runtimeRoot = await mkdtemp("/tmp/slamy-sr-");
    tempPaths.push(root, runtimeRoot);
    const paths = await prepareLocalSessionPaths({
      configHome: root,
      runtimeRoot,
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
    });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: paths.socketPath,
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-02T00:00:00.000Z",
    };
    const broker = await startLocalSessionBroker({
      paths,
      connection,
      token: "xoxp-secret-canary",
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      invokeSlack: vi.fn(),
    });
    brokers.push(broker);
    const idleSocket = createConnection(paths.socketPath);
    await once(idleSocket, "connect");
    const idleClosed = once(idleSocket, "close");

    await revokeLocalSessionBroker(connection);

    await idleClosed;
    await expect(stat(paths.socketPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(paths.metadataPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a conflicting workspace argument before invoking Slack", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-team-"));
    const runtimeRoot = await mkdtemp("/tmp/slamy-st-");
    tempPaths.push(root, runtimeRoot);
    const paths = await prepareLocalSessionPaths({
      configHome: root,
      runtimeRoot,
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
    });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: paths.socketPath,
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-02T00:00:00.000Z",
    };
    const invokeSlack = vi.fn();
    const broker = await startLocalSessionBroker({
      paths,
      connection,
      token: "xoxp-secret-canary",
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      invokeSlack,
    });
    brokers.push(broker);

    await expect(
      callLocalSessionBroker(connection, "conversations.list", { team_id: "TOTHER001" }),
    ).rejects.toThrow("failed");
    expect(invokeSlack).not.toHaveBeenCalled();
  });

  it("binds the selected Team ID and rejects invalid, expired, and unauthorized calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-boundary-"));
    const runtimeRoot = await mkdtemp("/tmp/slamy-sx-");
    tempPaths.push(root, runtimeRoot);
    const paths = await prepareLocalSessionPaths({
      configHome: root,
      runtimeRoot,
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
    });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: paths.socketPath,
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-02T00:00:00.000Z",
    };
    const invokeSlack = vi.fn().mockResolvedValue({ ok: true });
    const broker = await startLocalSessionBroker({
      paths,
      connection,
      token: "xoxp-secret-canary",
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      invokeSlack,
    });
    brokers.push(broker);

    await expect(callLocalSessionBroker(connection, "team.info", {})).resolves.toEqual({ ok: true });
    expect(invokeSlack).toHaveBeenLastCalledWith("xoxp-secret-canary", "team.info", {
      team: "T0BJ9SG2M0R",
    });
    await expect(callLocalSessionBroker(connection, "users.list", {
      team_id: "T0BJ9SG2M0R",
    })).resolves.toEqual({ ok: true });
    expect(invokeSlack).toHaveBeenLastCalledWith("xoxp-secret-canary", "users.list", {
      team_id: "T0BJ9SG2M0R",
    });
    await expect(callLocalSessionBroker(connection, "admin.users.list", {})).rejects.toThrow("not allowed");
    await expect(callLocalSessionBroker({
      ...connection,
      expiresAt: "2020-12-31T23:59:59.000Z",
    }, "team.info", {})).rejects.toThrow("expired");
    await expect(callLocalSessionBroker({
      ...connection,
      capability: "wrong-capability",
    }, "team.info", {})).rejects.toThrow("failed");

    await broker.close();
    await broker.close();
  });

  it("refuses to start an already expired broker", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-expired-"));
    const runtimeRoot = await mkdtemp("/tmp/slamy-se-");
    tempPaths.push(root, runtimeRoot);
    const paths = await prepareLocalSessionPaths({
      configHome: root,
      runtimeRoot,
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
    });
    await expect(startLocalSessionBroker({
      paths,
      connection: {
        version: 1,
        teamId: parseTeamId("T0BJ9SG2M0R"),
        credentialKind: "user",
        socketPath: paths.socketPath,
        capability: "local-capability-canary",
        createdAt: "2029-01-01T00:00:00.000Z",
        expiresAt: "2029-01-01T00:00:00.000Z",
      },
      token: "xoxp-secret-canary",
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      invokeSlack: vi.fn(),
    })).rejects.toThrow("already expired");
  });
});
