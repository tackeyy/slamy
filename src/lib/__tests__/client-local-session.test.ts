import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";

const callLocalSessionBroker = vi.fn();

vi.mock("../local-session-broker.js", () => ({ callLocalSessionBroker }));

const { SlamyClient } = await import("../client.js");

describe("SlamyClient local session", () => {
  beforeEach(() => callLocalSessionBroker.mockReset());

  it("routes existing client methods through the local broker without a Slack token", async () => {
    callLocalSessionBroker.mockResolvedValue({
      ok: true,
      user_id: "U1",
      user: "t",
      team_id: "T0BJ9SG2M0R",
      team: "Wedge AI, Inc.",
      url: "https://wedgeai.slack.com/",
    });
    const client = new SlamyClient({
      localSession: {
        version: 1,
        teamId: parseTeamId("T0BJ9SG2M0R"),
        credentialKind: "user",
        socketPath: "/private/session.sock",
        capability: "local-capability-canary",
        createdAt: "2029-01-01T00:00:00.000Z",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    });

    await expect(client.authTest()).resolves.toMatchObject({ team_id: "T0BJ9SG2M0R" });
    expect(callLocalSessionBroker).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "T0BJ9SG2M0R" }),
      "auth.test",
      {},
    );
  });

  it("downloads private Slack files through the broker without an empty bearer token", async () => {
    callLocalSessionBroker.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/plain" },
      body: Buffer.from("private-file"),
    });
    const client = new SlamyClient({
      localSession: {
        version: 1,
        teamId: parseTeamId("T0BJ9SG2M0R"),
        credentialKind: "user",
        socketPath: "/private/session.sock",
        capability: "local-capability-canary",
        createdAt: "2029-01-01T00:00:00.000Z",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    });

    const response = await client.downloadFileStream(
      "https://files.slack.com/files-pri/T1/private.txt",
    );

    await expect(response.text()).resolves.toBe("private-file");
    expect(callLocalSessionBroker).toHaveBeenCalledWith(
      expect.anything(),
      "files.download",
      { url: "https://files.slack.com/files-pri/T1/private.txt" },
    );
  });
});
