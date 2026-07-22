import type { CredentialKind } from "../credentials/types.js";

export type SlackOperation =
  | "verify-user"
  | "verify-bot"
  | "get-team-info"
  | "list-public-conversations"
  | "search-messages"
  | "post-message";

export type SlackApiMethod =
  | "auth.test"
  | "team.info"
  | "conversations.list"
  | "search.messages"
  | "chat.postMessage";

export type SlackMethodPolicy = {
  readonly operation: SlackOperation;
  readonly method: SlackApiMethod;
  readonly credentialKind: CredentialKind;
  readonly requiredScopes: readonly string[];
  readonly pagination: "none" | "cursor";
};

const POLICIES: readonly SlackMethodPolicy[] = Object.freeze(
  [
    policy("verify-user", "auth.test", "user", [], "none"),
    policy("verify-bot", "auth.test", "bot", [], "none"),
    policy("get-team-info", "team.info", "user", ["team:read"], "none"),
    policy(
      "list-public-conversations",
      "conversations.list",
      "user",
      ["channels:read"],
      "cursor",
    ),
    policy("search-messages", "search.messages", "user", ["search:read"], "none"),
    policy("post-message", "chat.postMessage", "bot", ["chat:write"], "none"),
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
): SlackMethodPolicy {
  return Object.freeze({
    operation,
    method,
    credentialKind,
    requiredScopes: Object.freeze([...requiredScopes]),
    pagination,
  });
}
