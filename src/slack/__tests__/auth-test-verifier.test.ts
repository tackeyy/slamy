import { describe, expect, it, vi } from "vitest";
import { createCredentialSecret } from "../../credentials/secret.js";
import { SlackAuthTestVerifier } from "../auth-test-verifier.js";

describe("SlackAuthTestVerifier", () => {
  it("maps User, Bot, and Enterprise auth.test identities", async () => {
    const userTest = vi.fn().mockResolvedValue({
      ok: true,
      team_id: "T00000001",
      user_id: "U1",
      enterprise_id: "E1",
    });
    const botTest = vi.fn().mockResolvedValue({
      ok: true,
      team_id: "T00000001",
      user_id: "U2",
      bot_id: "B1",
    });
    const seenTokens: string[] = [];
    const verifier = new SlackAuthTestVerifier({
      authTest(token) {
        seenTokens.push(token);
        return token.startsWith("xoxp-") ? userTest() : botTest();
      },
    });

    await expect(
      verifier.verify(createCredentialSecret("xoxp-user-secret-canary", "user")),
    ).resolves.toEqual({ teamId: "T00000001", userId: "U1", enterpriseId: "E1" });
    await expect(
      verifier.verify(createCredentialSecret("xoxb-bot-secret-canary", "bot")),
    ).resolves.toEqual({ teamId: "T00000001", userId: "U2", botId: "B1" });
    expect(seenTokens).toEqual(["xoxp-user-secret-canary", "xoxb-bot-secret-canary"]);
    expect(userTest).toHaveBeenCalledTimes(1);
    expect(botTest).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ok: false, error: "invalid_auth" },
    { ok: false, error: "token_revoked" },
    { ok: false, error: "token_expired" },
  ])("maps Slack authentication failures to one safe error", async (response) => {
    const verifier = new SlackAuthTestVerifier({
      authTest: vi.fn().mockResolvedValue(response),
    });

    await expect(
      verifier.verify(createCredentialSecret("xoxp-user-secret-canary", "user")),
    ).rejects.toMatchObject({ code: "AUTH_VERIFICATION_FAILED" });
  });

  it.each([
    { ok: true },
    { ok: true, team_id: "invalid" },
  ])("rejects missing or malformed Team IDs", async (response) => {
    const verifier = new SlackAuthTestVerifier({
      authTest: vi.fn().mockResolvedValue(response),
    });

    await expect(
      verifier.verify(createCredentialSecret("xoxp-user-secret-canary", "user")),
    ).rejects.toMatchObject({ code: "AUTH_IDENTITY_INVALID" });
  });

  it("does not expose SDK errors or tokens", async () => {
    const canary = "xoxp-sdk-error-secret-canary";
    const verifier = new SlackAuthTestVerifier({
      authTest: vi.fn().mockRejectedValue(new Error(canary)),
    });

    let error: unknown;
    try {
      await verifier.verify(createCredentialSecret("xoxp-user-secret-canary", "user"));
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "AUTH_VERIFICATION_FAILED" });
    expect(String(error)).not.toContain(canary);
    expect(JSON.stringify(error)).not.toContain(canary);
    expect((error as Error).stack).not.toContain(canary);
  });
});
