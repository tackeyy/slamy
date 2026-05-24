import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlamyClient } from "../lib/client.js";
import { createMockWebClient } from "./helpers/mock-slack.js";

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
  LogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
}));

async function makeClient() {
  const mock = createMockWebClient();
  const { WebClient } = vi.mocked(await import("@slack/web-api"));
  (WebClient as any).mockImplementation(() => mock);
  const client = new SlamyClient({ botToken: "xoxb-test", userToken: "xoxp-test" });
  return { client, mock };
}

describe("resolveUserName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("users.list を 1 回だけ呼び、cache から実名を返す", async () => {
    const { client, mock } = await makeClient();
    mock.users.list.mockResolvedValue({
      ok: true,
      members: [
        { id: "U001", name: "alice", real_name: "Alice Allen", profile: { display_name: "Alice" } },
        { id: "U002", name: "bob", real_name: "Bob Brown", profile: { display_name: "" } },
      ],
    } as any);

    const r1 = await client.resolveUserName("U001");
    const r2 = await client.resolveUserName("U002");
    const r3 = await client.resolveUserName("U001");

    expect(r1).toBe("Alice");
    expect(r2).toBe("Bob Brown");
    expect(r3).toBe("Alice");
    expect(mock.users.list).toHaveBeenCalledTimes(1);
  });

  it("cache miss 時は users.info で取得して cache に追加する", async () => {
    const { client, mock } = await makeClient();
    mock.users.list.mockResolvedValue({ ok: true, members: [] } as any);
    mock.users.info.mockResolvedValue({
      ok: true,
      user: {
        id: "U999",
        name: "carol",
        real_name: "Carol Cline",
        profile: { display_name: "Carol C" },
      },
    } as any);

    const r1 = await client.resolveUserName("U999");
    const r2 = await client.resolveUserName("U999");

    expect(r1).toBe("Carol C");
    expect(r2).toBe("Carol C");
    expect(mock.users.info).toHaveBeenCalledTimes(1);
  });

  it("bot ID (B...) は bots.info で解決する", async () => {
    const { client, mock } = await makeClient();
    mock.users.list.mockResolvedValue({ ok: true, members: [] } as any);
    (mock as any).bots = {
      info: vi.fn().mockResolvedValue({ ok: true, bot: { id: "B123", name: "MyBot" } }),
    };

    const result = await client.resolveUserName("B123");
    expect(result).toBe("MyBot");
    expect((mock as any).bots.info).toHaveBeenCalledWith({ bot: "B123" });
  });

  it("解決失敗時は user_id をそのまま返す", async () => {
    const { client, mock } = await makeClient();
    mock.users.list.mockResolvedValue({ ok: true, members: [] } as any);
    mock.users.info.mockRejectedValue(new Error("user_not_found"));

    const result = await client.resolveUserName("U_MISSING");
    expect(result).toBe("U_MISSING");
  });

  it("空文字列はそのまま返す", async () => {
    const { client } = await makeClient();
    expect(await client.resolveUserName("")).toBe("");
  });

  it("複数 user_id を batch で解決する (resolveUserNames)", async () => {
    const { client, mock } = await makeClient();
    mock.users.list.mockResolvedValue({
      ok: true,
      members: [
        { id: "U001", profile: { display_name: "Alice" } },
        { id: "U002", profile: { display_name: "Bob" } },
        { id: "U003", profile: { display_name: "Carol" } },
      ],
    } as any);

    const result = await client.resolveUserNames(["U001", "U002", "U003"]);
    expect(result.get("U001")).toBe("Alice");
    expect(result.get("U002")).toBe("Bob");
    expect(result.get("U003")).toBe("Carol");
    expect(mock.users.list).toHaveBeenCalledTimes(1);
  });
});
