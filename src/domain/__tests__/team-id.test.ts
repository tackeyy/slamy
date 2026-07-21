import { describe, expect, it } from "vitest";
import { parseTeamId } from "../team-id.js";

describe("parseTeamId", () => {
  it("accepts Slack Team IDs and rejects non-canonical identifiers", () => {
    expect(parseTeamId("T0123ABC")).toBe("T0123ABC");

    for (const invalid of ["", "t0123ABC", "E0123ABC", "T 123", "T/123", "T運営"]) {
      expect(() => parseTeamId(invalid)).toThrow("Invalid Slack Team ID");
    }
  });
});
