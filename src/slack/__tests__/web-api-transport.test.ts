import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import { NodeSlackWebApiTransport } from "../web-api-transport.js";

describe("NodeSlackWebApiTransport", () => {
  it("uses one non-cached client per call with retries disabled and rate limits rejected", async () => {
    const created: Array<{ token: string; options: unknown }> = [];
    const transport = new NodeSlackWebApiTransport((token, options) => {
      created.push({ token, options });
      return {
        apiCall: (method, args) => Promise.resolve({ ok: true, method, args }),
      };
    });

    await transport.call({
      method: "team.info",
      token: "xoxp-first",
      arguments: {},
      requestId: "req-1",
      teamId: parseTeamId("T00000001"),
    });
    await transport.call({
      method: "chat.postMessage",
      token: "xoxb-second",
      arguments: { channel: "C0123ABC", text: "hello" },
      requestId: "req-2",
      teamId: parseTeamId("T00000001"),
    });

    expect(created).toEqual([
      {
        token: "xoxp-first",
        options: { rejectRateLimitedCalls: true, retries: 0, logLevel: "error" },
      },
      {
        token: "xoxb-second",
        options: { rejectRateLimitedCalls: true, retries: 0, logLevel: "error" },
      },
    ]);
  });
});
