import { describe, expect, it } from "vitest";
import type { Clock } from "../retry.js";
import { withRateLimitRetry } from "../retry.js";
import { SlackAdapterError } from "../errors.js";
import { parseTeamId } from "../../domain/team-id.js";

const TEAM_ID = parseTeamId("T00000001");

function makeRateLimitedError(retryAfterSeconds: number): SlackAdapterError {
  return new SlackAdapterError({
    code: "SLACK_RATE_LIMITED",
    message: "rate limited",
    requestId: "req-1",
    method: "conversations.list",
    teamId: TEAM_ID,
    credentialKind: "user",
    retryAfterSeconds,
  });
}

function makeOtherError(): SlackAdapterError {
  return new SlackAdapterError({
    code: "SLACK_PLATFORM_ERROR",
    message: "platform error",
    requestId: "req-1",
    method: "conversations.list",
    teamId: TEAM_ID,
    credentialKind: "user",
  });
}

class FakeClock implements Clock {
  readonly sleepMs: number[] = [];

  sleep(ms: number): Promise<void> {
    this.sleepMs.push(ms);
    return Promise.resolve();
  }
}

describe("withRateLimitRetry", () => {
  it("returns the result on the first successful call", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const result = await withRateLimitRetry(
      () => {
        calls += 1;
        return Promise.resolve("ok");
      },
      "idempotent",
      clock,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
    expect(clock.sleepMs).toHaveLength(0);
  });

  it("retries after SLACK_RATE_LIMITED and waits the Retry-After duration in ms", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const result = await withRateLimitRetry(
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(makeRateLimitedError(2));
        return Promise.resolve("retried");
      },
      "idempotent",
      clock,
    );
    expect(result).toBe("retried");
    expect(calls).toBe(2);
    expect(clock.sleepMs).toEqual([2_000]);
  });

  it("caps the Retry-After wait at 60 seconds", async () => {
    const clock = new FakeClock();
    let calls = 0;
    await withRateLimitRetry(
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(makeRateLimitedError(120));
        return Promise.resolve("ok");
      },
      "idempotent",
      clock,
    );
    expect(clock.sleepMs).toEqual([60_000]);
  });

  it("retries up to 3 times on SLACK_RATE_LIMITED then rethrows", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const error = makeRateLimitedError(1);
    await expect(
      withRateLimitRetry(
        () => {
          calls += 1;
          return Promise.reject(error);
        },
        "idempotent",
        clock,
      ),
    ).rejects.toBe(error);
    // 1 initial + 3 retries = 4 total calls
    expect(calls).toBe(4);
    expect(clock.sleepMs).toHaveLength(3);
  });

  it("does not retry SLACK_RATE_LIMITED when retryPolicy is never", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const error = makeRateLimitedError(5);
    await expect(
      withRateLimitRetry(
        () => {
          calls += 1;
          return Promise.reject(error);
        },
        "never",
        clock,
      ),
    ).rejects.toBe(error);
    expect(calls).toBe(1);
    expect(clock.sleepMs).toHaveLength(0);
  });

  it("rethrows non-rate-limit errors immediately without retrying", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const error = makeOtherError();
    await expect(
      withRateLimitRetry(
        () => {
          calls += 1;
          return Promise.reject(error);
        },
        "idempotent",
        clock,
      ),
    ).rejects.toBe(error);
    expect(calls).toBe(1);
    expect(clock.sleepMs).toHaveLength(0);
  });

  it("uses zero wait when retryAfterSeconds is 0", async () => {
    const clock = new FakeClock();
    let calls = 0;
    await withRateLimitRetry(
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(makeRateLimitedError(0));
        return Promise.resolve("ok");
      },
      "idempotent",
      clock,
    );
    expect(clock.sleepMs).toEqual([0]);
  });
});
