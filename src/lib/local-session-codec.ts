type EncodedValue =
  | null
  | string
  | number
  | boolean
  | { readonly type: "undefined" }
  | { readonly type: "buffer"; readonly base64: string }
  | { readonly type: "array"; readonly values: readonly EncodedValue[] }
  | { readonly type: "object"; readonly entries: readonly (readonly [string, EncodedValue])[] };

export function encodeLocalSessionValue(value: unknown): EncodedValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("IPC values must contain finite numbers");
    return value;
  }
  if (value === undefined) return { type: "undefined" };
  if (Buffer.isBuffer(value)) return { type: "buffer", base64: value.toString("base64") };
  if (Array.isArray(value)) {
    return { type: "array", values: value.map((item) => encodeLocalSessionValue(item)) };
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("IPC values must contain only plain objects");
    }
    return {
      type: "object",
      entries: Object.entries(value).map(([key, item]) => [key, encodeLocalSessionValue(item)]),
    };
  }
  throw new TypeError("IPC value is not serializable");
}

export function decodeLocalSessionValue(value: EncodedValue): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("IPC values must contain finite numbers");
    return value;
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new TypeError("Invalid IPC value envelope");
  }
  if (value.type === "undefined") return undefined;
  if (value.type === "buffer" && typeof value.base64 === "string") {
    return Buffer.from(value.base64, "base64");
  }
  if (value.type === "array" && Array.isArray(value.values)) {
    return value.values.map((item) => decodeLocalSessionValue(item as EncodedValue));
  }
  if (value.type === "object" && Array.isArray(value.entries)) {
    const result: Record<string, unknown> = Object.create(null);
    for (const entry of value.entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
        throw new TypeError("Invalid IPC object entry");
      }
      if (entry[0] === "__proto__" || entry[0] === "prototype" || entry[0] === "constructor") {
        throw new TypeError("Unsafe IPC object key");
      }
      result[entry[0]] = decodeLocalSessionValue(entry[1] as EncodedValue);
    }
    return result;
  }
  throw new TypeError("Invalid IPC value envelope");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
