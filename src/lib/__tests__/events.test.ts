import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @slack/bolt before importing SlamyEvents
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const eventHandlers: Record<string, Function> = {};

vi.mock("@slack/bolt", () => ({
  App: vi.fn().mockImplementation(() => ({
    event: (name: string, handler: Function) => {
      eventHandlers[name] = handler;
    },
    start: mockStart,
    stop: mockStop,
  })),
}));

import { SlamyEvents } from "../events.js";

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(eventHandlers)) {
    delete eventHandlers[key];
  }
});

describe("SlamyEvents", () => {
  it("start() が App.start() を呼ぶ", async () => {
    const events = new SlamyEvents({ botToken: "xoxb-test", appToken: "xapp-test" });
    await events.start();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("stop() が App.stop() を呼ぶ", async () => {
    const events = new SlamyEvents({ botToken: "xoxb-test", appToken: "xapp-test" });
    await events.stop();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("app_mention イベントが EventEmitter 経由で発火する", async () => {
    const events = new SlamyEvents({ botToken: "xoxb-test", appToken: "xapp-test" });
    const handler = vi.fn();
    events.on("app_mention", handler);

    const fakeEvent = { type: "app_mention", user: "U1", text: "hello", ts: "123", channel: "C1" };
    await eventHandlers["app_mention"]({ event: fakeEvent });

    expect(handler).toHaveBeenCalledWith(fakeEvent);
  });

  it("message イベントが EventEmitter 経由で発火する", async () => {
    const events = new SlamyEvents({ botToken: "xoxb-test", appToken: "xapp-test" });
    const handler = vi.fn();
    events.on("message", handler);

    const fakeEvent = { type: "message", user: "U1", text: "hi", ts: "456", channel: "D1" };
    await eventHandlers["message"]({ event: fakeEvent });

    expect(handler).toHaveBeenCalledWith(fakeEvent);
  });

  it("複数リスナーの同時登録", async () => {
    const events = new SlamyEvents({ botToken: "xoxb-test", appToken: "xapp-test" });
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    events.on("app_mention", handler1);
    events.on("app_mention", handler2);

    const fakeEvent = { type: "app_mention", user: "U1", text: "test", ts: "789", channel: "C1" };
    await eventHandlers["app_mention"]({ event: fakeEvent });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("app_mention と message を同時にリッスンできる", async () => {
    const events = new SlamyEvents({ botToken: "xoxb-test", appToken: "xapp-test" });
    const mentionHandler = vi.fn();
    const messageHandler = vi.fn();
    events.on("app_mention", mentionHandler);
    events.on("message", messageHandler);

    await eventHandlers["app_mention"]({ event: { type: "app_mention" } });
    await eventHandlers["message"]({ event: { type: "message" } });

    expect(mentionHandler).toHaveBeenCalledTimes(1);
    expect(messageHandler).toHaveBeenCalledTimes(1);
  });

  it("リスナー未登録のイベントはエラーにならない", async () => {
    new SlamyEvents({ botToken: "xoxb-test", appToken: "xapp-test" });

    // No listeners registered, but event fires - should not throw
    await expect(
      eventHandlers["app_mention"]({ event: { type: "app_mention" } }),
    ).resolves.not.toThrow();
  });
});
