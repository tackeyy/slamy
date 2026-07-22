import { describe, expect, it } from "vitest";
import { collectCursorPages } from "../pagination.js";

describe("collectCursorPages", () => {
  it("continues only from next_cursor even when a page is empty or smaller than its limit", async () => {
    const seen: Array<string | undefined> = [];
    const responses = [
      { items: [], response_metadata: { next_cursor: "cursor-2" } },
      { items: ["second"], response_metadata: { next_cursor: "cursor-3" } },
      { items: ["third"], response_metadata: { next_cursor: "" } },
    ];
    const pages = await collectCursorPages({
      fetchPage(cursor) {
        seen.push(cursor);
        return Promise.resolve(responses[seen.length - 1]);
      },
      getNextCursor: (page) => page?.response_metadata?.next_cursor,
    });

    expect(seen).toEqual([undefined, "cursor-2", "cursor-3"]);
    expect(pages).toEqual(responses);
    expect(Object.isFrozen(pages)).toBe(true);
  });

  it.each([undefined, null, ""])('stops for an empty next cursor value %j', async (next) => {
    let calls = 0;
    const pages = await collectCursorPages({
      fetchPage: () => {
        calls += 1;
        return Promise.resolve({ response_metadata: { next_cursor: next } });
      },
      getNextCursor: (page) => page.response_metadata.next_cursor,
    });
    expect(pages).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it("rejects repeated, whitespace, overlong, throwing, and over-limit cursor sequences safely", async () => {
    const canary = "xoxp-cursor-secret-canary";
    const cases = [
      async () =>
        collectCursorPages({
          fetchPage: (cursor) =>
            Promise.resolve({ next: cursor === undefined ? "same" : "same" }),
          getNextCursor: (page) => page.next,
        }),
      async () =>
        collectCursorPages({
          fetchPage: () => Promise.resolve({ next: "   " }),
          getNextCursor: (page) => page.next,
        }),
      async () =>
        collectCursorPages({
          fetchPage: () => Promise.resolve({ next: "x".repeat(2049) }),
          getNextCursor: (page) => page.next,
        }),
      async () =>
        collectCursorPages({
          fetchPage: () => Promise.reject(new Error(canary)),
          getNextCursor: () => undefined,
        }),
      async () =>
        collectCursorPages({
          maxPages: 1,
          fetchPage: () => Promise.resolve({ next: "more" }),
          getNextCursor: (page) => page.next,
        }),
    ];

    for (const run of cases) {
      let caught: unknown;
      try {
        await run();
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "PAGINATION_INVALID" });
      expect(String(caught)).not.toContain(canary);
      expect(JSON.stringify(caught)).not.toContain(canary);
      expect(caught instanceof Error ? caught.stack : "").not.toContain(canary);
    }
  });

  it("preserves only fetch errors explicitly approved by the caller", async () => {
    const approved = Object.freeze({ code: "SAFE_TYPED_ERROR" });
    await expect(
      collectCursorPages({
        fetchPage: () => Promise.reject(approved),
        getNextCursor: () => undefined,
        preserveFetchError: (error) => error === approved,
      }),
    ).rejects.toBe(approved);
  });

  it("starts from an explicit initial cursor and treats it as already seen", async () => {
    const seen: Array<string | undefined> = [];
    await expect(
      collectCursorPages({
        initialCursor: "cursor-1",
        fetchPage(cursor) {
          seen.push(cursor);
          return Promise.resolve({ next: "cursor-1" });
        },
        getNextCursor: (page) => page.next,
      }),
    ).rejects.toMatchObject({ code: "PAGINATION_INVALID" });
    expect(seen).toEqual(["cursor-1"]);
  });
});
