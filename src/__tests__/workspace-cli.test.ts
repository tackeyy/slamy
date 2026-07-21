import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerWorkspaceCommands } from "../cli/workspace.js";
import { WorkspaceRegistry } from "../workspace/registry.js";
import type { WorkspaceStore } from "../workspace/store.js";
import type { WorkspaceRegistryDocument } from "../workspace/types.js";

class MemoryStore implements WorkspaceStore {
  document: WorkspaceRegistryDocument = { version: 1, workspaces: [] };
  async read(): Promise<WorkspaceRegistryDocument> {
    return structuredClone(this.document);
  }
  async write(document: WorkspaceRegistryDocument): Promise<void> {
    this.document = structuredClone(document);
  }
  async update(
    mutate: (document: WorkspaceRegistryDocument) => WorkspaceRegistryDocument,
  ): Promise<WorkspaceRegistryDocument> {
    const next = mutate(structuredClone(this.document));
    await this.write(next);
    return structuredClone(next);
  }
}

describe("workspace CLI", () => {
  it("adds, lists, shows, changes default, and removes without calling Slack", async () => {
    const program = new Command()
      .exitOverride()
      .option("--json")
      .option("--plain");
    const registry = new WorkspaceRegistry(new MemoryStore());
    const stdout: string[] = [];
    const stderr: string[] = [];
    registerWorkspaceCommands(program, {
      registryFactory: () => registry,
      writeOut: (line) => stdout.push(line),
      writeErr: (line) => stderr.push(line),
    });

    await program.parseAsync([
      "node",
      "slamy",
      "workspace",
      "add",
      "--team-id",
      "T00000001",
      "--alias",
      "primary",
      "--domain",
      "primary.slack.com",
      "--name",
      "Primary",
      "--default",
    ]);
    await program.parseAsync(["node", "slamy", "workspace", "show", "primary"]);
    await program.parseAsync(["node", "slamy", "workspace", "default", "primary"]);
    await program.parseAsync(["node", "slamy", "workspace", "list"]);
    await program.parseAsync(["node", "slamy", "workspace", "remove", "primary"]);

    expect(stdout.join("\n")).toContain("T00000001");
    expect(stdout.join("\n")).not.toContain("xox");
    expect(stderr).toEqual([]);
    expect(await registry.list()).toEqual([]);
  });

  it("uses structured global output modes when clearing the default", async () => {
    const program = new Command().exitOverride().option("--json").option("--plain");
    const registry = new WorkspaceRegistry(new MemoryStore());
    const stdout: string[] = [];
    registerWorkspaceCommands(program, {
      registryFactory: () => registry,
      writeOut: (line) => stdout.push(line),
      writeErr: () => undefined,
    });

    await program.parseAsync(["node", "slamy", "--json", "workspace", "default", "--clear"]);

    expect(JSON.parse(stdout.at(-1) ?? "")).toEqual({ ok: true, defaultTeamId: null });
  });
});
