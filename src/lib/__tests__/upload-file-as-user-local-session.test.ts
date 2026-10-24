import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlamyClient } from "../client.js";
import type { LocalSessionConnection } from "../local-session-web-client.js";

// local session の要求は broker へ渡る。broker を差し替え、呼ばれた method を見る
vi.mock("../local-session-broker.js", () => ({
  callLocalSessionBroker: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from("file content")),
}));

function connection(credentialKind: "user" | "bot"): LocalSessionConnection {
  return {
    version: 1,
    teamId: "T0TEST0001" as LocalSessionConnection["teamId"],
    credentialKind,
    socketPath: "/tmp/slamy-test.sock",
    capability: "cap",
    createdAt: "2026-10-24T00:00:00.000Z",
    expiresAt: "2026-10-25T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadFile — asUser と local session", () => {
  it("user の local session では --as-user のアップロードを受け、files.uploadV2 を broker へ渡す", async () => {
    const { callLocalSessionBroker } = await import("../local-session-broker.js");
    const client = new SlamyClient({ localSession: connection("user") });

    await client.uploadFile("C123", "/path/to/f.txt", { asUser: true, initialComment: "hi" });

    const methods = (callLocalSessionBroker as any).mock.calls.map((c: unknown[]) => c[1]);
    expect(methods).toContain("files.uploadV2");
  });

  it("bot の local session では --as-user を API を呼ばずに拒否する（bot token への暗黙の代替をしない）", async () => {
    const { callLocalSessionBroker } = await import("../local-session-broker.js");
    const client = new SlamyClient({ localSession: connection("bot") });

    await expect(
      client.uploadFile("C123", "/path/to/f.txt", { asUser: true }),
    ).rejects.toThrow("--as-user requires a user token");
    expect(callLocalSessionBroker).not.toHaveBeenCalled();
  });

  it("bot の local session でも --as-user なしのアップロードは従来どおり通る", async () => {
    const { callLocalSessionBroker } = await import("../local-session-broker.js");
    const client = new SlamyClient({ localSession: connection("bot") });

    await client.uploadFile("C123", "/path/to/f.txt", {});

    const methods = (callLocalSessionBroker as any).mock.calls.map((c: unknown[]) => c[1]);
    expect(methods).toContain("files.uploadV2");
  });
});
