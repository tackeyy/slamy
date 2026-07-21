import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { WorkspaceRegistryError } from "./errors.js";
import {
  emptyWorkspaceRegistry,
  parseWorkspaceRegistryJson,
  serializeWorkspaceRegistry,
} from "./schema.js";
import type { WorkspaceStore } from "./store.js";
import type { WorkspaceRegistryDocument } from "./types.js";

type NodeFileWorkspaceStoreHooks = {
  beforeRename?: () => Promise<void>;
};

export class NodeFileWorkspaceStore implements WorkspaceStore {
  readonly #filePath: string;
  readonly #hooks: NodeFileWorkspaceStoreHooks;

  constructor(filePath: string, hooks: NodeFileWorkspaceStoreHooks = {}) {
    this.#filePath = filePath;
    this.#hooks = hooks;
  }

  async read(): Promise<WorkspaceRegistryDocument> {
    const directoryExists = await this.#inspectDirectory(false);
    if (!directoryExists) return emptyWorkspaceRegistry();

    let stat;
    try {
      stat = await lstat(this.#filePath);
    } catch (error) {
      if (isNotFound(error)) return emptyWorkspaceRegistry();
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to inspect workspace registry");
    }
    assertSafeNode(stat, "Workspace registry file", true);

    let text: string;
    try {
      text = await readFile(this.#filePath, "utf8");
    } catch {
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to read workspace registry");
    }
    return parseWorkspaceRegistryJson(text);
  }

  async write(document: WorkspaceRegistryDocument): Promise<void> {
    const serialized = serializeWorkspaceRegistry(document);
    await this.#inspectDirectory(true);
    await this.#inspectExistingFile();

    const directory = dirname(this.#filePath);
    const tempPath = join(
      directory,
      `.${basename(this.#filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle: FileHandle | undefined;
    let renamed = false;

    try {
      handle = await open(tempPath, "wx", 0o600);
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.#hooks.beforeRename?.();
      await rename(tempPath, this.#filePath);
      renamed = true;

      const directoryHandle = await open(directory, "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      if (error instanceof WorkspaceRegistryError) throw error;
      throw new WorkspaceRegistryError(
        "STORE_WRITE_FAILED",
        "Unable to atomically write workspace registry",
      );
    } finally {
      if (handle !== undefined) await handle.close().catch(() => undefined);
      if (!renamed) await unlink(tempPath).catch(() => undefined);
    }
  }

  async #inspectDirectory(create: boolean): Promise<boolean> {
    const directory = dirname(this.#filePath);
    let stat;
    try {
      stat = await lstat(directory);
    } catch (error) {
      if (!isNotFound(error)) {
        throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to inspect config directory");
      }
      if (!create) return false;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        stat = await lstat(directory);
      } catch {
        throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to create config directory");
      }
    }
    assertSafeNode(stat, "Workspace config directory", false);
    return true;
  }

  async #inspectExistingFile(): Promise<void> {
    try {
      const stat = await lstat(this.#filePath);
      assertSafeNode(stat, "Workspace registry file", true);
    } catch (error) {
      if (isNotFound(error)) return;
      if (error instanceof WorkspaceRegistryError) throw error;
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to inspect workspace registry");
    }
  }
}

function assertSafeNode(
  stat: Awaited<ReturnType<typeof lstat>>,
  label: string,
  requireFile: boolean,
): void {
  if (stat.isSymbolicLink() || (requireFile ? !stat.isFile() : !stat.isDirectory())) {
    throw new WorkspaceRegistryError("UNSAFE_CONFIG", `${label} must not be a symlink`);
  }
  if (process.platform !== "win32") {
    if ((Number(stat.mode) & 0o077) !== 0) {
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", `${label} permissions are too broad`);
    }
    if (typeof process.getuid === "function" && Number(stat.uid) !== process.getuid()) {
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", `${label} must be owned by the current user`);
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
