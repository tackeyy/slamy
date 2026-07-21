import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { WorkspaceRegistryError } from "./errors.js";
import {
  decodeWorkspaceRegistry,
  emptyWorkspaceRegistry,
  parseWorkspaceRegistryJson,
  serializeWorkspaceRegistry,
} from "./schema.js";
import type { WorkspaceStore } from "./store.js";
import type { WorkspaceRegistryDocument } from "./types.js";

type NodeFileWorkspaceStoreHooks = {
  beforeRename?: () => Promise<void>;
  afterRename?: () => Promise<void>;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
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
    return this.#readUnlocked();
  }

  async write(document: WorkspaceRegistryDocument): Promise<void> {
    const validated = decodeWorkspaceRegistry(document);
    await this.#withLock(async () => {
      await this.#writeUnlocked(validated);
    });
  }

  async update(
    mutate: (document: WorkspaceRegistryDocument) => WorkspaceRegistryDocument,
  ): Promise<WorkspaceRegistryDocument> {
    return this.#withLock(async () => {
      const current = await this.#readUnlocked();
      const next = decodeWorkspaceRegistry(mutate(structuredClone(current)));
      await this.#writeUnlocked(next);
      return next;
    });
  }

  async #readUnlocked(): Promise<WorkspaceRegistryDocument> {
    let handle: FileHandle;
    try {
      const noFollow = (constants as Record<string, number>).O_NOFOLLOW ?? 0;
      handle = await open(this.#filePath, constants.O_RDONLY | noFollow);
    } catch (error) {
      if (isNotFound(error)) return emptyWorkspaceRegistry();
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to open workspace registry safely");
    }

    try {
      const stat = await handle.stat();
      assertSafeNode(stat, "Workspace registry file", true);
      return parseWorkspaceRegistryJson(await handle.readFile("utf8"));
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  async #writeUnlocked(document: WorkspaceRegistryDocument): Promise<void> {
    const serialized = serializeWorkspaceRegistry(document);
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

    try {
      await this.#hooks.afterRename?.();
      if (process.platform !== "win32") {
        const directoryHandle = await open(directory, "r");
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      }
    } catch {
      throw new WorkspaceRegistryError(
        "STORE_DURABILITY_UNCERTAIN",
        "Workspace registry was replaced but directory durability could not be confirmed",
      );
    }
  }

  async #withLock<T>(action: () => Promise<T>): Promise<T> {
    await this.#inspectDirectory(true);
    const lockPath = `${this.#filePath}.lock`;
    const deadline = Date.now() + (this.#hooks.lockTimeoutMs ?? 5_000);
    const retryMs = this.#hooks.lockRetryMs ?? 10;
    let handle: FileHandle | undefined;

    while (handle === undefined) {
      try {
        const candidate = await open(lockPath, "wx", 0o600);
        try {
          await candidate.writeFile(`${process.pid}\n`, "utf8");
          await candidate.sync();
          handle = candidate;
        } catch {
          await candidate.close().catch(() => undefined);
          await unlink(lockPath).catch(() => undefined);
          throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to initialize registry lock");
        }
      } catch (error) {
        if (error instanceof WorkspaceRegistryError) throw error;
        if (!isAlreadyExists(error)) {
          throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to acquire registry lock safely");
        }
        await this.#assertExistingLockSafe(lockPath);
        if (Date.now() >= deadline) {
          throw new WorkspaceRegistryError(
            "STORE_LOCKED",
            "Workspace registry is locked by another process",
          );
        }
        await delay(retryMs);
      }
    }

    let result: T | undefined;
    let actionError: unknown;
    try {
      result = await action();
    } catch (error) {
      actionError = error;
    }

    let cleanupFailed = false;
    try {
      await handle.close();
      await unlink(lockPath);
    } catch {
      cleanupFailed = true;
    }

    if (actionError !== undefined) throw actionError;
    if (cleanupFailed) {
      throw new WorkspaceRegistryError(
        "STORE_DURABILITY_UNCERTAIN",
        "Workspace registry update completed but lock cleanup failed",
      );
    }
    return result as T;
  }

  async #assertExistingLockSafe(lockPath: string): Promise<void> {
    try {
      assertSafeNode(await lstat(lockPath), "Workspace registry lock", true);
    } catch (error) {
      if (isNotFound(error)) return;
      if (error instanceof WorkspaceRegistryError) throw error;
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to inspect registry lock");
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
      assertSafeNode(await lstat(this.#filePath), "Workspace registry file", true);
    } catch (error) {
      if (isNotFound(error)) return;
      if (error instanceof WorkspaceRegistryError) throw error;
      throw new WorkspaceRegistryError("UNSAFE_CONFIG", "Unable to inspect workspace registry");
    }
  }
}

function assertSafeNode(
  stat: Awaited<ReturnType<typeof lstat>> | Awaited<ReturnType<FileHandle["stat"]>>,
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
  return errorCode(error) === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return errorCode(error) === "EEXIST";
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}
