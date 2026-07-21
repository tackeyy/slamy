import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { createCredentialSecret } from "../secret.js";

describe("CredentialSecret", () => {
  it.each([
    ["xoxp-user-secret-canary", "user"],
    ["xoxb-bot-secret-canary", "bot"],
    ["xoxe.xoxp-rotated-secret-canary", "user"],
    ["xoxe.xoxb-rotated-secret-canary", "bot"],
  ] as const)("classifies supported Slack token kinds", (value, kind) => {
    const secret = createCredentialSecret(value, kind);

    expect(secret.kind).toBe(kind);
    expect(secret.use((token) => token.length)).toBe(value.length);
  });

  it.each(["", "xapp-secret-canary", "xwfp-secret-canary", "plain-secret-canary"])(
    "rejects unsupported token kinds without reflecting the value",
    (value) => {
      let error: unknown;
      try {
        createCredentialSecret(value, "user");
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({ code: "UNSUPPORTED_TOKEN_KIND" });
      expect(JSON.stringify(error)).not.toContain(value || "plain-secret-canary");
    },
  );

  it("rejects a token stored in the wrong credential slot", () => {
    expect(() => createCredentialSecret("xoxb-bot-secret-canary", "user")).toThrowError(
      expect.objectContaining({ code: "TOKEN_KIND_MISMATCH" }),
    );
  });

  it("redacts string, JSON, and Node inspection output", () => {
    const canary = "xoxp-user-secret-canary";
    const secret = createCredentialSecret(canary, "user");

    expect(String(secret)).toBe("[REDACTED]");
    expect(JSON.stringify(secret)).toBe('"[REDACTED]"');
    expect(inspect(secret)).toBe("[REDACTED]");
    expect(Object.keys(secret)).toEqual(["kind"]);
    expect(JSON.stringify(secret)).not.toContain(canary);
  });

  it("cannot be consumed after destruction", () => {
    const secret = createCredentialSecret("xoxp-user-secret-canary", "user");
    secret.destroy();

    expect(() => secret.use((token) => token)).toThrowError(
      expect.objectContaining({ code: "CREDENTIAL_DESTROYED" }),
    );
  });
});
