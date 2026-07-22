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
        workspaceArgument: null,
      },
      {
        operation: "verify-bot",
        method: "auth.test",
        credentialKind: "bot",
        requiredScopes: [],
        pagination: "none",
        workspaceArgument: null,
      },
      {
        operation: "get-team-info",
        method: "team.info",
        credentialKind: "user",
        requiredScopes: ["team:read"],
        pagination: "none",
        workspaceArgument: "team",
      },
      {
        operation: "list-public-conversations",
        method: "conversations.list",
        credentialKind: "user",
        requiredScopes: ["channels:read"],
        pagination: "cursor",
        workspaceArgument: "team_id",
      },
      {
        operation: "search-messages",
        method: "search.messages",
        credentialKind: "user",
        requiredScopes: ["search:read"],
        pagination: "none",
        workspaceArgument: "team_id",
      },
      {
        operation: "post-message",
        method: "chat.postMessage",
        credentialKind: "bot",
        requiredScopes: ["chat:write"],
        pagination: "none",
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
