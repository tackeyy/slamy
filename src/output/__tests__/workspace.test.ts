import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import {
  formatDefaultWorkspaceCleared,
  formatWorkspace,
  formatWorkspaceList,
} from "../workspace.js";

const view = {
  teamId: parseTeamId("T00000001"),
  alias: "primary",
  domain: "primary.slack.com",
  previousDomains: ["old-primary.slack.com"],
  displayName: "Primary",
  credentialRefs: {
    user: { provider: "environment" as const, name: "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN" },
  },
  isDefault: true,
};

describe("workspace output", () => {
  it("keeps human, JSON, and TSV output stable without exposing token-like values", () => {
    expect(formatWorkspaceList([], "human")).toBe("No workspaces configured");
    expect(formatWorkspaceList([view], "human")).toContain("primary");
    expect(JSON.parse(formatWorkspaceList([view], "json"))).toEqual([view]);
    expect(formatWorkspaceList([view], "plain").split("\t").slice(0, 5)).toEqual([
      "T00000001",
      "primary",
      "primary.slack.com",
      "Primary",
      "true",
    ]);
    expect(formatWorkspace(view, "human")).toContain("old-primary.slack.com");
    expect(
      formatWorkspace(
        {
          ...view,
          credentialRefs: {
            user: { provider: "environment", name: "xoxp-secret-canary" },
          },
        },
        "human",
      ),
    ).not.toContain("xoxp-secret-canary");

    for (const canary of [
      "xapp-1-A0123456789-secret-canary",
      "https://hooks.slack.com/services/T000/B000/commercial-secret-canary",
      "https://hooks.slack.com/triggers/T000/commercial-trigger-secret-canary",
      "https://hooks.slack.com/actions/T000/commercial-action-secret-canary",
      "https://hooks.slack-gov.com/services/T000/B000/gov-secret-canary",
      "https://hooks.slack-gov.com/triggers/T000/gov-trigger-secret-canary",
      "https://hooks.slack-gov.com/actions/T000/gov-action-secret-canary",
    ]) {
      const unsafeView = {
        ...view,
        credentialRefs: {
          user: { provider: "keychain", name: canary },
        },
      };
      for (const output of [
        formatWorkspace(unsafeView, "human"),
        formatWorkspace(unsafeView, "json"),
        formatWorkspace(unsafeView, "plain"),
        formatWorkspaceList([unsafeView], "human"),
        formatWorkspaceList([unsafeView], "json"),
        formatWorkspaceList([unsafeView], "plain"),
      ]) {
        expect(output).not.toContain(canary);
      }
    }

    expect(JSON.parse(formatDefaultWorkspaceCleared("json"))).toEqual({
      ok: true,
      defaultTeamId: null,
    });
    expect(formatDefaultWorkspaceCleared("plain")).toBe("ok\t");
  });
});
