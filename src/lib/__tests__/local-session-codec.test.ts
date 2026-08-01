import { describe, expect, it } from "vitest";
import { decodeLocalSessionValue, encodeLocalSessionValue } from "../local-session-codec.js";

describe("local session IPC codec", () => {
  it("round-trips file buffers without treating user objects as codec envelopes", () => {
    const input = {
      channel_id: "C1",
      file: Buffer.from("confidential-file"),
      nested: { __slamyBuffer: "user-controlled" },
    };

    const decoded = decodeLocalSessionValue(encodeLocalSessionValue(input)) as typeof input;

    expect(decoded.file).toEqual(input.file);
    expect(decoded.nested).toEqual(input.nested);
  });

  it("round-trips every supported primitive and nested container", () => {
    const input = [null, true, false, 0, "text", undefined, [1, "two"], { value: 3 }];
    expect(decodeLocalSessionValue(encodeLocalSessionValue(input))).toEqual(input);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date(),
    () => undefined,
  ])("rejects unsupported values: %s", (value) => {
    expect(() => encodeLocalSessionValue(value)).toThrow();
  });

  it.each([
    {},
    { type: "buffer", base64: 42 },
    { type: "array", values: "not-an-array" },
    { type: "object", entries: [["__proto__", "unsafe"]] },
    { type: "object", entries: [[42, "invalid-key"]] },
    { type: "unknown" },
  ])("rejects a malformed or unsafe envelope", (value) => {
    expect(() => decodeLocalSessionValue(value as never)).toThrow();
  });
});
