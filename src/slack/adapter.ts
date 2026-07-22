import type {
  CredentialKind,
  VerifiedCredential,
} from "../credentials/types.js";
import { parseTeamId, type TeamId } from "../domain/team-id.js";
import {
  createLocalRequestId,
  emitDiagnostic,
  validateRequestId,
  type SlackDiagnosticSink,
  type SlackRequestIdFactory,
} from "./diagnostics.js";
import { SlackAdapterError, type SlackAdapterErrorCode } from "./errors.js";
import {
  getSlackMethodPolicy,
  type SlackMethodPolicy,
  type SlackOperation,
} from "./method-policy.js";
import { collectCursorPages } from "./pagination.js";
import type { SlackTransport } from "./transport.js";
import type { SlackWorkspaceContext } from "./workspace-context.js";

const UNKNOWN_TEAM_ID = parseTeamId("TUNKNOWN");

type SlackExecutionContext = {
  readonly teamId: TeamId;
  readonly user?: VerifiedCredential;
  readonly bot?: VerifiedCredential;
  readonly requiredScopes: Readonly<Partial<Record<CredentialKind, readonly string[]>>>;
};

export type SlackVerificationHookInput = {
  readonly teamId: TeamId;
  readonly operation: SlackOperation;
  readonly credentialKind: CredentialKind;
};

export type SlackVerificationHook = (input: SlackVerificationHookInput) => void | Promise<void>;

export type WorkspaceSlackAdapterOptions = {
  transport: SlackTransport;
  requestIdFactory?: SlackRequestIdFactory;
  diagnosticSink?: SlackDiagnosticSink;
  verificationHook?: SlackVerificationHook;
};

export type SlackTeamInfo = {
  readonly teamId: TeamId;
  readonly name: string;
};

export type SlackAuthIdentity = {
  readonly teamId: TeamId;
  readonly userId: string;
  readonly botId?: string;
  readonly enterpriseId?: string;
};

export type SlackPublicConversation = {
  readonly channelId: string;
  readonly name: string;
  readonly isArchived: boolean;
  readonly isPrivate: boolean;
};

export type SlackConversationPage = {
  readonly conversations: readonly SlackPublicConversation[];
  readonly nextCursor?: string;
};

export type SlackListPublicConversationsInput = {
  readonly limit?: number;
  readonly cursor?: string;
  readonly excludeArchived?: boolean;
  readonly maxPages?: number;
};

export type SlackSearchMessagesInput = {
  readonly query: string;
  readonly count?: number;
};

export type SlackSearchMessage = {
  readonly channelId: string;
  readonly timestamp: string;
  readonly text: string;
};

export type SlackPostMessageInput = {
  channelId: string;
  text: string;
  threadTs?: string;
};

export type SlackPostMessageResult = {
  readonly channelId: string;
  readonly timestamp: string;
};

export interface WorkspaceSlackOperations {
  verifyWorkspace(
    context: SlackWorkspaceContext,
    credentialKind: CredentialKind,
  ): Promise<SlackAuthIdentity>;
  getTeamInfo(context: SlackWorkspaceContext): Promise<SlackTeamInfo>;
  listPublicConversations(
    context: SlackWorkspaceContext,
    input?: SlackListPublicConversationsInput,
  ): Promise<SlackConversationPage>;
  listAllPublicConversations(
    context: SlackWorkspaceContext,
    input?: SlackListPublicConversationsInput,
  ): Promise<readonly SlackPublicConversation[]>;
  searchMessages(
    context: SlackWorkspaceContext,
    input: SlackSearchMessagesInput,
  ): Promise<readonly SlackSearchMessage[]>;
  postMessage(
    context: SlackWorkspaceContext,
    input: SlackPostMessageInput,
  ): Promise<SlackPostMessageResult>;
}

export class WorkspaceSlackAdapter implements WorkspaceSlackOperations {
  readonly #transport: SlackTransport;
  readonly #requestIdFactory: SlackRequestIdFactory;
  readonly #diagnosticSink?: SlackDiagnosticSink;
  readonly #verificationHook?: SlackVerificationHook;

  constructor(options: WorkspaceSlackAdapterOptions) {
    this.#transport = options.transport;
    this.#requestIdFactory = options.requestIdFactory ?? createLocalRequestId;
    this.#diagnosticSink = options.diagnosticSink;
    this.#verificationHook = options.verificationHook;
  }

  getTeamInfo(context: SlackWorkspaceContext): Promise<SlackTeamInfo> {
    return this.#execute("get-team-info", context, {}, mapTeamInfo);
  }

  verifyWorkspace(
    context: SlackWorkspaceContext,
    credentialKind: CredentialKind,
  ): Promise<SlackAuthIdentity> {
    if (credentialKind !== "user" && credentialKind !== "bot") {
      return Promise.reject(this.#inputError("verify-user", context));
    }
    const operation = credentialKind === "user" ? "verify-user" : "verify-bot";
    return this.#execute(operation, context, {}, (value, teamId) =>
      mapAuthIdentity(value, teamId, credentialKind),
    );
  }

  async listPublicConversations(
    context: SlackWorkspaceContext,
    input: SlackListPublicConversationsInput = {},
  ): Promise<SlackConversationPage> {
    let args: Readonly<Record<string, unknown>>;
    try {
      const limit = input.limit ?? 200;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TypeError();
      const cursor = input.cursor === undefined ? undefined : parseCursor(input.cursor);
      if (input.excludeArchived !== undefined && typeof input.excludeArchived !== "boolean") {
        throw new TypeError();
      }
      args = Object.freeze({
        types: "public_channel",
        limit,
        ...(cursor ? { cursor } : {}),
        ...(input.excludeArchived === undefined
          ? {}
          : { exclude_archived: input.excludeArchived }),
      });
    } catch {
      throw this.#inputError("list-public-conversations", context);
    }
    return this.#execute("list-public-conversations", context, args, mapConversationPage);
  }

  async listAllPublicConversations(
    context: SlackWorkspaceContext,
    input: SlackListPublicConversationsInput = {},
  ): Promise<readonly SlackPublicConversation[]> {
    const pages = await collectCursorPages({
      ...(input.maxPages === undefined ? {} : { maxPages: input.maxPages }),
      fetchPage: (cursor) =>
        this.listPublicConversations(context, {
          ...input,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      getNextCursor: (page) => page.nextCursor,
    });
    return Object.freeze(pages.flatMap((page) => page.conversations));
  }

  async searchMessages(
    context: SlackWorkspaceContext,
    input: SlackSearchMessagesInput,
  ): Promise<readonly SlackSearchMessage[]> {
    let args: Readonly<Record<string, unknown>>;
    try {
      if (
        typeof input.query !== "string" ||
        input.query.trim().length === 0 ||
        input.query.length > 4_096 ||
        /[\u0000\u007f]/.test(input.query)
      ) {
        throw new TypeError();
      }
      const count = input.count ?? 20;
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new TypeError();
      args = Object.freeze({ query: input.query, count });
    } catch {
      throw this.#inputError("search-messages", context);
    }
    return this.#execute("search-messages", context, args, mapSearchMessages);
  }

  async postMessage(
    context: SlackWorkspaceContext,
    input: SlackPostMessageInput,
  ): Promise<SlackPostMessageResult> {
    let args: Readonly<Record<string, unknown>>;
    try {
      const channelId = parseChannelId(input.channelId);
      if (
        typeof input.text !== "string" ||
        input.text.length === 0 ||
        input.text.length > 40_000 ||
        /[\u0000\u007f]/.test(input.text)
      ) {
        throw new TypeError();
      }
      const threadTs = input.threadTs === undefined ? undefined : parseTimestamp(input.threadTs);
      args = Object.freeze({
        channel: channelId,
        text: input.text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      });
    } catch {
      throw this.#inputError("post-message", context);
    }
    return this.#execute("post-message", context, args, mapPostMessage);
  }

  async #execute<Result>(
    operation: SlackOperation,
    context: SlackWorkspaceContext,
    args: Readonly<Record<string, unknown>>,
    map: (value: unknown, teamId: TeamId) => Result,
  ): Promise<Result> {
    const policy = getSlackMethodPolicy(operation);
    const safeContext = this.#validateContext(context, policy);
    const requestId = this.#requestId(policy, safeContext.teamId);
    const credential = this.#selectCredential(safeContext, policy, requestId);
    this.#assertScopeContract(safeContext, policy, requestId);
    emitDiagnostic(this.#diagnosticSink, diagnostic(policy, safeContext.teamId, requestId, "started"));

    try {
      await this.#verificationHook?.(
        Object.freeze({
          teamId: safeContext.teamId,
          operation,
          credentialKind: policy.credentialKind,
        }),
      );
    } catch {
      const error = adapterError(
        "WORKSPACE_VERIFICATION_FAILED",
        "Slack workspace verification hook rejected the operation",
        policy,
        safeContext.teamId,
        requestId,
      );
      emitDiagnostic(this.#diagnosticSink, failedDiagnostic(policy, safeContext.teamId, requestId, error.code));
      throw error;
    }

    try {
      const response = await credential.use((token) =>
        this.#transport.call({
          method: policy.method,
          token,
          arguments: args,
          requestId,
          teamId: safeContext.teamId,
        }),
      );
      const result = map(response, safeContext.teamId);
      emitDiagnostic(
        this.#diagnosticSink,
        diagnostic(policy, safeContext.teamId, requestId, "succeeded"),
      );
      return result;
    } catch (cause) {
      const error = normalizeFailure(cause, policy, safeContext.teamId, requestId);
      emitDiagnostic(
        this.#diagnosticSink,
        failedDiagnostic(policy, safeContext.teamId, requestId, error.code),
      );
      throw error;
    }
  }

  #validateContext(
    context: SlackWorkspaceContext,
    policy: SlackMethodPolicy,
  ): SlackExecutionContext {
    try {
      const teamId = parseTeamId(context.teamId);
      const credentials = context.credentials;
      const credentialTeamId = parseTeamId(credentials.teamId);
      const user = credentials.user;
      const bot = credentials.bot;
      if (
        credentialTeamId !== teamId ||
        (user !== undefined &&
          (user.kind !== "user" || parseTeamId(user.teamId) !== teamId)) ||
        (bot !== undefined &&
          (bot.kind !== "bot" || parseTeamId(bot.teamId) !== teamId))
      ) {
        throw new TypeError();
      }

      const sourceScopes = credentials.requiredScopes;
      const requiredScopes = Object.freeze({
        ...(sourceScopes.user === undefined
          ? {}
          : { user: copyScopeContract(sourceScopes.user) }),
        ...(sourceScopes.bot === undefined
          ? {}
          : { bot: copyScopeContract(sourceScopes.bot) }),
      });
      return Object.freeze({ teamId, user, bot, requiredScopes });
    } catch {
      throw adapterError(
        "WORKSPACE_CONTEXT_MISMATCH",
        "Slack workspace context does not match its verified credentials",
        policy,
        safeContextTeamId(context),
        "unavailable",
      );
    }
  }

  #requestId(policy: SlackMethodPolicy, teamId: TeamId): string {
    try {
      return validateRequestId(this.#requestIdFactory());
    } catch {
      throw adapterError(
        "INVALID_REQUEST_ID",
        "Slack operation request ID is invalid",
        policy,
        teamId,
        "unavailable",
      );
    }
  }

  #selectCredential(
    context: SlackExecutionContext,
    policy: SlackMethodPolicy,
    requestId: string,
  ): VerifiedCredential {
    const credential = context[policy.credentialKind];
    if (!credential) {
      throw adapterError(
        "CREDENTIAL_UNAVAILABLE",
        "Required Slack credential kind is unavailable",
        policy,
        context.teamId,
        requestId,
      );
    }
    return credential;
  }

  #assertScopeContract(
    context: SlackExecutionContext,
    policy: SlackMethodPolicy,
    requestId: string,
  ): void {
    const declared = context.requiredScopes[policy.credentialKind] ?? [];
    if (!policy.requiredScopes.every((scope) => declared.includes(scope))) {
      throw adapterError(
        "CREDENTIAL_SCOPE_CONTRACT_MISMATCH",
        "Slack credential scope contract does not satisfy the operation policy",
        policy,
        context.teamId,
        requestId,
      );
    }
  }

  #inputError(operation: SlackOperation, context: SlackWorkspaceContext): SlackAdapterError {
    const policy = getSlackMethodPolicy(operation);
    return adapterError(
      "INVALID_SLACK_INPUT",
      "Slack operation input is invalid",
      policy,
      safeContextTeamId(context),
      "unavailable",
    );
  }
}

function copyScopeContract(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 1_000) throw new TypeError();
  return Object.freeze(
    value.map((scope) => {
      if (
        typeof scope !== "string" ||
        scope.length < 1 ||
        scope.length > 256 ||
        !/^[a-zA-Z0-9._:-]+$/.test(scope)
      ) {
        throw new TypeError();
      }
      return scope;
    }),
  );
}

function safeContextTeamId(context: unknown): TeamId {
  try {
    if (context === null || typeof context !== "object") return UNKNOWN_TEAM_ID;
    return parseTeamId((context as { readonly teamId?: unknown }).teamId);
  } catch {
    return UNKNOWN_TEAM_ID;
  }
}

function mapTeamInfo(value: unknown, expectedTeamId: TeamId): SlackTeamInfo {
  const input = safeObject(value);
  if (input.ok !== true) throw platformResult(input);
  const team = safeObject(input.team);
  const teamId = parseTeamId(team.id);
  const name = safeText(team.name, 200);
  if (teamId !== expectedTeamId) throw new ResponseMappingError("team-mismatch");
  return Object.freeze({ teamId, name });
}

function mapAuthIdentity(
  value: unknown,
  expectedTeamId: TeamId,
  credentialKind: CredentialKind,
): SlackAuthIdentity {
  const input = safeObject(value);
  if (input.ok !== true) throw platformResult(input);
  const teamId = parseTeamId(input.team_id);
  if (teamId !== expectedTeamId) throw new ResponseMappingError("team-mismatch");
  const userId = parseIdentityId(input.user_id);
  const botId = input.bot_id === undefined ? undefined : parseIdentityId(input.bot_id);
  if (credentialKind === "bot" && !botId) throw new ResponseMappingError("invalid");
  if (credentialKind === "user" && botId) throw new ResponseMappingError("invalid");
  const enterpriseId =
    input.enterprise_id === undefined ? undefined : parseIdentityId(input.enterprise_id);
  return Object.freeze({
    teamId,
    userId,
    ...(botId ? { botId } : {}),
    ...(enterpriseId ? { enterpriseId } : {}),
  });
}

function mapConversationPage(value: unknown): SlackConversationPage {
  const input = safeObject(value);
  if (input.ok !== true) throw platformResult(input);
  if (!Array.isArray(input.channels) || input.channels.length > 10_000) {
    throw new ResponseMappingError("invalid");
  }
  const conversations = input.channels.map((value) => {
    const channel = safeObject(value);
    return Object.freeze({
      channelId: parseChannelId(channel.id),
      name: safeText(channel.name, 255),
      isArchived: safeBoolean(channel.is_archived),
      isPrivate: safeBoolean(channel.is_private),
    });
  });
  const metadata = input.response_metadata;
  const nextCursor =
    metadata === undefined ? undefined : optionalCursor(safeObject(metadata).next_cursor);
  return Object.freeze({
    conversations: Object.freeze(conversations),
    ...(nextCursor ? { nextCursor } : {}),
  });
}

function mapSearchMessages(value: unknown): readonly SlackSearchMessage[] {
  const input = safeObject(value);
  if (input.ok !== true) throw platformResult(input);
  const messages = safeObject(input.messages);
  if (!Array.isArray(messages.matches) || messages.matches.length > 10_000) {
    throw new ResponseMappingError("invalid");
  }
  return Object.freeze(
    messages.matches.map((value) => {
      const match = safeObject(value);
      return Object.freeze({
        channelId: parseChannelId(match.channel_id),
        timestamp: parseTimestamp(match.ts),
        text: safeMessageText(match.text),
      });
    }),
  );
}

function mapPostMessage(value: unknown): SlackPostMessageResult {
  const input = safeObject(value);
  if (input.ok !== true) throw platformResult(input);
  return Object.freeze({
    channelId: parseChannelId(input.channel),
    timestamp: parseTimestamp(input.ts),
  });
}

function normalizeFailure(
  cause: unknown,
  policy: SlackMethodPolicy,
  teamId: TeamId,
  requestId: string,
): SlackAdapterError {
  if (cause instanceof SlackAdapterError) return cause;
  if (cause instanceof ResponseMappingError) {
    if (cause.kind === "team-mismatch") {
      return adapterError(
        "WORKSPACE_CONTEXT_MISMATCH",
        "Slack response belongs to a different workspace",
        policy,
        teamId,
        requestId,
      );
    }
    if (cause.kind === "platform") {
      return new SlackAdapterError({
        code: "SLACK_PLATFORM_ERROR",
        message: "Slack rejected the operation",
        requestId,
        method: policy.method,
        teamId,
        credentialKind: policy.credentialKind,
        platformCode: cause.platformCode ?? "unknown_error",
      });
    }
    return adapterError(
      "INVALID_SLACK_RESPONSE",
      "Slack transport returned an invalid response",
      policy,
      teamId,
      requestId,
    );
  }
  try {
    const input = safeObject(cause);
    const code = input.code;
    if (code === "slack_webapi_rate_limited_error") {
      const retryAfter = input.retryAfter;
      if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0) {
        return new SlackAdapterError({
          code: "SLACK_RATE_LIMITED",
          message: "Slack rate limit requires a delayed retry",
          requestId,
          method: policy.method,
          teamId,
          credentialKind: policy.credentialKind,
          retryAfterSeconds: retryAfter,
        });
      }
    }
    if (code === "slack_webapi_platform_error") {
      const data = safeObject(input.data);
      const platformCode = safePlatformCode(data.error);
      return new SlackAdapterError({
        code: "SLACK_PLATFORM_ERROR",
        message: "Slack rejected the operation",
        requestId,
        method: policy.method,
        teamId,
        credentialKind: policy.credentialKind,
        platformCode,
      });
    }
    if (code === "slack_webapi_http_error") {
      return adapterError(
        "SLACK_HTTP_ERROR",
        "Slack returned an unexpected HTTP response",
        policy,
        teamId,
        requestId,
      );
    }
    if (code === "slack_webapi_request_error") {
      return adapterError(
        "SLACK_REQUEST_ERROR",
        "Slack request could not be completed",
        policy,
        teamId,
        requestId,
      );
    }
  } catch {
    // Raw transport values are intentionally discarded.
  }
  return adapterError(
    "INVALID_SLACK_RESPONSE",
    "Slack transport returned an invalid response",
    policy,
    teamId,
    requestId,
  );
}

function platformResult(input: Record<string, unknown>): ResponseMappingError {
  return new ResponseMappingError("platform", safePlatformCode(input.error));
}

function safeObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Slack value");
  }
  return value as Record<string, unknown>;
}

function safeText(value: unknown, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError("Invalid Slack text");
  }
  return value;
}

function parseChannelId(value: unknown): string {
  if (typeof value !== "string" || !/^[CDG][A-Z0-9]{1,63}$/.test(value)) {
    throw new TypeError("Invalid Slack channel ID");
  }
  return value;
}

function parseTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{9,12}\.\d{6}$/.test(value)) {
    throw new TypeError("Invalid Slack timestamp");
  }
  return value;
}

function parseIdentityId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > 128 ||
    !/^[A-Z][A-Z0-9]+$/.test(value)
  ) {
    throw new ResponseMappingError("invalid");
  }
  return value;
}

function safeBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ResponseMappingError("invalid");
  return value;
}

function safeMessageText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 1_000_000 ||
    /[\u0000\u007f]/.test(value)
  ) {
    throw new ResponseMappingError("invalid");
  }
  return value;
}

function parseCursor(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2_048 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError("Invalid Slack cursor");
  }
  return value;
}

function optionalCursor(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  try {
    return parseCursor(value);
  } catch {
    throw new ResponseMappingError("invalid");
  }
}

function safePlatformCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value)
    ? value
    : "unknown_error";
}

class ResponseMappingError extends Error {
  readonly kind: "invalid" | "platform" | "team-mismatch";
  readonly platformCode?: string;

  constructor(
    kind: "invalid" | "platform" | "team-mismatch",
    platformCode?: string,
  ) {
    super("Slack response mapping failed");
    this.name = "ResponseMappingError";
    this.kind = kind;
    if (platformCode !== undefined) this.platformCode = platformCode;
  }
}

function adapterError(
  code: SlackAdapterErrorCode,
  message: string,
  policy: SlackMethodPolicy,
  teamId: TeamId,
  requestId: string,
): SlackAdapterError {
  return new SlackAdapterError({
    code,
    message,
    requestId,
    method: policy.method,
    teamId,
    credentialKind: policy.credentialKind,
  });
}

function diagnostic(
  policy: SlackMethodPolicy,
  teamId: TeamId,
  requestId: string,
  outcome: "started" | "succeeded",
) {
  return {
    requestId,
    method: policy.method,
    teamId,
    credentialKind: policy.credentialKind,
    outcome,
  } as const;
}

function failedDiagnostic(
  policy: SlackMethodPolicy,
  teamId: TeamId,
  requestId: string,
  errorCode: SlackAdapterErrorCode,
) {
  return {
    requestId,
    method: policy.method,
    teamId,
    credentialKind: policy.credentialKind,
    outcome: "failed",
    errorCode,
  } as const;
}
