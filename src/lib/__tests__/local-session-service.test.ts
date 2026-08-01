import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTeamId } from "../../domain/team-id.js";
import {
  getLocalSessionStatus,
  publicStatus,
  revokeLocalSession,
  startLocalSession,
} from "../local-session-service.js";

const userWorkspace = {
  teamId: parseTeamId("T0BJ9SG2M0R"),
  alias: "wedgeai",
  domain: "wedgeai.slack.com",
  previousDomains: [],
  displayName: "WedgeAI",
  credentialRefs: { user: { provider: "environment" as const, name: "WEDGE_TOKEN" } },
};

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local session service", () => {
  it("rejects a token from another Team ID before launching a daemon and redacts errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-service-"));
    tempPaths.push(root);
    const launch = vi.fn();
    const token = "xoxp-cross-team-secret-canary";

    await expect(
      startLocalSession(
        {
          workspace: {
            teamId: parseTeamId("T0BJ9SG2M0R"),
            alias: "wedgeai",
            domain: "wedgeai.slack.com",
            previousDomains: [],
            displayName: "WedgeAI",
            credentialRefs: { user: { provider: "environment", name: "WEDGE_TOKEN" } },
          },
          token,
          ttlMs: 24 * 60 * 60 * 1000,
          configHome: root,
          cliPath: "/opt/slamy/dist/cli/index.js",
          executablePath: "/opt/node/bin/node",
        },
        {
          verify: vi.fn().mockResolvedValue({
            teamId: parseTeamId("TOTHER001"),
            userId: "U1",
          }),
          launch,
          now: () => new Date("2029-01-01T00:00:00.000Z"),
          capability: () => "local-capability-canary",
        },
      ),
    ).rejects.not.toThrow(token);
    expect(launch).not.toHaveBeenCalled();
  });

  it("rejects Enterprise org tokens whose access can span workspaces", async () => {
    const launch = vi.fn();
    const token = "xoxe.xoxp-org-secret-canary";
    await expect(
      startLocalSession(
        {
          workspace: {
            teamId: parseTeamId("T0BJ9SG2M0R"),
            alias: "wedgeai",
            domain: "wedgeai.slack.com",
            previousDomains: [],
            displayName: "WedgeAI",
            credentialRefs: { user: { provider: "environment", name: "WEDGE_TOKEN" } },
          },
          token,
          ttlMs: 86_400_000,
          configHome: "/private/config",
          cliPath: "/opt/slamy/dist/cli/index.js",
          executablePath: "/opt/node/bin/node",
        },
        {
          verify: vi.fn().mockResolvedValue({
            teamId: parseTeamId("T0BJ9SG2M0R"),
            userId: "U1",
          }),
          launch,
          now: () => new Date("2029-01-01T00:00:00.000Z"),
          capability: () => "local-capability-canary",
        },
      ),
    ).rejects.toThrow("Enterprise org tokens");
    expect(launch).not.toHaveBeenCalled();
  });

  it("verifies, launches, and returns only public status for a matching user token", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-service-"));
    tempPaths.push(root);
    const verify = vi.fn().mockResolvedValue({
      teamId: parseTeamId("T0BJ9SG2M0R"),
      userId: "U1",
    });
    const launch = vi.fn().mockResolvedValue(undefined);

    const result = await startLocalSession(
      {
        workspace: userWorkspace,
        token: "xoxp-user-secret-canary",
        ttlMs: 86_400_000,
        configHome: root,
        cliPath: "/opt/slamy/dist/cli/index.js",
        executablePath: "/opt/node/bin/node",
      },
      {
        verify,
        launch,
        now: () => new Date("2029-01-01T00:00:00.000Z"),
        capability: () => "local-capability-canary",
      },
    );

    expect(result).toEqual({
      workspace: "wedgeai",
      teamId: "T0BJ9SG2M0R",
      credentialKind: "user",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-02T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("capability");
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      token: "xoxp-user-secret-canary",
      connection: expect.objectContaining({ capability: "local-capability-canary" }),
    }));
  });

  it.each([0, -1, 604_800_001, 1.5, Number.NaN])("rejects invalid TTL %s", async (ttlMs) => {
    await expect(startLocalSession({
      workspace: userWorkspace,
      token: "xoxp-user-secret-canary",
      ttlMs,
      configHome: "/private/config",
      cliPath: "/opt/slamy/dist/cli/index.js",
      executablePath: "/opt/node/bin/node",
    })).rejects.toThrow("between 1 millisecond and 7 days");
  });

  it("normalizes verifier failures and rejects a bot-shaped identity for a user session", async () => {
    const input = {
      workspace: userWorkspace,
      token: "xoxp-user-secret-canary",
      ttlMs: 86_400_000,
      configHome: "/private/config",
      cliPath: "/opt/slamy/dist/cli/index.js",
      executablePath: "/opt/node/bin/node",
    };
    await expect(startLocalSession(input, {
      verify: vi.fn().mockRejectedValue(new Error("secret upstream detail")),
      launch: vi.fn(),
      now: () => new Date(),
      capability: () => "capability",
    })).rejects.toThrow("identity verification failed");
    await expect(startLocalSession(input, {
      verify: vi.fn().mockResolvedValue({
        teamId: parseTeamId("T0BJ9SG2M0R"),
        userId: "U1",
        botId: "B1",
      }),
      launch: vi.fn(),
      now: () => new Date(),
      capability: () => "capability",
    })).rejects.toThrow("does not match");
  });

  it("publishes bot status without connection secrets", () => {
    const status = publicStatus({
      ...userWorkspace,
      credentialRefs: { bot: { provider: "environment", name: "BOT_TOKEN" } },
    }, {
      version: 1,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "bot",
      socketPath: "/private/session.sock",
      capability: "capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2029-01-02T00:00:00.000Z",
    });
    expect(status).toEqual(expect.objectContaining({ credentialKind: "bot" }));
    expect(JSON.stringify(status)).not.toContain("capability-canary");
  });

  it("returns inactive status and revoke results for isolated user and bot stores", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-inactive-"));
    tempPaths.push(root);
    await expect(getLocalSessionStatus(userWorkspace, root)).resolves.toBeUndefined();
    await expect(revokeLocalSession({
      ...userWorkspace,
      credentialRefs: { bot: { provider: "environment", name: "BOT_TOKEN" } },
    }, root)).resolves.toBe(false);
  });

  it("starts a matching bot session and rejects a user-shaped identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-session-bot-"));
    tempPaths.push(root);
    const botWorkspace = {
      ...userWorkspace,
      credentialRefs: { bot: { provider: "environment" as const, name: "BOT_TOKEN" } },
    };
    const input = {
      workspace: botWorkspace,
      token: "xoxb-bot-secret-canary",
      ttlMs: 86_400_000,
      configHome: root,
      cliPath: "/opt/slamy/dist/cli/index.js",
      executablePath: "/opt/node/bin/node",
    };
    await expect(startLocalSession(input, {
      verify: vi.fn().mockResolvedValue({
        teamId: parseTeamId("T0BJ9SG2M0R"),
        userId: "U1",
        botId: "B1",
      }),
      launch: vi.fn().mockResolvedValue(undefined),
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      capability: () => "local-capability-canary",
    })).resolves.toMatchObject({ credentialKind: "bot" });
    await expect(startLocalSession(input, {
      verify: vi.fn().mockResolvedValue({
        teamId: parseTeamId("T0BJ9SG2M0R"),
        userId: "U1",
      }),
      launch: vi.fn(),
      now: () => new Date("2029-01-01T00:00:00.000Z"),
      capability: () => "local-capability-canary",
    })).rejects.toThrow("does not match");
  });

  it("rejects mixed User and Bot credential workspaces instead of reusing one token for both", async () => {
    const launch = vi.fn();
    await expect(
      startLocalSession(
        {
          workspace: {
            teamId: parseTeamId("T0BJ9SG2M0R"),
            alias: "wedgeai",
            domain: "wedgeai.slack.com",
            previousDomains: [],
            displayName: "WedgeAI",
            credentialRefs: {
              user: { provider: "environment", name: "WEDGE_USER_TOKEN" },
              bot: { provider: "environment", name: "WEDGE_BOT_TOKEN" },
            },
          },
          token: "xoxp-user-secret-canary",
          ttlMs: 86_400_000,
          configHome: "/private/config",
          cliPath: "/opt/slamy/dist/cli/index.js",
          executablePath: "/opt/node/bin/node",
        },
        {
          verify: vi.fn(),
          launch,
          now: () => new Date("2029-01-01T00:00:00.000Z"),
          capability: () => "local-capability-canary",
        },
      ),
    ).rejects.toThrow("exactly one credential kind");
    expect(launch).not.toHaveBeenCalled();
  });
});
