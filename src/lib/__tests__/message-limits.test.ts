import { describe, it, expect, vi } from "vitest";
import {
  splitMessage,
  MAX_MESSAGE_LENGTH,
  CHAT_POSTMESSAGE_MAX_LENGTH,
  CHAT_UPDATE_MAX_LENGTH,
} from "../split.js";
import { SlamyClient } from "../client.js";
import { createMockWebClient } from "../../__tests__/helpers/mock-slack.js";

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
  LogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
}));

async function makeClient() {
  const mock = createMockWebClient();
  const { WebClient } = vi.mocked(await import("@slack/web-api"));
  (WebClient as any).mockImplementation(() => mock);
  const client = new SlamyClient({ botToken: "xoxb-test", userToken: "xoxp-test" });
  return { client, mock };
}

describe("message length constants", () => {
  it("CHAT_POSTMESSAGE_MAX_LENGTH は公式仕様の 40000", () => {
    expect(CHAT_POSTMESSAGE_MAX_LENGTH).toBe(40000);
  });

  it("CHAT_UPDATE_MAX_LENGTH は defensive な 3900", () => {
    expect(CHAT_UPDATE_MAX_LENGTH).toBe(3900);
  });

  it("MAX_MESSAGE_LENGTH は最も厳しい上限 (CHAT_UPDATE_MAX_LENGTH と同値、後方互換)", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(CHAT_UPDATE_MAX_LENGTH);
  });
});

describe("splitMessage with custom maxLen", () => {
  it("CHAT_POSTMESSAGE_MAX_LENGTH まで分割せず 1 chunk に収める", () => {
    // 10000 文字 → 旧 3900 では 3 chunks、新 40000 では 1 chunk
    const text = "a".repeat(10000);
    const oldChunks = splitMessage(text);
    expect(oldChunks.length).toBeGreaterThan(1);

    const newChunks = splitMessage(text, CHAT_POSTMESSAGE_MAX_LENGTH);
    expect(newChunks).toEqual([text]);
  });
});

describe("postMessage / replyToThread は 40000 文字まで 1 chunk で送る", () => {
  it("replyToThread は 10000 文字を 1 chunk で送る (旧実装は複数 chunk)", async () => {
    const { client, mock } = await makeClient();
    const longText = "x".repeat(10000);

    await client.replyToThread("C123", "1700000000.000001", longText);

    // 旧: 3 回 (3 chunks) / 新: 1 回 (1 chunk)
    expect(mock.chat.postMessage).toHaveBeenCalledTimes(1);
  });

  it("postMessage は 10000 文字を 1 chunk で送る", async () => {
    const { client, mock } = await makeClient();
    const longText = "y".repeat(10000);

    await client.postMessage("C123", longText);

    expect(mock.chat.postMessage).toHaveBeenCalledTimes(1);
  });

  it("postMessage は 40001 文字なら 2 chunks に分かれる", async () => {
    const { client, mock } = await makeClient();
    const longText = "z".repeat(40001);

    await client.postMessage("C123", longText);

    expect(mock.chat.postMessage).toHaveBeenCalledTimes(2);
  });
});

describe("updateMessage は 3900 文字上限を維持", () => {
  it("3900 文字を超えると例外", async () => {
    const { client } = await makeClient();
    const longText = "u".repeat(3901);

    await expect(client.updateMessage("C123", "1700000000.000001", longText)).rejects.toThrow(
      /3900/,
    );
  });

  it("3900 文字以内なら成功", async () => {
    const { client, mock } = await makeClient();
    await client.updateMessage("C123", "1700000000.000001", "u".repeat(3900));
    expect(mock.chat.update).toHaveBeenCalledTimes(1);
  });
});
