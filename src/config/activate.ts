import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, rename, unlink, writeFile, open } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { validateCurrentPlannerConfig } from "./current";

const execute = promisify(execFile);

// A filesystem lock also coordinates the recovery CLI and separate server workers.
// A crash leaves a lock for the owner to inspect; never guess that a live writer is stale.
export async function withConfigActivationLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  const lockPath = `${resolve(path)}.sync.lock`;
  const lock = await open(lockPath, "wx", 0o600);
  try {
    return await action();
  } finally {
    // Cleanup cannot turn a completed rename into a reported activation failure.
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}

export async function activatePlannerConfig(path: string, contents: string): Promise<void> {
  let temporary: string | undefined;
  try {
    validateCurrentPlannerConfig(contents);
    const active = resolve(path);
    const info = await lstat(active);
    if (!info.isFile()) throw new Error();
    temporary = join(dirname(active), `.${basename(active)}.${randomUUID()}.tmp`);
    await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
    // GNU cp's mode preservation includes POSIX access ACLs. A mode-only
    // chmod would lose named-user ACLs and a new inode may inherit another group.
    // Attribute-copy failures must happen before replacing the active file.
    await execute("cp", ["--attributes-only", "--preserve=mode,ownership", "--", active, temporary], {
      timeout: 60_000,
    });
    const prepared = await lstat(temporary);
    if (prepared.uid !== info.uid || prepared.gid !== info.gid ||
        (prepared.mode & 0o777) !== (info.mode & 0o777)) throw new Error();
    await rename(temporary, active);
    temporary = undefined;
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
  }
}
