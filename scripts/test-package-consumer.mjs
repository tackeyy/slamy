import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const fixture = mkdtempSync(join(tmpdir(), "slamy-package-consumer-"));

try {
  const nodeModules = join(fixture, "node_modules");
  mkdirSync(nodeModules);
  symlinkSync(root, join(nodeModules, "slamy"), "dir");
  writeFileSync(join(fixture, "package.json"), '{"type":"module"}\n', "utf8");
  writeFileSync(
    join(fixture, "consumer.mts"),
    `import {
  createCredentialResolver,
  createTargetResolver,
  createWorkspaceRecord,
  parseTeamId,
  type AuthVerifier,
  type CredentialHandle,
  type CredentialProvider,
  type CredentialReference,
  type CredentialRequirement,
  type WorkspaceCatalog,
  type WorkspaceView,
  type VerifiedCredentialSet,
} from "slamy";

const provider: CredentialProvider = {
  providerId: "keychain",
  resolveMany(references: readonly CredentialReference[]) {
    return Promise.resolve(new Map(references.map(({ name }) => [name, "xoxp-fixture"])));
  },
};
const verifier: AuthVerifier = {
  verify(secret: CredentialHandle) {
    return secret.use(() => Promise.resolve({ teamId: parseTeamId("T00000001") }));
  },
};
const workspace = createWorkspaceRecord({
  teamId: "T00000001",
  alias: "primary",
  domain: "primary.slack.com",
  displayName: "Primary",
  credentialRefs: { user: { provider: "keychain", name: "primary/user" } },
});
const requirement: CredentialRequirement = { requiredKinds: ["user"] };
const resolver = createCredentialResolver({ providers: [provider], verifier });
const workspaceView: WorkspaceView = { ...workspace, isDefault: true };
const catalog: WorkspaceCatalog = { list: () => Promise.resolve([workspaceView]) };
const targetResolver = createTargetResolver({ workspaceCatalog: catalog });

async function consume(): Promise<VerifiedCredentialSet> {
  const set = await resolver.resolveForWorkspace(workspace, requirement);
  set.destroy();
  return set;
}

void consume;
void targetResolver.resolve({ input: "C0123ABC" });
`,
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules", "typescript", "bin", "tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2023",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "consumer.mts",
    ],
    { cwd: fixture, encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.status ?? 1;
  } else {
    process.stdout.write("Package-root consumer compile: OK\n");
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
