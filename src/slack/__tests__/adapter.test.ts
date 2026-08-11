import { describe, expect, it } from "vitest";
import { WorkspaceSlackAdapter } from "../adapter.js";
import type { SlackDiagnosticEvent } from "../diagnostics.js";
import { SlackAdapterError } from "../errors.js";
import type { SlackTransport, SlackTransportRequest } from "../transport.js";
import { contextWith, PRIMARY_TEAM_ID } from "./helpers.js";

/** Zero-sleep clock for tests that do not want to exercise real retry waits. */
const instantClock = { sleep: () => Promise.resolve() };

class FakeTransport implements SlackTransport {
  readonly requests: SlackTransportRequest[] = [];
  response: unknown = { ok: true };
  failure?: unknown;

  call(request: SlackTransportRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.failure !== undefined) return Promise.reject(this.failure);
    return Promise.resolve(this.response);
  }
}

describe("WorkspaceSlackAdapter", () => {
  it("selects the policy credential without cross-kind fallback", async () => {
    const transport = new FakeTransport();
    const adapter = new WorkspaceSlackAdapter({ transport, requestIdFactory: () => "req-1" });
    const context = contextWith({
      userToken: "xoxp-user-canary",
      botToken: "xoxb-bot-canary",
      userScopes: ["team:read"],
      botScopes: ["chat:write"],
    });

    transport.response = { ok: true, team: { id: PRIMARY_TEAM_ID, name: "Primary" } };
    await expect(adapter.getTeamInfo(context)).resolves.toEqual({
      teamId: PRIMARY_TEAM_ID,
      name: "Primary",
    });
    expect(transport.requests[0]).toMatchObject({
      method: "team.info",
      teamId: PRIMARY_TEAM_ID,
      token: "xoxp-user-canary",
      requestId: "req-1",
      arguments: {},
    });

    transport.response = { ok: true, channel: "C0123ABC", ts: "1700000000.000001" };
    await adapter.postMessage(context, { channelId: "C0123ABC", text: "hello" });
    expect(transport.requests[1]).toMatchObject({
      method: "chat.postMessage",
      token: "xoxb-bot-canary",
      arguments: { channel: "C0123ABC", text: "hello" },
    });
  });

  it("rejects missing credential kinds and scope contracts before transport", async () => {
    const transport = new FakeTransport();
    const adapter = new WorkspaceSlackAdapter({ transport });

    await expect(
      adapter.getTeamInfo(contextWith({ botToken: "xoxb-only", botScopes: ["team:read"] })),
    ).rejects.toMatchObject({ code: "CREDENTIAL_UNAVAILABLE" });
    await expect(
      adapter.postMessage(contextWith({ userToken: "xoxp-only", userScopes: ["chat:write"] }), {
        channelId: "C0123ABC",
        text: "hello",
      }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_UNAVAILABLE" });
    await expect(
      adapter.getTeamInfo(contextWith({ userToken: "xoxp-user", userScopes: [] })),
    ).rejects.toMatchObject({ code: "CREDENTIAL_SCOPE_CONTRACT_MISMATCH" });
    expect(transport.requests).toHaveLength(0);
  });

  it("runs the auth/team hook before reading a credential or calling transport", async () => {
    const transport = new FakeTransport();
    let credentialReads = 0;
    const base = contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] });
    const context = {
      ...base,
      credentials: {
        ...base.credentials,
        user: {
          ...base.credentials.user!,
          use<Result>(): Result {
            credentialReads += 1;
            throw new Error("credential should not be read");
          },
        },
      },
    };
    const adapter = new WorkspaceSlackAdapter({
      transport,
      verificationHook: () => Promise.reject(new Error("xoxp-hook-canary")),
    });

    await expect(adapter.getTeamInfo(context)).rejects.toMatchObject({
      code: "WORKSPACE_VERIFICATION_FAILED",
    });
    expect(credentialReads).toBe(0);
    expect(transport.requests).toHaveLength(0);
  });

  it("normalizes hostile context getters before any transport call", async () => {
    const canary = "xoxp-context-getter-canary";
    const transport = new FakeTransport();
    const adapter = new WorkspaceSlackAdapter({ transport });
    const base = contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] });
    const poisonedScopes = { ...base.credentials };
    Object.defineProperty(poisonedScopes, "requiredScopes", {
      get(): never {
        throw new Error(canary);
      },
    });
    const poisonedTeam = { ...base };
    Object.defineProperty(poisonedTeam, "teamId", {
      get(): never {
        throw new Error(canary);
      },
    });

    for (const context of [
      { ...base, credentials: poisonedScopes },
      poisonedTeam,
    ]) {
      let caught: unknown;
      try {
        await adapter.getTeamInfo(context);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "WORKSPACE_CONTEXT_MISMATCH" });
      expect(String(caught)).not.toContain(canary);
      expect(JSON.stringify(caught)).not.toContain(canary);
      expect(caught instanceof Error ? caught.stack : "").not.toContain(canary);
    }
    expect(transport.requests).toHaveLength(0);
  });

  it("rejects an unsupported runtime credential kind instead of selecting Bot", async () => {
    const transport = new FakeTransport();
    const adapter = new WorkspaceSlackAdapter({ transport });
    await expect(
      adapter.verifyWorkspace(
        contextWith({ userToken: "xoxp-user", botToken: "xoxb-bot" }),
        "admin" as "user",
      ),
    ).rejects.toMatchObject({ code: "INVALID_SLACK_INPUT" });
    expect(transport.requests).toHaveLength(0);
  });

  it("normalizes a hostile listAll maxPages getter before transport", async () => {
    const canary = "xoxp-max-pages-getter-canary";
    const transport = new FakeTransport();
    const adapter = new WorkspaceSlackAdapter({ transport });
    const input = Object.create(null) as { maxPages?: number };
    Object.defineProperty(input, "maxPages", {
      get(): never {
        throw new Error(canary);
      },
    });

    let caught: unknown;
    try {
      await adapter.listAllPublicConversations(
        contextWith({ userToken: "xoxp-user", userScopes: ["channels:read"] }),
        input,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "PAGINATION_INVALID" });
    expect(String(caught)).not.toContain(canary);
    expect(JSON.stringify(caught)).not.toContain(canary);
    expect(caught instanceof Error ? caught.stack : "").not.toContain(canary);
    expect(transport.requests).toHaveLength(0);
  });

  it("emits frozen local-correlation diagnostics and isolates sink failures", async () => {
    const transport = new FakeTransport();
    transport.response = { ok: true, team: { id: PRIMARY_TEAM_ID, name: "Primary" } };
    const events: SlackDiagnosticEvent[] = [];
    const adapter = new WorkspaceSlackAdapter({
      transport,
      requestIdFactory: () => "local-correlation-1",
      diagnosticSink(event) {
        events.push(event);
        if (event.outcome === "started") throw new Error("sink failure");
      },
    });

    await adapter.getTeamInfo(
      contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] }),
    );
    expect(transport.requests[0]?.arguments).toEqual({ team: PRIMARY_TEAM_ID });
    expect(events).toEqual([
      {
        requestId: "local-correlation-1",
        method: "team.info",
        teamId: PRIMARY_TEAM_ID,
        credentialKind: "user",
        outcome: "started",
      },
      {
        requestId: "local-correlation-1",
        method: "team.info",
        teamId: PRIMARY_TEAM_ID,
        credentialKind: "user",
        outcome: "succeeded",
      },
    ]);
    expect(events.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    [
      "platform",
      {
        code: "slack_webapi_platform_error",
        message: "xoxp-sdk-canary",
        data: { error: "missing_scope", needed: "xoxp-sdk-canary" },
      },
      "SLACK_PLATFORM_ERROR",
      undefined,
    ],
    [
      "rate limit",
      {
        code: "slack_webapi_rate_limited_error",
        message: "xoxp-sdk-canary",
        retryAfter: 17,
      },
      "SLACK_RATE_LIMITED",
      17,
    ],
    [
      "request",
      {
        code: "slack_webapi_request_error",
        message: "xoxp-sdk-canary",
        original: new Error("xoxp-sdk-canary"),
      },
      "SLACK_REQUEST_ERROR",
      undefined,
    ],
    [
      "http",
      {
        code: "slack_webapi_http_error",
        message: "xoxp-sdk-canary",
        body: "xoxp-sdk-canary",
        headers: { authorization: "xoxp-sdk-canary" },
      },
      "SLACK_HTTP_ERROR",
      undefined,
    ],
  ])("maps %s failures without retaining raw SDK data", async (_label, failure, code, retryAfter) => {
    const transport = new FakeTransport();
    transport.failure = failure;
    const events: SlackDiagnosticEvent[] = [];
    const adapter = new WorkspaceSlackAdapter({
      transport,
      requestIdFactory: () => "req-safe",
      diagnosticSink: (event) => events.push(event),
      clock: instantClock,
    });
    let caught: unknown;
    try {
      await adapter.getTeamInfo(
        contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code,
      requestId: "req-safe",
      method: "team.info",
      teamId: PRIMARY_TEAM_ID,
      ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
    });
    expect(String(caught)).not.toContain("xoxp-sdk-canary");
    expect(JSON.stringify(caught)).not.toContain("xoxp-sdk-canary");
    expect(caught instanceof Error ? caught.stack : "").not.toContain("xoxp-sdk-canary");
    expect(JSON.stringify(events)).not.toContain("xoxp-sdk-canary");
  });

  it("does not trust a SlackAdapterError received from the transport boundary", async () => {
    const canary = "xoxp-forged-adapter-error-canary";
    const transport = new FakeTransport();
    transport.failure = new SlackAdapterError({
      code: "SLACK_PLATFORM_ERROR",
      message: canary,
      requestId: canary,
      method: "team.info",
      teamId: PRIMARY_TEAM_ID,
      credentialKind: "user",
      platformCode: "invalid_auth",
    });
    const adapter = new WorkspaceSlackAdapter({
      transport,
      requestIdFactory: () => "safe-request-id",
    });

    let caught: unknown;
    try {
      await adapter.getTeamInfo(
        contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "INVALID_SLACK_RESPONSE",
      requestId: "safe-request-id",
      method: "team.info",
      teamId: PRIMARY_TEAM_ID,
    });
    expect(String(caught)).not.toContain(canary);
    expect(JSON.stringify(caught)).not.toContain(canary);
    expect(caught instanceof Error ? caught.stack : "").not.toContain(canary);
  });

  it("normalizes a Proxy throwable without invoking its prototype trap", async () => {
    const canary = "xoxp-proxy-throwable-canary";
    const transport = new FakeTransport();
    transport.failure = new Proxy(Object.create(null) as object, {
      getPrototypeOf(): never {
        throw new Error(canary);
      },
    });
    const adapter = new WorkspaceSlackAdapter({
      transport,
      requestIdFactory: () => "safe-proxy-request",
    });

    let caught: unknown;
    try {
      await adapter.getTeamInfo(
        contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "INVALID_SLACK_RESPONSE",
      requestId: "safe-proxy-request",
    });
    expect(String(caught)).not.toContain(canary);
    expect(JSON.stringify(caught)).not.toContain(canary);
    expect(caught instanceof Error ? caught.stack : "").not.toContain(canary);
  });
});

describe("WorkspaceSlackAdapter rate-limit retry", () => {
  class FakeClock {
    readonly sleepMs: number[] = [];
    sleep(ms: number): Promise<void> {
      this.sleepMs.push(ms);
      return Promise.resolve();
    }
  }

  class ScriptedTransport implements SlackTransport {
    readonly requests: SlackTransportRequest[] = [];
    private readonly script: Array<() => unknown>;

    constructor(script: Array<() => unknown>) {
      this.script = script;
    }

    call(request: SlackTransportRequest): Promise<unknown> {
      this.requests.push(request);
      const next = this.script.shift();
      if (!next) return Promise.reject(new Error("unexpected transport call"));
      try {
        return Promise.resolve(next());
      } catch (error) {
        return Promise.reject(error);
      }
    }
  }

  function rateLimitedSdkError(retryAfter: number): () => never {
    return () => {
      const err = Object.assign(new Error("rate limited"), {
        code: "slack_webapi_rate_limited_error",
        retryAfter,
      });
      throw err;
    };
  }

  it("retries an idempotent operation after a 429 and returns the successful result", async () => {
    const clock = new FakeClock();
    const transport = new ScriptedTransport([
      rateLimitedSdkError(2),
      () => ({ ok: true, team: { id: PRIMARY_TEAM_ID, name: "Retried" } }),
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport, clock });
    const result = await adapter.getTeamInfo(
      contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] }),
    );
    expect(result.name).toBe("Retried");
    expect(transport.requests).toHaveLength(2);
    expect(clock.sleepMs).toEqual([2_000]);
  });

  it("immediately rethrows SLACK_RATE_LIMITED for non-idempotent operations (retryPolicy: never)", async () => {
    const clock = new FakeClock();
    const transport = new ScriptedTransport([rateLimitedSdkError(5)]);
    const adapter = new WorkspaceSlackAdapter({ transport, clock });
    await expect(
      adapter.postMessage(
        contextWith({ botToken: "xoxb-bot", botScopes: ["chat:write"] }),
        { channelId: "C0123ABC", text: "hello" },
      ),
    ).rejects.toMatchObject({ code: "SLACK_RATE_LIMITED" });
    expect(transport.requests).toHaveLength(1);
    expect(clock.sleepMs).toHaveLength(0);
  });

  it("retries a paginated list operation per page when 429 is returned mid-pagination", async () => {
    const clock = new FakeClock();
    // Page 1 succeeds, page 2 returns 429 once, then succeeds
    const transport = new ScriptedTransport([
      () => ({
        ok: true,
        channels: [{ id: "C0000001", name: "general", is_archived: false, is_private: false }],
        response_metadata: { next_cursor: "cursor-2" },
      }),
      rateLimitedSdkError(1),
      () => ({
        ok: true,
        channels: [{ id: "C0000002", name: "random", is_archived: false, is_private: false }],
        response_metadata: { next_cursor: "" },
      }),
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport, clock });
    const conversations = await adapter.listAllPublicConversations(
      contextWith({ userToken: "xoxp-user", userScopes: ["channels:read"] }),
    );
    expect(conversations).toHaveLength(2);
    expect(transport.requests).toHaveLength(3);
    expect(clock.sleepMs).toEqual([1_000]);
  });
});
