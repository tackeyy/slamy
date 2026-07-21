import { describe, expect, it } from "vitest";
import { parseTargetEvidence } from "../parser.js";

describe("parseTargetEvidence", () => {
  it("parses official archives parent and thread permalinks", () => {
    expect(
      parseTargetEvidence({
        input: "https://primary.slack.com/archives/C0123ABC/p1700000000000001",
      }),
    ).toEqual({
      source: "archives-permalink",
      isUrl: true,
      hostname: "primary.slack.com",
      channelId: "C0123ABC",
      messageTs: "1700000000.000001",
    });

    expect(
      parseTargetEvidence({
        input:
          "https://primary.slack.com/archives/D0B4ALQ1A73/p1700000001000002?thread_ts=1700000000.000001&cid=D0B4ALQ1A73",
      }),
    ).toEqual({
      source: "archives-permalink",
      isUrl: true,
      hostname: "primary.slack.com",
      channelId: "D0B4ALQ1A73",
      messageTs: "1700000001.000002",
      threadTs: "1700000000.000001",
    });
  });

  it("accepts encoded IDs, one trailing slash, fragments, and unrelated query fields", () => {
    expect(
      parseTargetEvidence({
        input:
          "https://PRIMARY.slack.com/archives/%43%30%31%32%33%41%42%43/p1700000000000001/?foo=bar#message",
      }),
    ).toMatchObject({
      hostname: "primary.slack.com",
      channelId: "C0123ABC",
      messageTs: "1700000000.000001",
    });
  });

  it("parses app.slack.com Team and Enterprise channel/thread URLs", () => {
    expect(
      parseTargetEvidence({ input: "https://app.slack.com/client/T00000001/C0123ABC" }),
    ).toEqual({
      source: "app-client-url",
      isUrl: true,
      channelId: "C0123ABC",
      teamId: "T00000001",
    });

    expect(
      parseTargetEvidence({
        input:
          "https://app.slack.com/client/T00000001/G0123ABC/thread-G0123ABC-1700000000.000001/?foo=bar",
      }),
    ).toEqual({
      source: "app-client-url",
      isUrl: true,
      channelId: "G0123ABC",
      teamId: "T00000001",
      threadTs: "1700000000.000001",
    });

    expect(
      parseTargetEvidence({ input: "https://app.slack.com/client/E00000001/C0123ABC" }),
    ).toEqual({
      source: "app-client-url",
      isUrl: true,
      channelId: "C0123ABC",
      enterpriseId: "E00000001",
    });
  });

  it("parses legacy channel plus explicit message and thread timestamps", () => {
    expect(
      parseTargetEvidence({
        input: "C0123ABC",
        messageTs: "1700000001.000002",
        threadTs: "1700000000.000001",
      }),
    ).toEqual({
      source: "legacy",
      isUrl: false,
      channelId: "C0123ABC",
      messageTs: "1700000001.000002",
      threadTs: "1700000000.000001",
    });
  });

  it.each([
    [
      "https://primary.slack.com/archives/C0123ABC/p1700000000000001?cid=G99999999",
      "CHANNEL_CONFLICT",
    ],
    [
      "https://app.slack.com/client/T00000001/C0123ABC/thread-G99999999-1700000000.000001",
      "CHANNEL_CONFLICT",
    ],
    [
      "https://primary.slack.com/archives/C0123ABC/p1700000000000001?cid=C0123ABC&cid=C0123ABC",
      "AMBIGUOUS_QUERY",
    ],
    [
      "https://primary.slack.com/archives/C0123ABC/p1700000000000001?thread_ts=1700000000.000001&thread_ts=1700000000.000001",
      "AMBIGUOUS_QUERY",
    ],
    ["https://primary.slack.com/archives/C0123ABC/p123", "INVALID_TIMESTAMP"],
    ["https://primary.slack.com/archives/C0123ABC/p1700000000abcdef", "INVALID_TIMESTAMP"],
    ["https://primary.slack.com/archives/%252f/p1700000000000001", "INVALID_URL_ENCODING"],
    ["https://primary.slack.com/archives/C0123ABC%2Fbad/p1700000000000001", "INVALID_URL_ENCODING"],
    ["http://primary.slack.com/archives/C0123ABC/p1700000000000001", "UNSUPPORTED_URL"],
    ["https:////primary.slack.com/archives/C0123ABC/p1700000000000001", "INVALID_TARGET"],
    ["https://user@primary.slack.com/archives/C0123ABC/p1700000000000001", "UNSUPPORTED_URL"],
    ["https://primary.slack.com:444/archives/C0123ABC/p1700000000000001", "UNSUPPORTED_URL"],
    ["https://evil.example/archives/C0123ABC/p1700000000000001", "UNSUPPORTED_URL"],
    ["https://primary.slack.com/not-archives/C0123ABC", "UNSUPPORTED_URL"],
  ])("fails closed for unsafe URL %s", (input, code) => {
    expect(() => parseTargetEvidence({ input })).toThrowError(expect.objectContaining({ code }));
  });

  it("rejects conflicting explicit and URL timestamps", () => {
    expect(() =>
      parseTargetEvidence({
        input: "https://primary.slack.com/archives/C0123ABC/p1700000000000001",
        messageTs: "1700000001.000002",
      }),
    ).toThrowError(expect.objectContaining({ code: "TIMESTAMP_CONFLICT" }));
  });
});
