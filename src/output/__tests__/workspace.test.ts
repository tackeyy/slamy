import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import { formatWorkspace, formatWorkspaceList } from "../workspace.js";

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
  });
});
