// Explicit Linux privilege test, separate from the unprivileged npm test suite.
// Run only in a disposable validation environment: sudo node --import tsx tests/posix-config-sync.ts
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, chown, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const syncUid = 23101;
const syncGid = 23101;
const serviceUid = 23102;
const serviceGid = 23102;

async function main() {
  assert.equal(process.getuid?.(), 0, "This synthetic cross-identity test requires root in a disposable Linux test environment.");
  const directory = await mkdtemp(join(tmpdir(), "planner-posix-sync-"));
  const source = join(directory, "source");
  const checkout = join(directory, "checkout");
  const activeDirectory = join(directory, "active");
  const active = join(activeDirectory, "plan.yaml");
  const toolDirectory = join(directory, "tool");
  const asIdentity = (uid: number, gid: number, groups: number[], command: string, args: string[]) =>
    execute("setpriv", [
      `--reuid=${uid}`, `--regid=${gid}`,
      groups.length ? `--groups=${groups.join(",")}` : "--clear-groups", command, ...args,
    ], { cwd: toolDirectory, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
  const git = (...args: string[]) => asIdentity(syncUid, syncGid, [], "git", args);
  const sync = (groups: number[]) => asIdentity(syncUid, syncGid, groups, process.execPath, [
    "--import", "tsx", join(toolDirectory, "scripts/sync-planner-config.ts"),
    "--checkout", checkout, "--path", "plan.yaml", "--branch", "main", "--active", active,
  ]);
  const serviceRead = async () => (await asIdentity(serviceUid, serviceGid, [], "cat", [active])).stdout;
  try {
    await chmod(directory, 0o755);
    // Isolate only public code/dependencies from private workspace parent modes.
    await mkdir(toolDirectory);
    for (const path of ["src", "scripts", "node_modules", "tsconfig.json", "package.json"]) {
      await cp(path, join(toolDirectory, path), { recursive: true });
    }
    for (const path of [source, checkout, activeDirectory]) {
      await mkdir(path);
      await chown(path, syncUid, syncGid);
      await chmod(path, 0o755);
    }
    const original = await readFile("config/planner.example.yaml", "utf8");
    const candidate = original.replace("retirementGoal: 0", "retirementGoal: 2468");
    await writeFile(join(source, "plan.yaml"), candidate);
    await chown(join(source, "plan.yaml"), syncUid, syncGid);
    await git("-C", source, "init", "-b", "main");
    await git("-C", source, "add", "plan.yaml");
    await git("-C", source, "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic YAML");
    await git("clone", source, checkout);
    await writeFile(active, original);
    await chown(active, syncUid, serviceGid);
    await chmod(active, 0o640);
    assert.equal(await serviceRead(), original);
    await sync([serviceGid]);
    assert.equal(await serviceRead(), candidate);
    assert.equal((await stat(active)).gid, serviceGid);
    console.log("PASS: separate service identity retains group-based read access after sync.");

    await writeFile(active, original);
    const before = await stat(active);
    await assert.rejects(sync([]));
    assert.equal(await serviceRead(), original);
    assert.equal((await stat(active)).ino, before.ino);
    assert.deepEqual(await readdir(activeDirectory), ["plan.yaml"]);
    console.log("PASS: inability to preserve the original group rejects sync before rename.");

    await chown(active, syncUid, syncGid);
    await chmod(active, 0o600);
    // Linux POSIX ACL xattr: owner rw, named service user r, group none,
    // mask r, other none. No default ACL is set on the directory.
    await execute("python3", ["-c", [
      "import os,struct,sys",
      "entries=[(1,6,0xffffffff),(2,4,int(sys.argv[2])),(4,0,0xffffffff),(16,4,0xffffffff),(32,0,0xffffffff)]",
      "value=struct.pack('<I',2)+b''.join(struct.pack('<HHI',*entry) for entry in entries)",
      "os.setxattr(sys.argv[1],'system.posix_acl_access',value)",
    ].join(";"), active, String(serviceUid)]);
    assert.equal(await serviceRead(), original);
    const acl = async () => (await execute("python3", ["-c",
      "import os,sys; print(os.getxattr(sys.argv[1],'system.posix_acl_access').hex())", active])).stdout;
    const previousAcl = await acl();
    await sync([]);
    assert.equal(await serviceRead(), candidate);
    assert.equal(await acl(), previousAcl);
    assert.equal((await stat(active)).gid, syncGid);
    console.log("PASS: separate service identity retains its file-specific ACL after sync.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
