import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkspaceRegistry,
  parseTeamId,
  WorkspaceRegistry,
  WorkspaceRegistryError,
  type WorkspaceRecord,
} from "../lib/index.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workspace package root API", () => {
  it("creates a registry through additive SDK-independent exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-public-workspace-"));
    tempPaths.push(root);
    const registry = createWorkspaceRegistry({ configPath: join(root, "slamy", "workspaces.json") });
    const record: WorkspaceRecord = {
      teamId: parseTeamId("T00000001"),
      alias: "primary",
      domain: "primary.slack.com",
      previousDomains: [],
      displayName: "Primary",
    };

    expect(registry).toBeInstanceOf(WorkspaceRegistry);
    expect(new WorkspaceRegistryError("INVALID_CONFIG", "safe")).toBeInstanceOf(Error);
    await registry.add(record, { makeDefault: true });
    expect((await registry.resolve()).teamId).toBe("T00000001");
  });
});
