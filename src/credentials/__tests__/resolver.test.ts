import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import type { WorkspaceRecord } from "../../domain/workspace.js";
import type { AuthIdentity, AuthVerifier } from "../auth-verifier.js";
import { CredentialError } from "../errors.js";
import type { CredentialProvider, CredentialReference } from "../provider.js";
import { CredentialResolver } from "../resolver.js";
import type { CredentialSecret } from "../secret.js";

const userToken = "xoxp-user-secret-canary";
const botToken = "xoxb-bot-secret-canary";

class FakeProvider implements CredentialProvider {
  readonly providerId = "environment";
  readonly requested: string[][] = [];

  constructor(readonly values: Readonly<Record<string, string | undefined>>) {}

  resolveMany(references: readonly CredentialReference[]) {
    this.requested.push(references.map((reference) => reference.name));
    return Promise.resolve(
      new Map(references.map((reference) => [reference.name, this.values[reference.name]])),
    );
  }
}

class FakeVerifier implements AuthVerifier {
  readonly verified: string[] = [];

  constructor(readonly identities: Readonly<Record<string, AuthIdentity | Error>>) {}

  verify(secret: CredentialSecret): Promise<AuthIdentity> {
    return secret.use((token) => {
      this.verified.push(token);
      const result = this.identities[token];
      if (result instanceof Error) throw result;
      if (!result) throw new Error(`missing fake identity for ${token}`);
      return Promise.resolve(result);
    });
  }
}

function workspace(credentialRefs: WorkspaceRecord["credentialRefs"]): WorkspaceRecord {
  return {
    teamId: parseTeamId("T00000001"),
    alias: "primary",
    domain: "primary.slack.com",
    previousDomains: [],
    displayName: "Primary",
    ...(credentialRefs ? { credentialRefs } : {}),
  };
}

describe("CredentialResolver workspace mode", () => {
  it("resolves and verifies the complete configured set atomically", async () => {
    const provider = new FakeProvider({ USER_REF: userToken, BOT_REF: botToken });
    const verifier = new FakeVerifier({
      [userToken]: { teamId: parseTeamId("T00000001"), userId: "U1" },
      [botToken]: { teamId: parseTeamId("T00000001"), userId: "U2", botId: "B1" },
    });
    const resolver = new CredentialResolver([provider], verifier);

    const result = await resolver.resolveForWorkspace(
      workspace({
        user: { provider: "environment", name: "USER_REF" },
        bot: { provider: "environment", name: "BOT_REF" },
      }),
      { requiredKinds: ["user"], requiredScopes: { user: ["search:read"] } },
    );

    expect(result.teamId).toBe("T00000001");
    expect(result.user?.use((token) => token)).toBe(userToken);
    expect(result.bot?.use((token) => token)).toBe(botToken);
    expect(result.requiredScopes).toEqual({ user: ["search:read"] });
    expect(provider.requested).toEqual([["USER_REF", "BOT_REF"]]);
    expect(verifier.verified).toEqual([userToken, botToken]);
    expect(JSON.stringify(result)).not.toContain("secret-canary");
  });

  it("does not substitute Bot or legacy tokens for a required User token", async () => {
    const provider = new FakeProvider({
      BOT_REF: botToken,
      SLACK_USER_TOKEN: userToken,
    });
    const resolver = new CredentialResolver(
      [provider],
      new FakeVerifier({
        [botToken]: { teamId: parseTeamId("T00000001"), botId: "B1" },
      }),
    );

    await expect(
      resolver.resolveForWorkspace(
        workspace({ bot: { provider: "environment", name: "BOT_REF" } }),
        { requiredKinds: ["user"], operation: "search.messages" },
      ),
    ).rejects.toMatchObject({ code: "REQUIRED_CREDENTIAL_MISSING" });
    expect(provider.requested).toEqual([["BOT_REF"]]);
  });

  it.each([
    { requiredKinds: [] },
    { requiredKinds: ["user", "user"] },
    { requiredKinds: ["bot"], requiredScopes: { user: ["search:read"] } },
  ])("rejects invalid requirements", async (requirement) => {
    const resolver = new CredentialResolver([new FakeProvider({})], new FakeVerifier({}));
    await expect(
      resolver.resolveForWorkspace(workspace(undefined), requirement as never),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL_REQUIREMENT" });
  });

  it("rejects missing configured values and unknown providers", async () => {
    const resolver = new CredentialResolver([new FakeProvider({})], new FakeVerifier({}));
    await expect(
      resolver.resolveForWorkspace(
        workspace({ user: { provider: "environment", name: "USER_REF" } }),
        { requiredKinds: ["user"] },
      ),
    ).rejects.toMatchObject({ code: "CONFIGURED_CREDENTIAL_MISSING" });

    await expect(
      resolver.resolveForWorkspace(
        workspace({
          user: { provider: "keychain", name: "primary" } as never,
        }),
        { requiredKinds: ["user"] },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_CREDENTIAL_PROVIDER" });
  });

  it("rejects cross-team and expected-Team-ID mismatches", async () => {
    const refs = workspace({
      user: { provider: "environment", name: "USER_REF" },
      bot: { provider: "environment", name: "BOT_REF" },
    });
    const crossTeam = new CredentialResolver(
      [new FakeProvider({ USER_REF: userToken, BOT_REF: botToken })],
      new FakeVerifier({
        [userToken]: { teamId: parseTeamId("T00000001") },
        [botToken]: { teamId: parseTeamId("T00000002"), botId: "B1" },
      }),
    );
    await expect(
      crossTeam.resolveForWorkspace(refs, { requiredKinds: ["user"] }),
    ).rejects.toMatchObject({ code: "CROSS_TEAM_CREDENTIALS" });

    const wrongWorkspace = new CredentialResolver(
      [new FakeProvider({ USER_REF: userToken })],
      new FakeVerifier({
        [userToken]: { teamId: parseTeamId("T00000002") },
      }),
    );
    await expect(
      wrongWorkspace.resolveForWorkspace(
        workspace({ user: { provider: "environment", name: "USER_REF" } }),
        { requiredKinds: ["user"] },
      ),
    ).rejects.toMatchObject({ code: "TEAM_ID_MISMATCH" });
  });

  it("requires bot identity and sanitizes verifier failures", async () => {
    const missingBotIdentity = new CredentialResolver(
      [new FakeProvider({ BOT_REF: botToken })],
      new FakeVerifier({ [botToken]: { teamId: parseTeamId("T00000001") } }),
    );
    await expect(
      missingBotIdentity.resolveForWorkspace(
        workspace({ bot: { provider: "environment", name: "BOT_REF" } }),
        { requiredKinds: ["bot"] },
      ),
    ).rejects.toMatchObject({ code: "BOT_IDENTITY_REQUIRED" });

    const canary = "xoxp-verifier-error-secret-canary";
    const failing = new CredentialResolver(
      [new FakeProvider({ USER_REF: userToken })],
      new FakeVerifier({ [userToken]: new Error(canary) }),
    );
    let error: unknown;
    try {
      await failing.resolveForWorkspace(
        workspace({ user: { provider: "environment", name: "USER_REF" } }),
        { requiredKinds: ["user"] },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "AUTH_VERIFICATION_FAILED" });
    expect(String(error)).not.toContain(canary);
    expect(JSON.stringify(error)).not.toContain(canary);
  });

  it("rebuilds typed errors thrown by untrusted provider and verifier implementations", async () => {
    const canary = "xoxp-untrusted-error-secret-canary";
    const unsafeProvider: CredentialProvider = {
      providerId: "environment",
      resolveMany() {
        throw new CredentialError("CREDENTIAL_PROVIDER_FAILED", canary);
      },
    };
    const providerResolver = new CredentialResolver([unsafeProvider], new FakeVerifier({}));
    await expect(
      providerResolver.resolveForWorkspace(
        workspace({ user: { provider: "environment", name: "USER_REF" } }),
        { requiredKinds: ["user"] },
      ),
    ).rejects.not.toThrow(canary);

    const unsafeVerifier: AuthVerifier = {
      verify() {
        throw new CredentialError("AUTH_VERIFICATION_FAILED", canary);
      },
    };
    const verifierResolver = new CredentialResolver(
      [new FakeProvider({ USER_REF: userToken })],
      unsafeVerifier,
    );
    await expect(
      verifierResolver.resolveForWorkspace(
        workspace({ user: { provider: "environment", name: "USER_REF" } }),
        { requiredKinds: ["user"] },
      ),
    ).rejects.not.toThrow(canary);
  });

  it("sanitizes provider result access and value failures", async () => {
    const canary = "xoxp-provider-result-secret-canary";
    for (const unsafeResult of [
      {
        get() {
          throw new Error(canary);
        },
      },
      new Map([["USER_REF", { token: canary } as never]]),
    ]) {
      const unsafeProvider: CredentialProvider = {
        providerId: "environment",
        resolveMany: () => Promise.resolve(unsafeResult as never),
      };
      const resolver = new CredentialResolver([unsafeProvider], new FakeVerifier({}));

      let error: unknown;
      try {
        await resolver.resolveForWorkspace(
          workspace({ user: { provider: "environment", name: "USER_REF" } }),
          { requiredKinds: ["user"] },
        );
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({ code: "CREDENTIAL_PROVIDER_FAILED" });
      expect(String(error)).not.toContain(canary);
      expect(JSON.stringify(error)).not.toContain(canary);
      expect(error instanceof Error ? error.stack : "").not.toContain(canary);
    }
  });

  it("sanitizes malformed verifier identities before policy checks", async () => {
    const canary = "xoxp-identity-result-secret-canary";
    const unsafeIdentities: unknown[] = [
      { teamId: "not-a-team" },
      {
        get teamId() {
          throw new Error(canary);
        },
      },
      { teamId: "T00000001", userId: 42 },
    ];

    for (const identity of unsafeIdentities) {
      const verifier: AuthVerifier = {
        verify: () => Promise.resolve(identity as AuthIdentity),
      };
      const resolver = new CredentialResolver(
        [new FakeProvider({ USER_REF: userToken })],
        verifier,
      );

      let error: unknown;
      try {
        await resolver.resolveForWorkspace(
          workspace({ user: { provider: "environment", name: "USER_REF" } }),
          { requiredKinds: ["user"] },
        );
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({ code: "AUTH_IDENTITY_INVALID" });
      expect(String(error)).not.toContain(canary);
      expect(JSON.stringify(error)).not.toContain(canary);
      expect(error instanceof Error ? error.stack : "").not.toContain(canary);
    }
  });

  it("destroys the complete verified set idempotently", async () => {
    const resolver = new CredentialResolver(
      [new FakeProvider({ USER_REF: userToken, BOT_REF: botToken })],
      new FakeVerifier({
        [userToken]: { teamId: parseTeamId("T00000001") },
        [botToken]: { teamId: parseTeamId("T00000001"), botId: "B1" },
      }),
    );
    const result = await resolver.resolveForWorkspace(
      workspace({
        user: { provider: "environment", name: "USER_REF" },
        bot: { provider: "environment", name: "BOT_REF" },
      }),
      { requiredKinds: ["user"] },
    );

    result.destroy();
    result.destroy();

    expect(() => result.user?.use((token) => token)).toThrowError(
      expect.objectContaining({ code: "CREDENTIAL_DESTROYED" }),
    );
    expect(() => result.bot?.use((token) => token)).toThrowError(
      expect.objectContaining({ code: "CREDENTIAL_DESTROYED" }),
    );
  });
});

describe("CredentialResolver legacy mode", () => {
  it("derives one Team ID from matching legacy User/Bot tokens", async () => {
    const resolver = new CredentialResolver(
      [new FakeProvider({ SLACK_USER_TOKEN: userToken, SLACK_BOT_TOKEN: botToken })],
      new FakeVerifier({
        [userToken]: { teamId: parseTeamId("T00000001") },
        [botToken]: { teamId: parseTeamId("T00000001"), botId: "B1" },
      }),
    );

    const result = await resolver.resolveLegacySingleWorkspace({ requiredKinds: ["user"] });
    expect(result.teamId).toBe("T00000001");
    expect(result.user).toBeDefined();
    expect(result.bot).toBeDefined();
  });

  it("rejects cross-team legacy sets and required-kind fallback", async () => {
    const crossTeam = new CredentialResolver(
      [new FakeProvider({ SLACK_USER_TOKEN: userToken, SLACK_BOT_TOKEN: botToken })],
      new FakeVerifier({
        [userToken]: { teamId: parseTeamId("T00000001") },
        [botToken]: { teamId: parseTeamId("T00000002"), botId: "B1" },
      }),
    );
    await expect(
      crossTeam.resolveLegacySingleWorkspace({ requiredKinds: ["user"] }),
    ).rejects.toMatchObject({ code: "CROSS_TEAM_CREDENTIALS" });

    const botOnly = new CredentialResolver(
      [new FakeProvider({ SLACK_BOT_TOKEN: botToken })],
      new FakeVerifier({
        [botToken]: { teamId: parseTeamId("T00000001"), botId: "B1" },
      }),
    );
    await expect(
      botOnly.resolveLegacySingleWorkspace({ requiredKinds: ["user"] }),
    ).rejects.toMatchObject({ code: "REQUIRED_CREDENTIAL_MISSING" });
  });

  it("rejects malformed legacy verifier identities", async () => {
    const resolver = new CredentialResolver(
      [new FakeProvider({ SLACK_USER_TOKEN: userToken })],
      { verify: () => Promise.resolve({ teamId: "not-a-team" } as never) },
    );

    await expect(
      resolver.resolveLegacySingleWorkspace({ requiredKinds: ["user"] }),
    ).rejects.toMatchObject({ code: "AUTH_IDENTITY_INVALID" });
  });
});
