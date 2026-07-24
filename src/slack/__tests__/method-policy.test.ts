import { describe, expect, it } from "vitest";
import { getSlackMethodPolicy, listSlackMethodPolicies } from "../method-policy.js";

describe("Slack method policy", () => {
  it("pins each named operation to one credential kind, scope contract, and pagination mode", () => {
    expect(listSlackMethodPolicies()).toEqual([
      {
        operation: "verify-user",
        method: "auth.test",
        credentialKind: "user",
        requiredScopes: [],
        pagination: "none",
        retryPolicy: "idempotent",
        workspaceArgument: null,
      },
      {
        operation: "verify-bot",
        method: "auth.test",
        credentialKind: "bot",
        requiredScopes: [],
        pagination: "none",
        retryPolicy: "idempotent",
        workspaceArgument: null,
      },
      {
        operation: "get-team-info",
        method: "team.info",
        credentialKind: "user",
        requiredScopes: ["team:read"],
        pagination: "none",
        retryPolicy: "idempotent",
        workspaceArgument: "team",
      },
      {
        operation: "list-public-conversations",
        method: "conversations.list",
        credentialKind: "user",
        requiredScopes: ["channels:read"],
        pagination: "cursor",
        retryPolicy: "idempotent",
        workspaceArgument: "team_id",
      },
      {
        operation: "list-private-conversations",
        method: "conversations.list",
        credentialKind: "user",
        requiredScopes: ["groups:read"],
        pagination: "cursor",
        retryPolicy: "idempotent",
        workspaceArgument: "team_id",
      },
      {
        operation: "get-public-conversation-info",
        method: "conversations.info",
        credentialKind: "user",
        requiredScopes: ["channels:read"],
        pagination: "none",
        retryPolicy: "idempotent",
        workspaceArgument: null,
      },
      {
        operation: "get-private-conversation-info",
        method: "conversations.info",
        credentialKind: "user",
        requiredScopes: ["groups:read"],
        pagination: "none",
        retryPolicy: "idempotent",
        workspaceArgument: null,
      },
      {
        operation: "create-public-conversation",
        method: "conversations.create",
        credentialKind: "user",
        requiredScopes: ["channels:write"],
        pagination: "none",
        retryPolicy: "never",
        workspaceArgument: "team_id",
      },
      {
        operation: "create-private-conversation",
        method: "conversations.create",
        credentialKind: "user",
        requiredScopes: ["groups:write"],
        pagination: "none",
        retryPolicy: "never",
        workspaceArgument: "team_id",
      },
      {
        operation: "set-public-conversation-purpose",
        method: "conversations.setPurpose",
        credentialKind: "user",
        requiredScopes: ["channels:write.topic"],
        pagination: "none",
        retryPolicy: "never",
        workspaceArgument: null,
      },
      {
        operation: "set-private-conversation-purpose",
        method: "conversations.setPurpose",
        credentialKind: "user",
        requiredScopes: ["groups:write.topic"],
        pagination: "none",
        retryPolicy: "never",
        workspaceArgument: null,
      },
      {
        operation: "set-public-conversation-topic",
        method: "conversations.setTopic",
        credentialKind: "user",
        requiredScopes: ["channels:write.topic"],
        pagination: "none",
        retryPolicy: "never",
        workspaceArgument: null,
      },
      {
        operation: "set-private-conversation-topic",
        method: "conversations.setTopic",
        credentialKind: "user",
        requiredScopes: ["groups:write.topic"],
        pagination: "none",
        retryPolicy: "never",
        workspaceArgument: null,
      },
      {
        operation: "search-messages",
        method: "search.messages",
        credentialKind: "user",
        requiredScopes: ["search:read"],
        pagination: "none",
        retryPolicy: "idempotent",
        workspaceArgument: "team_id",
      },
      {
        operation: "post-message",
        method: "chat.postMessage",
        credentialKind: "bot",
        requiredScopes: ["chat:write"],
        pagination: "none",
        retryPolicy: "never",
        workspaceArgument: null,
      },
    ]);
  });

  it("returns frozen copies instead of a mutable registry or a generic method entrypoint", () => {
    const policy = getSlackMethodPolicy("post-message");
    expect(policy.method).toBe("chat.postMessage");
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.requiredScopes)).toBe(true);
    expect(Object.isFrozen(listSlackMethodPolicies())).toBe(true);
  });
});
