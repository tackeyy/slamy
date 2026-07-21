import { describe, expect, it } from "vitest";
import { WorkspaceRegistryError } from "../errors.js";
import { decodeWorkspaceRegistry, parseWorkspaceRegistryJson } from "../schema.js";

describe("decodeWorkspaceRegistry", () => {
  it("accepts a version 1 document with Team ID as the canonical identity", () => {
    const document = decodeWorkspaceRegistry({
      version: 1,
      defaultTeamId: "T00000001",
      workspaces: [
        {
          teamId: "T00000001",
          alias: "primary",
          domain: "primary.slack.com",
          previousDomains: ["old-primary.slack.com"],
          displayName: "Primary",
          credentialRefs: {
            user: { provider: "environment", name: "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN" },
          },
        },
      ],
    });

    expect(document.defaultTeamId).toBe("T00000001");
    expect(document.workspaces[0]?.teamId).toBe("T00000001");
  });

  it("fails closed for corrupt, unknown, duplicate, ambiguous, or secret-like input", () => {
    const workspace = {
      teamId: "T00000001",
      alias: "primary",
      domain: "primary.slack.com",
      previousDomains: ["old-primary.slack.com"],
      displayName: "Primary",
    };
    const unsafeDocuments: unknown[] = [
      { version: 2, workspaces: [] },
      { version: 1, workspaces: [], unknown: true },
      { version: 1, workspaces: [{ ...workspace, unknown: true }] },
      { version: 1, workspaces: [workspace, { ...workspace, alias: "secondary" }] },
      {
        version: 1,
        workspaces: [workspace, { ...workspace, teamId: "T00000002" }],
      },
      {
        version: 1,
        workspaces: [
          workspace,
          {
            ...workspace,
            teamId: "T00000002",
            alias: "secondary",
            domain: "secondary.slack.com",
            previousDomains: ["primary.slack.com"],
          },
        ],
      },
      { version: 1, defaultTeamId: "T99999999", workspaces: [workspace] },
      { version: 1, workspaces: [{ ...workspace, alias: "Primary" }] },
      {
        version: 1,
        workspaces: [
          {
            ...workspace,
            credentialRefs: {
              user: { provider: "environment", name: "xoxp-secret-canary" },
            },
          },
        ],
      },
    ];

    for (const unsafe of unsafeDocuments) {
      expect(() => decodeWorkspaceRegistry(unsafe)).toThrow(WorkspaceRegistryError);
    }
    expect(() => parseWorkspaceRegistryJson("{broken")).toThrow(WorkspaceRegistryError);

    try {
      decodeWorkspaceRegistry(unsafeDocuments.at(-1));
    } catch (error) {
      expect(String(error)).not.toContain("xoxp-secret-canary");
    }
  });
});
