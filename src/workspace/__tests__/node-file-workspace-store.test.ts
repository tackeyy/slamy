import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseTeamId } from "../../domain/team-id.js";
import { NodeFileWorkspaceStore } from "../node-file-workspace-store.js";
import { WorkspaceRegistry } from "../registry.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("NodeFileWorkspaceStore", () => {
  it("writes atomically with private permissions and rejects unsafe files", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-workspace-store-"));
    tempPaths.push(root);
    const configPath = join(root, "slamy", "workspaces.json");
    const store = new NodeFileWorkspaceStore(configPath);

    expect(await store.read()).toEqual({ version: 1, workspaces: [] });
    await store.write({
      version: 1,
      defaultTeamId: parseTeamId("T00000001"),
      workspaces: [
        {
          teamId: parseTeamId("T00000001"),
          alias: "primary",
          domain: "primary.slack.com",
          previousDomains: [],
          displayName: "Primary",
        },
      ],
    });

    expect((await lstat(dirname(configPath))).mode & 0o777).toBe(0o700);
    expect((await lstat(configPath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(configPath, "utf8")).defaultTeamId).toBe("T00000001");

    await chmod(configPath, 0o644);
    await expect(store.read()).rejects.toMatchObject({ code: "UNSAFE_CONFIG" });

    const target = join(root, "target.json");
    const linked = join(root, "linked.json");
    await writeFile(target, '{"sentinel":true}\n', { mode: 0o600 });
    await symlink(target, linked);
    await expect(new NodeFileWorkspaceStore(linked).read()).rejects.toMatchObject({
      code: "UNSAFE_CONFIG",
    });
    expect(await readFile(target, "utf8")).toBe('{"sentinel":true}\n');

    await chmod(configPath, 0o600);
    const beforeFailure = await readFile(configPath, "utf8");
    const failingStore = new NodeFileWorkspaceStore(configPath, {
      beforeRename: async () => {
        throw new Error("injected rename barrier");
      },
    });
    await expect(
      failingStore.write({ version: 1, workspaces: [] }),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });
    expect(await readFile(configPath, "utf8")).toBe(beforeFailure);
    expect((await readdir(dirname(configPath))).some((name) => name.endsWith(".tmp"))).toBe(false);

    const uncertainStore = new NodeFileWorkspaceStore(configPath, {
      afterRename: async () => {
        throw new Error("injected directory durability failure");
      },
    });
    await expect(uncertainStore.write({ version: 1, workspaces: [] })).rejects.toMatchObject({
      code: "STORE_DURABILITY_UNCERTAIN",
    });
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      version: 1,
      workspaces: [],
    });
  });

  it("serializes independent file-store mutations and fails closed for a stale lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-workspace-lock-"));
    tempPaths.push(root);
    const configPath = join(root, "slamy", "workspaces.json");
    const first = new WorkspaceRegistry(new NodeFileWorkspaceStore(configPath));
    const second = new WorkspaceRegistry(new NodeFileWorkspaceStore(configPath));

    await Promise.all([
      first.add({
        teamId: parseTeamId("T00000001"),
        alias: "primary",
        domain: "primary.slack.com",
        previousDomains: [],
        displayName: "Primary",
      }),
      second.add({
        teamId: parseTeamId("T00000002"),
        alias: "secondary",
        domain: "secondary.slack.com",
        previousDomains: [],
        displayName: "Secondary",
      }),
    ]);

    expect((await first.list()).map((workspace) => workspace.alias).sort()).toEqual([
      "primary",
      "secondary",
    ]);
    expect((await readdir(dirname(configPath))).some((name) => name.endsWith(".lock"))).toBe(false);

    const lockPath = `${configPath}.lock`;
    await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600 });
    await expect(
      new NodeFileWorkspaceStore(configPath, { lockTimeoutMs: 0 }).write({
        version: 1,
        workspaces: [],
      }),
    ).rejects.toMatchObject({ code: "STORE_LOCKED" });
  });
});
