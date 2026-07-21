import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import type { WorkspaceView } from "../../domain/workspace.js";
import { TargetResolver, type WorkspaceCatalog } from "../resolver.js";

const primary: WorkspaceView = {
  teamId: parseTeamId("T00000001"),
  alias: "primary",
  domain: "primary.slack.com",
  previousDomains: ["old-primary.slack.com"],
  displayName: "Primary",
  isDefault: true,
};
const secondary: WorkspaceView = {
  teamId: parseTeamId("T00000002"),
  alias: "secondary",
  domain: "secondary.slack.com",
  previousDomains: [],
  displayName: "Secondary",
  isDefault: false,
};

class FakeCatalog implements WorkspaceCatalog {
  reads = 0;

  constructor(readonly workspaces: readonly WorkspaceView[]) {}

  list(): Promise<readonly WorkspaceView[]> {
    this.reads += 1;
    return Promise.resolve(structuredClone(this.workspaces));
  }
}

describe("TargetResolver", () => {
  it("selects explicit, target Team ID, hostname, history domain, and non-URL default", async () => {
    const catalog = new FakeCatalog([primary, secondary]);
    const resolver = new TargetResolver(catalog);
    const cases = [
      {
        request: { input: "C0123ABC", explicitWorkspace: "secondary" },
        teamId: "T00000002",
        selectedBy: "explicit",
      },
      {
        request: { input: "C0123ABC", targetTeamIds: ["T00000002"] },
        teamId: "T00000002",
        selectedBy: "target-team-id",
      },
      {
        request: { input: "https://secondary.slack.com/archives/C0123ABC/p1700000000000001" },
        teamId: "T00000002",
        selectedBy: "registered-hostname",
      },
      {
        request: { input: "https://old-primary.slack.com/archives/C0123ABC/p1700000000000001" },
        teamId: "T00000001",
        selectedBy: "registered-hostname",
      },
      {
        request: { input: "C0123ABC" },
        teamId: "T00000001",
        selectedBy: "default",
      },
    ] as const;

    for (const item of cases) {
      const target = await resolver.resolve(item.request);
      expect(target.workspaceTeamId).toBe(item.teamId);
      expect(target.selectedBy).toBe(item.selectedBy);
      expect(target.channelId).toBe("C0123ABC");
      expect(target.channelOwnership).toBe("unknown");
      expect(Object.isFrozen(target)).toBe(true);
    }
    expect(catalog.reads).toBe(cases.length);
  });

  it("uses Team ID from app.slack.com and preserves target fields", async () => {
    const resolver = new TargetResolver(new FakeCatalog([primary, secondary]));
    const target = await resolver.resolve({
      input:
        "https://app.slack.com/client/T00000002/G0123ABC/thread-G0123ABC-1700000000.000001",
    });

    expect(target).toMatchObject({
      workspaceTeamId: "T00000002",
      workspaceAlias: "secondary",
      selectedBy: "url-team-id",
      source: "app-client-url",
      channelId: "G0123ABC",
      threadTs: "1700000000.000001",
      channelOwnership: "unknown",
    });
  });

  it.each([
    {
      request: {
        input: "https://secondary.slack.com/archives/C0123ABC/p1700000000000001",
        explicitWorkspace: "primary",
      },
      code: "WORKSPACE_CONFLICT",
    },
    {
      request: {
        input: "https://app.slack.com/client/T00000002/C0123ABC",
        explicitWorkspace: "primary",
      },
      code: "WORKSPACE_CONFLICT",
    },
    {
      request: { input: "C0123ABC", explicitWorkspace: "primary", targetTeamIds: ["T00000002"] },
      code: "WORKSPACE_CONFLICT",
    },
    {
      request: { input: "https://unknown.slack.com/archives/C0123ABC/p1700000000000001" },
      code: "WORKSPACE_NOT_REGISTERED",
    },
    {
      request: { input: "https://app.slack.com/client/T99999999/C0123ABC" },
      code: "WORKSPACE_NOT_REGISTERED",
    },
    {
      request: { input: "C0123ABC", targetTeamIds: ["T00000001", "T00000002"] },
      code: "WORKSPACE_AMBIGUOUS",
    },
  ])("fails closed for workspace evidence: $code", async ({ request, code }) => {
    const resolver = new TargetResolver(new FakeCatalog([primary, secondary]));
    await expect(resolver.resolve(request)).rejects.toMatchObject({ code });
  });

  it("does not use explicit selection to bypass an unknown URL hostname", async () => {
    const resolver = new TargetResolver(new FakeCatalog([primary, secondary]));
    await expect(
      resolver.resolve({
        input: "https://unknown.slack.com/archives/C0123ABC/p1700000000000001",
        explicitWorkspace: "primary",
      }),
    ).rejects.toMatchObject({ code: "WORKSPACE_NOT_REGISTERED" });
  });

  it("allows explicit disambiguation for Enterprise and Slack Connect evidence without asserting ownership", async () => {
    const resolver = new TargetResolver(new FakeCatalog([primary, secondary]));
    const enterprise = await resolver.resolve({
      input: "https://app.slack.com/client/E00000001/C0123ABC",
      explicitWorkspace: "secondary",
    });
    expect(enterprise).toMatchObject({
      workspaceTeamId: "T00000002",
      enterpriseId: "E00000001",
      selectedBy: "explicit",
      channelOwnership: "unknown",
    });

    const shared = await resolver.resolve({
      input: "C0123ABC",
      explicitWorkspace: "primary",
      targetTeamIds: ["T00000001", "T00000002"],
    });
    expect(shared).toMatchObject({
      workspaceTeamId: "T00000001",
      selectedBy: "explicit",
      channelOwnership: "unknown",
    });
  });

  it("requires explicit disambiguation for Enterprise-only URLs", async () => {
    const resolver = new TargetResolver(new FakeCatalog([primary]));
    await expect(
      resolver.resolve({ input: "https://app.slack.com/client/E00000001/C0123ABC" }),
    ).rejects.toMatchObject({ code: "ENTERPRISE_CONTEXT_AMBIGUOUS" });
  });

  it("rejects duplicate catalog evidence and a missing default", async () => {
    const duplicateDomain = { ...secondary, domain: primary.domain };
    await expect(
      new TargetResolver(new FakeCatalog([primary, duplicateDomain])).resolve({
        input: "https://primary.slack.com/archives/C0123ABC/p1700000000000001",
      }),
    ).rejects.toMatchObject({ code: "WORKSPACE_AMBIGUOUS" });

    await expect(
      new TargetResolver(
        new FakeCatalog([{ ...primary, isDefault: false }]),
      ).resolve({ input: "C0123ABC" }),
    ).rejects.toMatchObject({ code: "DEFAULT_NOT_FOUND" });
  });
});
