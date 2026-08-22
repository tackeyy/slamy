import type { CredentialKind } from "../credentials/types.js";

export type SlackOperation =
  | "verify-user"
  | "verify-bot"
  | "get-team-info"
  | "list-public-conversations"
  | "list-private-conversations"
  | "get-public-conversation-info"
  | "get-private-conversation-info"
  | "create-public-conversation"
  | "create-private-conversation"
  | "set-public-conversation-purpose"
  | "set-private-conversation-purpose"
  | "set-public-conversation-topic"
  | "set-private-conversation-topic"
  | "invite-to-conversation"
  | "search-messages"
  | "post-message";

export type SlackApiMethod =
  | "auth.test"
  | "team.info"
  | "conversations.list"
  | "conversations.info"
  | "conversations.create"
  | "conversations.setPurpose"
  | "conversations.setTopic"
  | "conversations.invite"
  | "search.messages"
  | "chat.postMessage";

export type SlackMethodPolicy = {
  readonly operation: SlackOperation;
  readonly method: SlackApiMethod;
  readonly credentialKind: CredentialKind;
  readonly requiredScopes: readonly string[];
  readonly pagination: "none" | "cursor";
  readonly retryPolicy: "idempotent" | "never";
  readonly workspaceArgument: "team" | "team_id" | null;
};

const POLICIES: readonly SlackMethodPolicy[] = Object.freeze(
  [
    policy("verify-user", "auth.test", "user", [], "none", "idempotent", null),
    policy("verify-bot", "auth.test", "bot", [], "none", "idempotent", null),
    policy("get-team-info", "team.info", "user", ["team:read"], "none", "idempotent", "team"),
    policy(
      "list-public-conversations",
      "conversations.list",
      "user",
      ["channels:read"],
      "cursor",
      "idempotent",
      "team_id",
    ),
    policy(
      "list-private-conversations",
      "conversations.list",
      "user",
      ["groups:read"],
      "cursor",
      "idempotent",
      "team_id",
    ),
    policy(
      "get-public-conversation-info",
      "conversations.info",
      "user",
      ["channels:read"],
      "none",
      "idempotent",
      null,
    ),
    policy(
      "get-private-conversation-info",
      "conversations.info",
      "user",
      ["groups:read"],
      "none",
      "idempotent",
      null,
    ),
    policy(
      "create-public-conversation",
      "conversations.create",
      "user",
      ["channels:write"],
      "none",
      "never",
      "team_id",
    ),
    policy(
      "create-private-conversation",
      "conversations.create",
      "user",
      ["groups:write"],
      "none",
      "never",
      "team_id",
    ),
    policy(
      "set-public-conversation-purpose",
      "conversations.setPurpose",
      "user",
      ["channels:write.topic"],
      "none",
      "never",
      null,
    ),
    policy(
      "set-private-conversation-purpose",
      "conversations.setPurpose",
      "user",
      ["groups:write.topic"],
      "none",
      "never",
      null,
    ),
    policy(
      "set-public-conversation-topic",
      "conversations.setTopic",
      "user",
      ["channels:write.topic"],
      "none",
      "never",
      null,
    ),
    policy(
      "set-private-conversation-topic",
      "conversations.setTopic",
      "user",
      ["groups:write.topic"],
      "none",
      "never",
      null,
    ),
    policy(
      "invite-to-conversation",
      "conversations.invite",
      "user",
      ["channels:write", "groups:write"],
      "none",
      "never",
      null,
    ),
    policy(
      "search-messages",
      "search.messages",
      "user",
      ["search:read"],
      "none",
      "idempotent",
      "team_id",
    ),
    policy("post-message", "chat.postMessage", "bot", ["chat:write"], "none", "never", null),
  ],
);

const POLICY_BY_OPERATION = new Map(POLICIES.map((policy) => [policy.operation, policy]));

export function getSlackMethodPolicy(operation: SlackOperation): SlackMethodPolicy {
  return POLICY_BY_OPERATION.get(operation)!;
}

export function listSlackMethodPolicies(): readonly SlackMethodPolicy[] {
  return POLICIES;
}

function policy(
  operation: SlackOperation,
  method: SlackApiMethod,
  credentialKind: CredentialKind,
  requiredScopes: readonly string[],
  pagination: SlackMethodPolicy["pagination"],
  retryPolicy: SlackMethodPolicy["retryPolicy"],
  workspaceArgument: SlackMethodPolicy["workspaceArgument"],
): SlackMethodPolicy {
  return Object.freeze({
    operation,
    method,
    credentialKind,
    requiredScopes: Object.freeze([...requiredScopes]),
    pagination,
    retryPolicy,
    workspaceArgument,
  });
}
