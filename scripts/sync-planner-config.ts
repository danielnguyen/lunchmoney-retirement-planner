import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, lstat, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { validateCurrentPlannerConfig } from "../src/config/current";

const execute = promisify(execFile);

export type SyncOptions = {
  checkout: string;
  path: string;
  active: string;
  branch: string;
  ref?: string;
};

// No command output or exception text crosses this boundary: Git and validation
// errors can contain private paths, remote credentials, or configuration values.
export async function syncPlannerConfig(options: SyncOptions): Promise<string> {
  let temporary: string | undefined;
  try {
    if (!options.checkout || !options.active || !options.branch ||
        !options.path || options.path.startsWith("/") ||
        options.path.split("/").some((part) => !part || part === "." || part === "..") ||
        options.path.includes("\\") || options.path.includes(":") ||
        ![".yaml", ".yml"].includes(extname(options.path).toLowerCase()) ||
        ![".yaml", ".yml"].includes(extname(options.active).toLowerCase())) {
      throw new Error();
    }
    const git = async (...args: string[]) => (await execute("git", ["-C", options.checkout, ...args], {
      encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })).stdout.trimEnd();
    await git("check-ref-format", `refs/heads/${options.branch}`);
    const upstream = `refs/remotes/origin/${options.branch}`;
    await git("fetch", "--no-tags", "origin", `+refs/heads/${options.branch}:${upstream}`);
    const commit = await git("rev-parse", "--verify", "--end-of-options", `${options.ref ?? upstream}^{commit}`);
    if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error();
    // Read only a regular blob from the resolved tree, never the working tree.
    const entry = await git("ls-tree", commit, "--", options.path);
    if (!/^100(?:644|755) blob /.test(entry)) throw new Error();
    const contents = (await execute("git", ["-C", options.checkout, "show", `${commit}:${options.path}`], {
      encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 60_000,
    })).stdout;
    validateCurrentPlannerConfig(contents);
    const active = resolve(options.active);
    const info = await lstat(active);
    if (!info.isFile()) throw new Error();
    temporary = join(dirname(active), `.${basename(active)}.${randomUUID()}.tmp`);
    await writeFile(temporary, contents, { flag: "wx", mode: info.mode & 0o777 });
    // Preserve readability even when the operator has a stricter umask.
    await chmod(temporary, info.mode & 0o777);
    await rename(temporary, active);
    temporary = undefined;
    return commit;
  } catch {
    throw new Error("Sync failed; active configuration was not replaced.");
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
  }
}

async function main() {
  try {
    const { values } = parseArgs({ options: {
      checkout: { type: "string" }, path: { type: "string" },
      active: { type: "string" }, branch: { type: "string" }, ref: { type: "string" },
    } });
    if (!values.checkout || !values.path || !values.active || !values.branch) throw new Error();
    const commit = await syncPlannerConfig(values as SyncOptions);
    console.log(`Applied planner configuration from Git commit ${commit}.`);
  } catch {
    console.error("Sync failed; active configuration was not replaced. Check checkout, branch/ref, YAML validation and destination permissions privately.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
