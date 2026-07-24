import { describe, expect, it } from "vitest";
import {
  collectCursorPages,
  CursorPaginationError,
  PartialPaginationError,
} from "../pagination.js";

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

  it("does not trust Proxy or forged pagination errors from fetchPage", async () => {
    const canary = "xoxp-pagination-proxy-canary";
    const proxy = new Proxy(Object.create(null) as object, {
      getPrototypeOf(): never {
        throw new Error(canary);
      },
    });
    const forged = new CursorPaginationError();
    forged.message = canary;

    for (const failure of [proxy, forged]) {
      let caught: unknown;
      try {
        await collectCursorPages({
          fetchPage: () => Promise.reject(failure),
          getNextCursor: () => undefined,
          preserveFetchError: () => false,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "PAGINATION_INVALID" });
      expect(String(caught)).not.toContain(canary);
      expect(JSON.stringify(caught)).not.toContain(canary);
      expect(caught instanceof Error ? caught.stack : "").not.toContain(canary);
    }
  });
});


describe("collectCursorPages item-level limit", () => {
  type Page = { items: string[]; next?: string };

  it("stops after accumulating the item limit and does not call fetchPage again", async () => {
    let calls = 0;
    const pages = await collectCursorPages({
      fetchPage: () => {
        calls += 1;
        return Promise.resolve({ items: ["a", "b", "c"], next: calls === 1 ? "cursor-2" : "" });
      },
      getNextCursor: (page) => page.next,
      getItems: (page) => page.items,
      limit: 5,
    });
    // First page gives 3 items, second page gives 3 more >= 5, stop
    expect(calls).toBe(2);
    expect(pages).toHaveLength(2);
  });

  it("stops exactly at the limit without fetching additional pages", async () => {
    let calls = 0;
    const pages = await collectCursorPages({
      fetchPage: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve({ items: ["a", "b", "c"], next: "cursor-2" });
        if (calls === 2) return Promise.resolve({ items: ["d", "e"], next: "cursor-3" });
        return Promise.resolve({ items: ["f"], next: "" });
      },
      getNextCursor: (page) => page.next,
      getItems: (page) => page.items,
      limit: 5,
    });
    // 3 + 2 = 5, exactly at limit, should not call 3rd page
    expect(calls).toBe(2);
    expect(pages).toHaveLength(2);
  });

  it("collects all pages when limit is not reached", async () => {
    let calls = 0;
    const pages = await collectCursorPages({
      fetchPage: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve({ items: ["a"], next: "cursor-2" });
        return Promise.resolve({ items: ["b"], next: "" });
      },
      getNextCursor: (page) => page.next,
      getItems: (page) => page.items,
      limit: 10,
    });
    expect(pages).toHaveLength(2);
  });

  it("maxPages and limit are independent constraints — whichever fires first wins", async () => {
    let calls = 0;
    await collectCursorPages({
      fetchPage: () => {
        calls += 1;
        return Promise.resolve({ items: ["x", "y"], next: `cursor-${calls + 1}` });
      },
      getNextCursor: (page) => page.next,
      getItems: (page) => page.items,
      limit: 100,
      maxPages: 3,
    });
    expect(calls).toBe(3);
  });
});

describe("PartialPaginationError", () => {
  type Page = { items: string[]; next?: string };

  it("is thrown when a later page fetch fails after partial success", async () => {
    let calls = 0;
    const approved = new Error("network-error");
    let caught: unknown;
    try {
      await collectCursorPages({
        fetchPage: () => {
          calls += 1;
          if (calls === 1) return Promise.resolve({ items: ["a", "b"], next: "cursor-2" });
          return Promise.reject(approved);
        },
        getNextCursor: (page: Page) => page.next,
        getItems: (page: Page) => page.items,
        preserveFetchError: (error) => error === approved,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PartialPaginationError);
    const partial = caught as PartialPaginationError<Page>;
    expect(partial.code).toBe("PAGINATION_PARTIAL");
    expect(partial.pages).toHaveLength(1);
    expect(partial.pages[0]).toMatchObject({ items: ["a", "b"] });
    expect(partial.cause).toBe(approved);
  });

  it("carries the collected pages on the error instance", async () => {
    const approved = new Error("transient");
    let caught: unknown;
    try {
      await collectCursorPages({
        fetchPage: (cursor) => {
          if (cursor === undefined) return Promise.resolve({ items: ["x"], next: "cursor-2" });
          if (cursor === "cursor-2") return Promise.resolve({ items: ["y"], next: "cursor-3" });
          return Promise.reject(approved);
        },
        getNextCursor: (page: Page) => page.next,
        getItems: (page: Page) => page.items,
        preserveFetchError: (error) => error === approved,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PartialPaginationError);
    const partial = caught as PartialPaginationError<Page>;
    expect(partial.pages).toHaveLength(2);
  });

  it("uses the original error (not PartialPaginationError) when the first page fetch fails with preserveFetchError", async () => {
    const approved = new Error("first-page-fail");
    let caught: unknown;
    try {
      await collectCursorPages({
        fetchPage: () => Promise.reject(approved),
        getNextCursor: () => undefined,
        getItems: (page: Page) => page.items,
        preserveFetchError: (error) => error === approved,
      });
    } catch (error) {
      caught = error;
    }
    // First page failure with no collected pages → preserve the original error
    expect(caught).toBe(approved);
  });

  it("toJSON includes the code and page count", () => {
    const pages = [{ items: ["a"] }] as Page[];
    const error = new PartialPaginationError(pages);
    const json = error.toJSON();
    expect(json.code).toBe("PAGINATION_PARTIAL");
    expect(json.pageCount).toBe(1);
  });
});
