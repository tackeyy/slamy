import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const tempPaths: string[] = [];
const checker = resolve("scripts/check-architecture.mjs");

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("architecture check", () => {
  it("accepts the ADR dependency direction and rejects forbidden imports and cycles", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-architecture-"));
    tempPaths.push(root);
    await mkdir(join(root, "domain"));
    await mkdir(join(root, "workspace"));
    await writeFile(join(root, "domain", "id.ts"), "export const id = 'T1';\n");
    await writeFile(
      join(root, "workspace", "registry.ts"),
      "import { id } from '../domain/id.js';\nexport const registry = id;\n",
    );

    expect(runCheck(root).status).toBe(0);

    await writeFile(
      join(root, "domain", "id.ts"),
      "import { registry } from '../workspace/registry.js';\nexport const id = registry;\n",
    );
    const forbidden = runCheck(root);
    expect(forbidden.status).toBe(1);
    expect(forbidden.stderr).toContain("forbidden import");
    expect(forbidden.stderr).toContain("dependency cycle");
  });
});

function runCheck(root: string) {
  return spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8",
  });
}
