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

  it("rejects ADR-forbidden external imports", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-architecture-negative-"));
    tempPaths.push(root);
    await mkdir(join(root, "domain"));
    await writeFile(
      join(root, "domain", "id.ts"),
      "import { WebClient } from '@slack/web-api';\nexport const id = WebClient;\n",
    );

    const result = runCheck(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "forbidden external import: domain/id.ts (domain) -> @slack/web-api",
    );
  });

  it("rejects the slack-to-targets dependency edge", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-architecture-negative-"));
    tempPaths.push(root);
    await mkdir(join(root, "slack"));
    await mkdir(join(root, "targets"));
    await writeFile(
      join(root, "slack", "adapter.ts"),
      "import { target } from '../targets/target.js';\nexport const adapter = target;\n",
    );
    await writeFile(join(root, "targets", "target.ts"), "export const target = 'C1';\n");

    const result = runCheck(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "forbidden import: slack/adapter.ts (slack) -> targets/target.ts (targets)",
    );
  });

  it("rejects unknown source modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-architecture-negative-"));
    tempPaths.push(root);
    await mkdir(join(root, "platform"));
    await writeFile(join(root, "platform", "fs.ts"), "export const unsafe = true;\n");

    const result = runCheck(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown source module: platform/fs.ts (platform)");
  });

  it("allows slack to implement credential ports but rejects the reverse dependency", async () => {
    const root = await mkdtemp(join(tmpdir(), "slamy-architecture-credentials-"));
    tempPaths.push(root);
    await mkdir(join(root, "credentials"));
    await mkdir(join(root, "slack"));
    await writeFile(join(root, "slack", "auth.ts"), "export const verify = true;\n");
    await writeFile(
      join(root, "credentials", "resolver.ts"),
      "import { verify } from '../slack/auth.js';\nexport const resolver = verify;\n",
    );

    const result = runCheck(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "forbidden import: credentials/resolver.ts (credentials) -> slack/auth.ts (slack)",
    );
  });
});

function runCheck(root: string) {
  return spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8",
  });
}
