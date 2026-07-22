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
import type { SlackTransport } from "./transport.js";
import {
  createSlackWorkspaceContext,
  type SlackWorkspaceContext,
} from "./workspace-context.js";

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

export type SlackPostMessageInput = {
  channelId: string;
  text: string;
  threadTs?: string;
};

export type SlackPostMessageResult = {
  readonly channelId: string;
  readonly timestamp: string;
};

export class WorkspaceSlackAdapter {
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

  postMessage(
    context: SlackWorkspaceContext,
    input: SlackPostMessageInput,
  ): Promise<SlackPostMessageResult> {
    const channelId = parseChannelId(input.channelId);
    if (typeof input.text !== "string" || input.text.length === 0) {
      return Promise.reject(this.#inputError("post-message", context));
    }
    const threadTs = input.threadTs === undefined ? undefined : parseTimestamp(input.threadTs);
    return this.#execute(
      "post-message",
      context,
      Object.freeze({
        channel: channelId,
        text: input.text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      }),
      mapPostMessage,
    );
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
  ): SlackWorkspaceContext {
    try {
      return createSlackWorkspaceContext({ teamId: context.teamId, credentials: context.credentials });
    } catch {
      throw adapterError(
        "WORKSPACE_CONTEXT_MISMATCH",
        "Slack workspace context does not match its verified credentials",
        policy,
        context.teamId,
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
    context: SlackWorkspaceContext,
    policy: SlackMethodPolicy,
    requestId: string,
  ): VerifiedCredential {
    const credential = context.credentials[policy.credentialKind];
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
    context: SlackWorkspaceContext,
    policy: SlackMethodPolicy,
    requestId: string,
  ): void {
    const declared = context.credentials.requiredScopes[policy.credentialKind] ?? [];
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
      "INVALID_SLACK_RESPONSE",
      "Slack operation input is invalid",
      policy,
      context.teamId,
      "unavailable",
    );
  }
}

function mapTeamInfo(value: unknown, expectedTeamId: TeamId): SlackTeamInfo {
  const input = safeObject(value);
  if (input.ok !== true) throw platformResult(input);
  const team = safeObject(input.team);
  const teamId = parseTeamId(team.id);
  const name = safeText(team.name, 200);
  if (teamId !== expectedTeamId) throw new TypeError("Team mismatch");
  return Object.freeze({ teamId, name });
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

function platformResult(input: Record<string, unknown>): Record<string, unknown> {
  return {
    code: "slack_webapi_platform_error",
    data: { error: input.error },
  };
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

function safePlatformCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value)
    ? value
    : "unknown_error";
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
