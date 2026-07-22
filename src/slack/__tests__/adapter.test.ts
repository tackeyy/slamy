import { describe, expect, it } from "vitest";
import { WorkspaceSlackAdapter } from "../adapter.js";
import type { SlackDiagnosticEvent } from "../diagnostics.js";
import type { SlackTransport, SlackTransportRequest } from "../transport.js";
import { contextWith, PRIMARY_TEAM_ID } from "./helpers.js";

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
});
