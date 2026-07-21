import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import { WorkspaceRegistry } from "../registry.js";
import type { WorkspaceStore } from "../store.js";
import type { WorkspaceRegistryDocument } from "../types.js";

class MemoryStore implements WorkspaceStore {
  document: WorkspaceRegistryDocument = { version: 1, workspaces: [] };
  writes = 0;

  async read(): Promise<WorkspaceRegistryDocument> {
    return structuredClone(this.document);
  }

  async write(document: WorkspaceRegistryDocument): Promise<void> {
    this.writes += 1;
    this.document = structuredClone(document);
  }
}

const primary = {
  teamId: parseTeamId("T00000001"),
  alias: "primary",
  domain: "primary.slack.com",
  previousDomains: ["old-primary.slack.com"],
  displayName: "Primary",
};

describe("WorkspaceRegistry", () => {
  it("mutates and resolves workspaces by Team ID, alias, domain history, and default", async () => {
    const store = new MemoryStore();
    const registry = new WorkspaceRegistry(store);

    await registry.add(primary, { makeDefault: true });

    for (const selector of [
      "T00000001",
      "primary",
      "primary.slack.com",
      "old-primary.slack.com",
      undefined,
    ]) {
      expect((await registry.resolve(selector)).teamId).toBe("T00000001");
    }
    expect(await registry.list()).toEqual([{ ...primary, isDefault: true }]);

    await registry.clearDefault();
    await expect(registry.resolve()).rejects.toMatchObject({ code: "DEFAULT_NOT_FOUND" });
    await registry.setDefault("primary");
    await registry.remove("old-primary.slack.com");

    expect(await registry.list()).toEqual([]);
    expect(store.document.defaultTeamId).toBeUndefined();
  });

  it("rejects conflicting additions without writing a partial document", async () => {
    const store = new MemoryStore();
    const registry = new WorkspaceRegistry(store);
    await registry.add(primary);
    const writesBeforeConflict = store.writes;

    await expect(
      registry.add({ ...primary, teamId: parseTeamId("T00000002") }),
    ).rejects.toMatchObject({ code: "DUPLICATE_ALIAS" });

    expect(store.writes).toBe(writesBeforeConflict);
    expect(store.document.workspaces).toHaveLength(1);
  });
});
