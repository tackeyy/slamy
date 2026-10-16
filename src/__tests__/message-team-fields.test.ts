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
  (WebClient as any).mockImplementation(function () {
    return mock;
  });
  const client = new SlamyClient({ botToken: "xoxb-test", userToken: "xoxp-test" });
  return { client, mock };
}

const withTeams = {
  ts: "1792128333.989319",
  user: "U001",
  text: "body",
  team: "T0OWN",
  user_team: "T0USER",
  source_team: "T0SOURCE",
  app_id: "A0APP",
};
const withoutTeams = { ts: "1792128345.346969", user: "U001", text: "body", team: "T0OWN" };

describe("Slack Connect の帰属に使う項目（user_team・source_team・app_id）", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("conversations.history の user_team・source_team・app_id を透過する", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.history.mockResolvedValue({ ok: true, messages: [withTeams, withoutTeams], has_more: false, response_metadata: { next_cursor: "" } } as any);
    const [a, b] = await client.getChannelHistory("C123", { limit: 5 });
    expect(a!.user_team).toBe("T0USER");
    expect(a!.source_team).toBe("T0SOURCE");
    expect(a!.app_id).toBe("A0APP");
    expect(b!.user_team).toBeUndefined();
    expect(b!.source_team).toBeUndefined();
    expect(b!.app_id).toBeUndefined();
  });

  it("conversations.replies の user_team・source_team・app_id を透過する", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.replies.mockResolvedValue({ ok: true, messages: [withTeams, withoutTeams], has_more: false, response_metadata: { next_cursor: "" } } as any);
    const res: any = await client.getThreadReplies("C123", "1792128333.989319");
    const ms = Array.isArray(res) ? res : res.messages;
    expect(ms[0].user_team).toBe("T0USER");
    expect(ms[0].source_team).toBe("T0SOURCE");
    expect(ms[0].app_id).toBe("A0APP");
    expect(ms[1].user_team).toBeUndefined();
  });
});
