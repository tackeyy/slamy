import { describe, expect, it } from "vitest";
import { EnvironmentCredentialProvider } from "../environment-credential-provider.js";

describe("EnvironmentCredentialProvider", () => {
  it("resolves only referenced credentials from one synchronous snapshot", async () => {
    const env: NodeJS.ProcessEnv = {
      USER_REF: "xoxp-user-secret-canary",
      BOT_REF: "xoxb-bot-secret-canary",
      SLACK_USER_TOKEN: "xoxp-legacy-secret-canary",
    };
    const provider = new EnvironmentCredentialProvider(env);
    const resolution = provider.resolveMany([
      { provider: "environment", name: "USER_REF" },
      { provider: "environment", name: "BOT_REF" },
      { provider: "environment", name: "USER_REF" },
    ]);
    env.USER_REF = "xoxp-mutated-secret-canary";

    await expect(resolution).resolves.toEqual(
      new Map([
        ["USER_REF", "xoxp-user-secret-canary"],
        ["BOT_REF", "xoxb-bot-secret-canary"],
      ]),
    );
    expect((await resolution).has("SLACK_USER_TOKEN")).toBe(false);
  });

  it("treats missing and empty values as unavailable", async () => {
    const provider = new EnvironmentCredentialProvider({ EMPTY: "" });

    await expect(
      provider.resolveMany([
        { provider: "environment", name: "EMPTY" },
        { provider: "environment", name: "MISSING" },
      ]),
    ).resolves.toEqual(
      new Map([
        ["EMPTY", undefined],
        ["MISSING", undefined],
      ]),
    );
  });

  it("sanitizes provider failures", async () => {
    const canary = "xoxp-provider-error-secret-canary";
    const env = new Proxy<NodeJS.ProcessEnv>({}, {
      get() {
        throw new Error(canary);
      },
    });
    const provider = new EnvironmentCredentialProvider(env);

    let error: unknown;
    try {
      await provider.resolveMany([{ provider: "environment", name: "USER_REF" }]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "CREDENTIAL_PROVIDER_FAILED" });
    expect(String(error)).not.toContain(canary);
    expect(JSON.stringify(error)).not.toContain(canary);
  });
});
