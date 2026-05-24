import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCliError, requireToken } from "../lib/cli-errors.js";

// 実 CLI コードと結びついたテスト。
// src/cli/index.ts の createClient() は requireToken を呼んでおり、
// 各コマンドの catch ブロックは将来 handleCliError へ移行可能な形にしてある。

describe("handleCliError", () => {
  let exit: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    exit = vi.fn();
    log = vi.fn();
  });

  it("logs an Error's .message and exits with code 1", () => {
    handleCliError(new Error("channel_not_found"), exit, log);
    expect(log).toHaveBeenCalledWith("Error: channel_not_found");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("stringifies non-Error throwables", () => {
    handleCliError("string thrown", exit, log);
    expect(log).toHaveBeenCalledWith("Error: string thrown");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("handles thrown number values", () => {
    handleCliError(42, exit, log);
    expect(log).toHaveBeenCalledWith("Error: 42");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("calls exit exactly once per error", () => {
    handleCliError(new Error("boom"), exit, log);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("preserves Error subclass message", () => {
    class WebAPIError extends Error {}
    handleCliError(new WebAPIError("not_in_channel"), exit, log);
    expect(log).toHaveBeenCalledWith("Error: not_in_channel");
  });
});

describe("requireToken", () => {
  let exit: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    exit = vi.fn();
    log = vi.fn();
  });

  it("returns user token when only SLACK_USER_TOKEN is set", () => {
    const tokens = requireToken({ SLACK_USER_TOKEN: "xoxp-1" }, exit, log);
    expect(tokens?.userToken).toBe("xoxp-1");
    expect(tokens?.botToken).toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });

  it("returns bot token when only SLACK_BOT_TOKEN is set", () => {
    const tokens = requireToken({ SLACK_BOT_TOKEN: "xoxb-1" }, exit, log);
    expect(tokens?.botToken).toBe("xoxb-1");
    expect(exit).not.toHaveBeenCalled();
  });

  it("returns both when both env vars are set", () => {
    const tokens = requireToken(
      { SLACK_USER_TOKEN: "xoxp-1", SLACK_BOT_TOKEN: "xoxb-1" },
      exit,
      log,
    );
    expect(tokens?.userToken).toBe("xoxp-1");
    expect(tokens?.botToken).toBe("xoxb-1");
  });

  it("exits with 1 and prints guidance when no token is set", () => {
    const tokens = requireToken({}, exit, log);
    expect(tokens).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "Error: SLACK_USER_TOKEN or SLACK_BOT_TOKEN is not set",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not leak env values across calls", () => {
    requireToken({ SLACK_BOT_TOKEN: "xoxb-1" }, exit, log);
    const tokens2 = requireToken({}, exit, log);
    expect(tokens2).toBeUndefined();
  });
});

describe("requireToken — integration with process.env style typing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["SLACK_USER_TOKEN"];
    delete process.env["SLACK_BOT_TOKEN"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("accepts process.env directly", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-real-shape";
    const exit = vi.fn();
    const log = vi.fn();
    const tokens = requireToken(process.env, exit, log);
    expect(tokens?.botToken).toBe("xoxb-real-shape");
    expect(exit).not.toHaveBeenCalled();
  });
});
