import { describe, expect, it } from "vitest";
import {
  CredentialError,
  createCredentialResolver,
  createWorkspaceRecord,
  parseTeamId,
  type AuthIdentity,
  type AuthVerifier,
  type CredentialHandle,
  type CredentialProvider,
  type CredentialReference,
} from "../lib/index.js";

describe("credential public API", () => {
  it("composes custom providers and verifiers without Slack SDK types", async () => {
    const provider: CredentialProvider = {
      providerId: "keychain",
      resolveMany(references: readonly CredentialReference[]) {
        return Promise.resolve(
          new Map(references.map((reference) => [reference.name, "xoxp-public-secret-canary"])),
        );
      },
    };
    const verifier: AuthVerifier = {
      verify(secret: CredentialHandle): Promise<AuthIdentity> {
        expect(secret.kind).toBe("user");
        return Promise.resolve({ teamId: parseTeamId("T00000001"), userId: "U1" });
      },
    };
    const resolver = createCredentialResolver({ providers: [provider], verifier });

    const result = await resolver.resolveForWorkspace(
      createWorkspaceRecord({
        teamId: "T00000001",
        alias: "primary",
        domain: "primary.slack.com",
        displayName: "Primary",
        credentialRefs: {
          user: { provider: "keychain", name: "primary/user" },
        },
      }),
      { requiredKinds: ["user"] },
    );

    expect(result.teamId).toBe("T00000001");
    expect(result.user?.use((token) => token.length)).toBe("xoxp-public-secret-canary".length);
    expect(CredentialError).toBeTypeOf("function");
  });
});
