export class CursorPaginationError extends Error {
  readonly code = "PAGINATION_INVALID" as const;

  constructor() {
    super("Slack cursor pagination could not continue safely");
    this.name = "CursorPaginationError";
  }

  toJSON(): { name: string; code: "PAGINATION_INVALID"; message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }
}

export type CollectCursorPagesOptions<Page> = {
  fetchPage(cursor: string | undefined): Promise<Page>;
  getNextCursor(page: Page): unknown;
  initialCursor?: string;
  preserveFetchError?(error: unknown): boolean;
  maxPages?: number;
};

export async function collectCursorPages<Page>(
  options: CollectCursorPagesOptions<Page>,
): Promise<readonly Page[]> {
  let maxPages: number;
  let cursor: string | undefined;
  let preserveFetchError: ((error: unknown) => boolean) | undefined;
  try {
    maxPages = options.maxPages ?? 1_000;
    cursor = options.initialCursor;
    preserveFetchError = options.preserveFetchError;
    if (
      !Number.isInteger(maxPages) ||
      maxPages < 1 ||
      maxPages > 1_000 ||
      (preserveFetchError !== undefined && typeof preserveFetchError !== "function") ||
      (cursor !== undefined && !isValidCursor(cursor))
    ) {
      throw new TypeError();
    }
  } catch {
    throw invalid();
  }

  const pages: Page[] = [];
  const seenCursors = new Set<string>(cursor === undefined ? [] : [cursor]);

  for (;;) {
    let page: Page;
    try {
      page = await options.fetchPage(cursor);
    } catch (error) {
      let preserve = false;
      try {
        preserve = preserveFetchError?.(error) === true;
      } catch {
        // A hostile predicate cannot make an untrusted error observable.
      }
      if (preserve) throw error;
      throw invalid();
    }
    pages.push(page);

    let rawNext: unknown;
    try {
      rawNext = options.getNextCursor(page);
    } catch {
      throw invalid();
    }

    if (rawNext === undefined || rawNext === null || rawNext === "") {
      return Object.freeze([...pages]);
    }
    if (
      !isValidCursor(rawNext) ||
      seenCursors.has(rawNext) ||
      pages.length >= maxPages
    ) {
      throw invalid();
    }
    seenCursors.add(rawNext);
    cursor = rawNext;
  }
}

function isValidCursor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 2_048 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function invalid(): CursorPaginationError {
  return new CursorPaginationError();
}
