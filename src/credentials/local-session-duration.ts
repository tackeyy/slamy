const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_LOCAL_SESSION_TTL_MS = DAY_MS;
export const MAX_LOCAL_SESSION_TTL_MS = 7 * DAY_MS;

export function parseLocalSessionTtl(value?: string): number {
  if (value === undefined) return DEFAULT_LOCAL_SESSION_TTL_MS;
  const match = /^(\d+)(m|h|d)$/.exec(value);
  if (!match) throw new TypeError("Session TTL must use an integer followed by m, h, or d");
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? HOUR_MS : DAY_MS;
  const ttlMs = amount * multiplier;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_LOCAL_SESSION_TTL_MS) {
    throw new RangeError("Session TTL must be between 1 minute and 7 days");
  }
  return ttlMs;
}
