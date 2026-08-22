import { describe, expect, it, vi } from "vitest";
import { createLocalSessionWebClient } from "../local-session-web-client.js";
import { parseTeamId } from "../../domain/team-id.js";

describe("local session Web API client", () => {
  it("brokers an allowlisted Slack operation without exposing a token", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, ts: "1.000001" });
    const client = createLocalSessionWebClient(
      {
        version: 1,
        teamId: parseTeamId("T0BJ9SG2M0R"),
        credentialKind: "user",
        socketPath: "/private/session.sock",
        capability: "local-capability-canary",
        createdAt: "2029-01-01T00:00:00.000Z",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
      request,
    );

    await client.chat.postMessage({ channel: "C1", text: "hello" });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "T0BJ9SG2M0R" }),
      "chat.postMessage",
      { channel: "C1", text: "hello" },
    );
    expect(JSON.stringify(request.mock.calls)).not.toMatch(/xox[bp]-/);
  });

  it("rejects methods outside slamy's broker allowlist before IPC", async () => {
    const request = vi.fn();
    const client = createLocalSessionWebClient(
      {
        version: 1,
        teamId: parseTeamId("T0BJ9SG2M0R"),
        credentialKind: "user",
        socketPath: "/private/session.sock",
        capability: "local-capability-canary",
        createdAt: "2029-01-01T00:00:00.000Z",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
      request,
    );

    await expect(client.admin.users.remove({ team_id: "T1", user_id: "U1" })).rejects.toThrow(
      "not allowed",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("allows conversations.invite through the local session", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: "/private/session.sock",
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
    };
    const client = createLocalSessionWebClient(connection, request);

    await client.conversations.invite({ channel: "C0123ABC", users: "U00000001" });

    expect(request).toHaveBeenCalledWith(connection, "conversations.invite", {
      channel: "C0123ABC",
      users: "U00000001",
    });
  });
});
