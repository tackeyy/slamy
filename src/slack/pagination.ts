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
  maxPages?: number;
};

export async function collectCursorPages<Page>(
  options: CollectCursorPagesOptions<Page>,
): Promise<readonly Page[]> {
  const maxPages = options.maxPages ?? 1_000;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) throw invalid();

  const pages: Page[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (;;) {
    let page: Page;
    let rawNext: unknown;
    try {
      page = await options.fetchPage(cursor);
      rawNext = options.getNextCursor(page);
    } catch (error) {
      if (error instanceof CursorPaginationError) throw error;
      throw invalid();
    }
    pages.push(page);

    if (rawNext === undefined || rawNext === null || rawNext === "") {
      return Object.freeze([...pages]);
    }
    if (
      typeof rawNext !== "string" ||
      rawNext.length > 2_048 ||
      rawNext.trim() !== rawNext ||
      rawNext.length === 0 ||
      /[\u0000-\u001f\u007f]/.test(rawNext) ||
      seenCursors.has(rawNext) ||
      pages.length >= maxPages
    ) {
      throw invalid();
    }
    seenCursors.add(rawNext);
    cursor = rawNext;
  }
}

function invalid(): CursorPaginationError {
  return new CursorPaginationError();
}
