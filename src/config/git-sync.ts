import { extname } from "node:path";
import { plannerConfigPath } from "./loader";
import { activatePlannerConfig, withConfigActivationLock } from "./activate";

export const syncSetupMessage = "Browser sync is unavailable. The owner must configure the Git source, read credential, browser origin and writable active directory behind private access.";
export const syncFailureMessage = "Sync failed; the active configuration was not replaced. Check Git read access, branch/file, YAML validity and active-directory permissions privately. If another sync is running, wait and retry.";

export function gitSyncSettings() {
  if (process.env.PLANNER_GIT_SYNC_ENABLED !== "true") return null;
  const repository = process.env.PLANNER_GIT_REPOSITORY ?? "";
  const branch = process.env.PLANNER_GIT_BRANCH ?? "";
  const path = process.env.PLANNER_GIT_PATH ?? "";
  const token = process.env.PLANNER_GIT_READ_TOKEN ?? "";
  const origin = process.env.PLANNER_BROWSER_ORIGIN ?? "";
  try {
    const url = new URL(origin);
    if (url.origin !== origin || !["https:", "http:"].includes(url.protocol)) return null;
  } catch { return null; }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      repository.split("/").some((part) => part === "." || part === "..") ||
      !branch || branch.length > 255 || /[\x00-\x20\x7f]/.test(branch) ||
      !path || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") ||
      ![".yaml", ".yml"].includes(extname(path).toLowerCase()) || !token ||
      ![".yaml", ".yml"].includes(extname(plannerConfigPath()).toLowerCase())) return null;
  return { repository, branch, path, token, origin };
}

// Only the fixed GitHub API receives this server credential. Redirects are refused.
// Bounded reads include the response body, and never surface upstream error text.
async function githubJson(url: string, token: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.github.com${url}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    redirect: "error", cache: "no-store", signal,
  });
  if (!response.ok || !response.body) throw new Error();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 6 * 1024 * 1024) throw new Error();
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function syncConfiguredGit(settings: NonNullable<ReturnType<typeof gitSyncSettings>>): Promise<string> {
  return withConfigActivationLock(plannerConfigPath(), async () => {
    const signal = AbortSignal.timeout(20_000);
    const base = `/repos/${settings.repository}`;
    const revision = await githubJson(`${base}/commits/${encodeURIComponent(settings.branch)}`, settings.token, signal);
    if (typeof revision.sha !== "string" || !/^[a-f0-9]{40}$/.test(revision.sha)) throw new Error();
    const file = await githubJson(`${base}/contents/${settings.path.split("/").map(encodeURIComponent).join("/")}?ref=${revision.sha}`, settings.token, signal);
    if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string" ||
        file.submodule_git_url || file.target || typeof file.size !== "number" || file.size > 4 * 1024 * 1024) throw new Error();
    // Contents API may dereference symlinks; check the immutable Git tree entry too.
    const tree = await githubJson(`${base}/git/trees/${revision.sha}?recursive=1`, settings.token, signal);
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error();
    const entry = tree.tree.find((item) => item.path === settings.path);
    if (!entry || entry.type !== "blob" || !["100644", "100755"].includes(entry.mode) || entry.sha !== file.sha) throw new Error();
    const contents = Buffer.from(file.content, "base64").toString("utf8");
    await activatePlannerConfig(plannerConfigPath(), contents);
    return revision.sha;
  });
}
