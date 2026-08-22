import { describe, expect, it } from "vitest";
import {
  decodeLocalSessionBrokerResponse,
  localSessionFailureResponse,
} from "../local-session-broker.js";

describe("local session broker errors", () => {
  it("preserves only a safe Slack platform code across the broker boundary", () => {
    const failure = Object.assign(new Error("xoxp-secret-canary"), {
      code: "slack_webapi_platform_error",
      data: { error: "already_in_channel", detail: "xoxp-secret-canary" },
    });

    const response = localSessionFailureResponse(failure);

    expect(response).toEqual({
      ok: false,
      error: "Local session request failed",
      platformCode: "already_in_channel",
    });
    expect(JSON.stringify(response)).not.toContain("secret-canary");
    expect(() => decodeLocalSessionBrokerResponse(response)).toThrow(
      expect.objectContaining({
        message: "Local session request failed",
        platformCode: "already_in_channel",
      }),
    );
  });

  it("does not expose arbitrary failure details or trust malformed broker responses", () => {
    const response = localSessionFailureResponse(
      Object.assign(new Error("xoxp-secret-canary"), {
        code: "other_error",
        data: { error: "already_in_channel", detail: "xoxp-secret-canary" },
      }),
    );

    expect(response).toEqual({ ok: false, error: "Local session request failed" });
    expect(JSON.stringify(response)).not.toContain("secret-canary");

    let caught: unknown;
    try {
      decodeLocalSessionBrokerResponse({ ok: true, platformCode: "already_in_channel" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toEqual(new Error("Local session request failed"));
    expect(caught).not.toHaveProperty("platformCode");
  });

  it("falls back to a generic response when error properties cannot be inspected", () => {
    const poisoned = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(poisoned, "code", {
      get() {
        throw new Error("xoxp-secret-canary");
      },
    });

    expect(localSessionFailureResponse(poisoned)).toEqual({
      ok: false,
      error: "Local session request failed",
    });
  });
});
