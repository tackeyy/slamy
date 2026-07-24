import { SlackAdapterError } from "./errors.js";

export interface Clock {
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60_000;

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  retryPolicy: "idempotent" | "never",
  clock: Clock = realClock,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (
        retryPolicy === "never" ||
        attempt >= MAX_RETRIES ||
        !isRateLimitedError(error)
      ) {
        throw error;
      }
      const waitMs = Math.min(error.retryAfterSeconds * 1_000, MAX_RETRY_AFTER_MS);
      await clock.sleep(waitMs);
      attempt += 1;
    }
  }
}

function isRateLimitedError(
  error: unknown,
): error is SlackAdapterError & { retryAfterSeconds: number } {
  return (
    error instanceof SlackAdapterError &&
    error.code === "SLACK_RATE_LIMITED" &&
    typeof error.retryAfterSeconds === "number"
  );
}
