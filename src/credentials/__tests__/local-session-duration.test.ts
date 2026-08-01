import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_SESSION_TTL_MS,
  MAX_LOCAL_SESSION_TTL_MS,
  parseLocalSessionTtl,
} from "../local-session-duration.js";

describe("local session duration", () => {
  it("defaults to 24 hours and accepts an explicit duration up to 7 days", () => {
    expect(parseLocalSessionTtl()).toBe(DEFAULT_LOCAL_SESSION_TTL_MS);
    expect(parseLocalSessionTtl("7d")).toBe(MAX_LOCAL_SESSION_TTL_MS);
  });

  it.each(["0m", "8d", "1.5h", "24", "forever"])(
    "rejects an invalid or overlong TTL: %s",
    (value) => {
      expect(() => parseLocalSessionTtl(value)).toThrow();
    },
  );
});
