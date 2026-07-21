import { parseTeamId, type TeamId } from "../domain/team-id.js";
import { TargetError } from "./errors.js";
import {
  parseChannelId,
  parseCompactSlackTimestamp,
  parseEnterpriseId,
  parseSlackTimestamp,
  parseSlackTimestampEither,
  type ChannelId,
  type EnterpriseId,
  type SlackTimestamp,
} from "./values.js";

export type ParseTargetRequest = {
  input: string;
  messageTs?: string;
  threadTs?: string;
};

export type ParsedTargetEvidence = {
  readonly source: "archives-permalink" | "app-client-url" | "legacy";
  readonly isUrl: boolean;
  readonly channelId: ChannelId;
  readonly messageTs?: SlackTimestamp;
  readonly threadTs?: SlackTimestamp;
  readonly hostname?: string;
  readonly teamId?: TeamId;
  readonly enterpriseId?: EnterpriseId;
};

export function parseTargetEvidence(request: ParseTargetRequest): ParsedTargetEvidence {
  const input = request.input;
  const parsed = isUrlInput(input) ? parseUrl(input) : parseLegacy(input);
  return Object.freeze(mergeExplicitTimestamps(parsed, request));
}

function parseUrl(input: string): ParsedTargetEvidence {
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]/.test(input)) {
    throw new TargetError("INVALID_TARGET", "Slack target URL is invalid");
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new TargetError("INVALID_TARGET", "Slack target URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new TargetError("UNSUPPORTED_URL", "Slack target URL must use HTTPS");
  }
  if (url.username || url.password || url.port) {
    throw new TargetError("UNSUPPORTED_URL", "Slack target URL authority is unsupported");
  }
  if (/%(?![0-9A-Fa-f]{2})/.test(`${url.pathname}${url.search}`)) {
    throw new TargetError("INVALID_URL_ENCODING", "Slack target URL encoding is invalid");
  }

  if (url.hostname.toLowerCase() === "app.slack.com") return parseAppUrl(url);
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.slack\.com$/i.test(url.hostname)) {
    return parseArchivesUrl(url);
  }
  throw new TargetError("UNSUPPORTED_URL", "Slack target URL host is unsupported");
}

function parseArchivesUrl(url: URL): ParsedTargetEvidence {
  const segments = pathSegments(url.pathname);
  if (segments.length !== 3 || segments[0] !== "archives" || !segments[2]?.startsWith("p")) {
    throw new TargetError("UNSUPPORTED_URL", "Slack archives URL shape is unsupported");
  }
  const channelId = parseChannelId(decodePathSegment(segments[1]));
  const messageTs = parseCompactSlackTimestamp(decodePathSegment(segments[2]).slice(1));
  const cid = uniqueQueryValue(url.searchParams, "cid");
  if (cid !== undefined && parseChannelId(safeDecodedValue(cid)) !== channelId) {
    throw new TargetError("CHANNEL_CONFLICT", "Slack URL contains conflicting channel IDs");
  }
  const threadValue = uniqueQueryValue(url.searchParams, "thread_ts");
  const threadTs = threadValue === undefined ? undefined : parseSlackTimestamp(safeDecodedValue(threadValue));
  return Object.freeze({
    source: "archives-permalink",
    isUrl: true,
    hostname: url.hostname.toLowerCase(),
    channelId,
    messageTs,
    ...(threadTs ? { threadTs } : {}),
  });
}

function parseAppUrl(url: URL): ParsedTargetEvidence {
  const segments = pathSegments(url.pathname);
  if (segments.length < 3 || segments.length > 4 || segments[0] !== "client") {
    throw new TargetError("UNSUPPORTED_URL", "Slack app client URL shape is unsupported");
  }
  const workspaceId = decodePathSegment(segments[1]);
  const channelId = parseChannelId(decodePathSegment(segments[2]));
  let threadTs: SlackTimestamp | undefined;
  if (segments[3] !== undefined) {
    const thread = decodePathSegment(segments[3]);
    const match = /^thread-([CDG][A-Z0-9]{1,63})-(.+)$/.exec(thread);
    if (!match) throw new TargetError("UNSUPPORTED_URL", "Slack app thread URL shape is unsupported");
    if (parseChannelId(match[1]) !== channelId) {
      throw new TargetError("CHANNEL_CONFLICT", "Slack app URL contains conflicting channel IDs");
    }
    threadTs = parseSlackTimestampEither(match[2]);
  }

  const workspaceEvidence = workspaceId.startsWith("T")
    ? { teamId: safeTeamId(workspaceId) }
    : { enterpriseId: parseEnterpriseId(workspaceId) };
  return Object.freeze({
    source: "app-client-url",
    isUrl: true,
    channelId,
    ...workspaceEvidence,
    ...(threadTs ? { threadTs } : {}),
  });
}

function parseLegacy(input: string): ParsedTargetEvidence {
  return Object.freeze({ source: "legacy", isUrl: false, channelId: parseChannelId(input) });
}

function mergeExplicitTimestamps(
  parsed: ParsedTargetEvidence,
  request: ParseTargetRequest,
): ParsedTargetEvidence {
  const explicitMessage = request.messageTs === undefined ? undefined : parseSlackTimestamp(request.messageTs);
  const explicitThread = request.threadTs === undefined ? undefined : parseSlackTimestamp(request.threadTs);
  if (parsed.messageTs && explicitMessage && parsed.messageTs !== explicitMessage) {
    throw new TargetError("TIMESTAMP_CONFLICT", "Message timestamp conflicts with Slack URL");
  }
  if (parsed.threadTs && explicitThread && parsed.threadTs !== explicitThread) {
    throw new TargetError("TIMESTAMP_CONFLICT", "Thread timestamp conflicts with Slack URL");
  }
  return {
    ...parsed,
    ...(parsed.messageTs || explicitMessage ? { messageTs: parsed.messageTs ?? explicitMessage } : {}),
    ...(parsed.threadTs || explicitThread ? { threadTs: parsed.threadTs ?? explicitThread } : {}),
  };
}

function pathSegments(pathname: string): string[] {
  const withoutTrailingSlash = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const segments = withoutTrailingSlash.split("/").slice(1);
  if (segments.some((segment) => segment.length === 0)) {
    throw new TargetError("UNSUPPORTED_URL", "Slack target URL path is unsupported");
  }
  return segments;
}

function decodePathSegment(value: string | undefined): string {
  if (value === undefined) throw new TargetError("INVALID_TARGET", "Slack target path is incomplete");
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new TargetError("INVALID_URL_ENCODING", "Slack target URL encoding is invalid");
  }
  if (decoded.includes("%") || decoded.includes("/") || decoded.includes("\\")) {
    throw new TargetError("INVALID_URL_ENCODING", "Slack target URL encoding is ambiguous");
  }
  return decoded;
}

function safeDecodedValue(value: string): string {
  if (value.includes("%") || value.includes("/") || value.includes("\\")) {
    throw new TargetError("INVALID_URL_ENCODING", "Slack target URL encoding is ambiguous");
  }
  return value;
}

function uniqueQueryValue(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) {
    throw new TargetError("AMBIGUOUS_QUERY", "Slack target URL contains duplicate routing fields");
  }
  return values[0];
}

function safeTeamId(value: string): TeamId {
  try {
    return parseTeamId(value);
  } catch {
    throw new TargetError("INVALID_TARGET", "Slack Team ID is invalid");
  }
}

function isUrlInput(input: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(input);
}
