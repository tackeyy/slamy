import { describe, expect, it } from "vitest";
import {
  createTargetResolver,
  parseSlackTarget,
  parseTargetEvidence,
  parseTeamId,
  TargetError,
  type WorkspaceCatalog,
  type WorkspaceView,
} from "../lib/index.js";

const workspace: WorkspaceView = {
  teamId: parseTeamId("T00000001"),
  alias: "primary",
  domain: "primary.slack.com",
  previousDomains: [],
  displayName: "Primary",
  isDefault: true,
};

describe("target public API", () => {
  it("resolves through an injected workspace catalog without credentials or Slack SDK types", async () => {
    const catalog: WorkspaceCatalog = {
      list: () => Promise.resolve([workspace]),
    };
    const resolver = createTargetResolver({ workspaceCatalog: catalog });
    const target = await resolver.resolve({
      input: "https://primary.slack.com/archives/C0123ABC/p1700000000000001",
    });

    expect(target).toMatchObject({
      workspaceTeamId: "T00000001",
      channelId: "C0123ABC",
      messageTs: "1700000000.000001",
    });
    expect(parseTargetEvidence({ input: "C0123ABC" }).isUrl).toBe(false);
    expect(TargetError).toBeTypeOf("function");
  });

  it("preserves the legacy parseSlackTarget malformed-URL fallback until Issue #92", () => {
    const malformed = "https://primary.slack.com/not-a-supported-target";
    expect(parseSlackTarget(malformed)).toEqual({ channel: malformed });
  });
});
