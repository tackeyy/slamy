import { vi } from "vitest";

export function createMockWebClient() {
  return {
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456", channel: "C123" }),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
    conversations: {
      list: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
      history: vi.fn().mockResolvedValue({ ok: true, messages: [] }),
      info: vi.fn().mockResolvedValue({ ok: true, channel: {} }),
      replies: vi.fn().mockResolvedValue({ ok: true, messages: [] }),
    },
    reactions: {
      add: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
    files: {
      uploadV2: vi.fn().mockResolvedValue({ ok: true }),
    },
    users: {
      list: vi.fn().mockResolvedValue({ ok: true, members: [] }),
      info: vi.fn().mockResolvedValue({ ok: true, user: {} }),
      conversations: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
    },
    search: {
      messages: vi.fn().mockResolvedValue({ ok: true, messages: { matches: [], total: 0, paging: { page: 1 } } }),
    },
    auth: {
      test: vi.fn().mockResolvedValue({ ok: true, user_id: "U123", user: "testuser", team_id: "T123", team: "TestTeam", url: "https://test.slack.com" }),
    },
  };
}
