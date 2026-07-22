import { describe, expect, it } from "vitest";
import {
  createSlackWorkspaceContext,
  createWorkspaceSlackAdapter,
  getSlackMethodPolicy,
  listSlackMethodPolicies,
  SlackAdapterError,
} from "../lib/index.js";
import { contextWith } from "../slack/__tests__/helpers.js";

describe("workspace Slack adapter public API", () => {
  it("exports named operations and slamy-owned policy/error types without a generic API call", () => {
    const adapter = createWorkspaceSlackAdapter({ requestIdFactory: () => "public-req" });
    expect(adapter.getTeamInfo).toBeTypeOf("function");
    expect(adapter.listPublicConversations).toBeTypeOf("function");
    expect(adapter.searchMessages).toBeTypeOf("function");
    expect(adapter.postMessage).toBeTypeOf("function");
    expect("apiCall" in adapter).toBe(false);
    expect(getSlackMethodPolicy("post-message")).toMatchObject({
      method: "chat.postMessage",
      credentialKind: "bot",
    });
    expect(listSlackMethodPolicies()).toHaveLength(6);
    expect(SlackAdapterError).toBeTypeOf("function");
  });

  it("exports the explicit context factory", () => {
    const existing = contextWith({ userToken: "xoxp-user" });
    const context = createSlackWorkspaceContext({
      teamId: existing.teamId,
      credentials: existing.credentials,
    });
    expect(context.teamId).toBe(existing.teamId);
  });
});
