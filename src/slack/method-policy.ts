import type { CredentialKind } from "../credentials/types.js";

export type SlackOperation =
  | "verify-user"
  | "verify-bot"
  | "get-team-info"
  | "list-public-conversations"
  | "create-public-conversation"
  | "search-messages"
  | "post-message";

export type SlackApiMethod =
  | "auth.test"
  | "team.info"
  | "conversations.list"
  | "conversations.create"
  | "search.messages"
  | "chat.postMessage";

export type SlackMethodPolicy = {
  readonly operation: SlackOperation;
  readonly method: SlackApiMethod;
  readonly credentialKind: CredentialKind;
  readonly requiredScopes: readonly string[];
  readonly pagination: "none" | "cursor";
  readonly workspaceArgument: "team" | "team_id" | null;
};

const POLICIES: readonly SlackMethodPolicy[] = Object.freeze(
  [
    policy("verify-user", "auth.test", "user", [], "none", null),
    policy("verify-bot", "auth.test", "bot", [], "none", null),
    policy("get-team-info", "team.info", "user", ["team:read"], "none", "team"),
    policy(
      "list-public-conversations",
      "conversations.list",
      "user",
      ["channels:read"],
      "cursor",
      "team_id",
    ),
    policy(
      "create-public-conversation",
      "conversations.create",
      "user",
      ["channels:write"],
      "none",
      "team_id",
    ),
    policy(
      "search-messages",
      "search.messages",
      "user",
      ["search:read"],
      "none",
      "team_id",
    ),
    policy("post-message", "chat.postMessage", "bot", ["chat:write"], "none", null),
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
  workspaceArgument: SlackMethodPolicy["workspaceArgument"],
): SlackMethodPolicy {
  return Object.freeze({
    operation,
    method,
    credentialKind,
    requiredScopes: Object.freeze([...requiredScopes]),
    pagination,
    workspaceArgument,
  });
}
