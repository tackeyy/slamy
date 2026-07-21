import { describe, expect, it } from "vitest";
import { decodeWorkspaceRegistry } from "../schema.js";

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
});
