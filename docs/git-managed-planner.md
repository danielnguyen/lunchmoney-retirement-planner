# Git-managed saved plans

The owner edits permanent settings in an already-authorized private Git repository,
then deliberately activates one revision on the deployment host. Browser controls
remain temporary what-if inputs. The planner never clones, fetches, pushes, or
receives Git credentials. This procedure does not configure OpenHands Git Sync.

## Prepare once (owner only)

Use a host-side application source checkout at **the exact revision of the running
planner**, with its lockfile-installed development dependencies (`npm ci`) and
Node 22 or later, Git, and GNU coreutils `cp`. `npm run config:sync` uses `tsx` to run the same complete YAML
validator as that version's editor, including return paths and comparison
configuration. Do not run a newer application's validator against an older service.
Record the deployed application revision in the deployment record and update the
host-side tools whenever the service is upgraded. Validation checks configuration
structure and references, not availability of live Lunch Money records.

Keep the private config checkout and its existing Git authentication on the host,
outside both the application source and the directory mounted into the service.
Use an approved `origin` and explicitly choose its upstream branch. No new access
or private repository setup is performed by this feature.

Keep only active YAML in a dedicated mounted directory. Before the **first** sync,
make a private, access-restricted copy of the initial local file **outside** that
directory and verify that it is readable. Do not overwrite that initial copy on
subsequent syncs. This is the recovery copy for settings that never existed in Git.
The helper replaces only the existing active file; it does not create a backup.

For a Git-managed Compose deployment, use `compose.yaml` with
`compose.git-managed.yaml`. Set `PLANNER_ACTIVE_CONFIG_DIR` to the host's dedicated
active-config directory; its file must be named `planner.local.yaml`. For example,
validate wiring before an owner-controlled deployment:

```bash
PLANNER_ACTIVE_CONFIG_DIR=/srv/planner-active docker compose -f compose.yaml -f compose.git-managed.yaml config --quiet
```

The override forces `PLANNER_CONFIG_WRITE_ENABLED=false` and mounts that directory
read-only at `/app/config`. Mount the **directory**, not an individual file: a
file bind mount can continue pointing at the old inode after atomic replacement.
The existing standalone Compose file keeps its write setting and mount behaviour.
Keep the active directory writable only by the owner/sync operator; the container
user (UID 1001 in the supplied image) must retain read access to the replaced file.
Run sync as the same host user that owns the active file, with membership in its
existing group. Before renaming, the helper uses GNU `cp --attributes-only
--preserve=mode,ownership` to copy the original owner, group, permissions and POSIX
access ACL to the prepared file. This keeps file-specific grants to a separate
service identity. Missing GNU cp or inability to preserve those attributes rejects
the sync before replacement; it never silently changes the access policy. Save stays disabled;
Validate, temporary scenario controls, and in-browser YAML drafts still work.

## Edit, activate, refresh

After editing and committing in GitHub, run from the matching application source
checkout on the host (all paths below are illustrative):

```bash
npm run config:sync -- --checkout /srv/private-planner-config --path plans/retirement.yaml --branch main --active /srv/planner-active/planner.local.yaml
```

`--path` is relative to the private repository root. Each invocation must fetch
`origin`'s specified branch successfully, then defaults to that fetched branch's
commit. The candidate is read from the resolved Git tree, never from dirty or
untracked checkout contents. The checkout's working files are not changed. Only a
regular YAML blob is accepted. Successful validation prepares a temporary file
beside the active YAML and renames it atomically over the active file. Git, file,
validation, and write failures leave the previous active file in place. Run one
sync at a time and do not edit the active file concurrently.

Success reports the exact applied Git commit. Failure reports a generic status,
without Git stderr, paths, YAML values, or credentials. Inspect failures privately
on the host; do not paste private validator or Git output into public issues.

Refresh the dashboard after success. A fresh baseline request reloads the active
YAML and Lunch Money data without a rebuild or restart. A full page reload also
clears temporary browser inputs. The YAML editor's Revert action reloads disk
contents; an unsaved draft is not a permanent plan change.

To select a specific ref or roll back to an earlier known-good commit, use the same
command with `--ref` (the upstream fetch must still succeed):

```bash
npm run config:sync -- --checkout /srv/private-planner-config --path plans/retirement.yaml --branch main --active /srv/planner-active/planner.local.yaml --ref KNOWN_GOOD_COMMIT
```

Record the reported commit and refresh again. Earlier commits must still validate
against the current application version. If restoring the initial non-Git file is
necessary, the owner should validate that private backup with the matching version
before replacing the active YAML atomically in the same directory.

## Retrieve the saved-plan JSON

Set a dedicated, high-entropy `PLANNER_EXPORT_TOKEN` in the private deployment
environment to enable `GET /api/v1/exports/projection`. It is disabled when unset
or empty. Provisioning/changing this environment setting requires the normal
owner-controlled service update; subsequent config syncs do not. Never reuse a
Git credential or the Lunch Money token.

An approved client sends `Authorization: Bearer <dedicated export credential>`.
It sends **no query parameters or body**. Store the credential in that client's
secret facility; do not put it in a URL, source file, shell history, or shared log.
The response is a fresh standard JSON attachment for the saved YAML and current
Lunch Money baseline, with no browser overrides or comparison results. The same
projection engine and typed export allowlist used by the browser POST create it.
Financial amounts are still sensitive even though source identifiers and private
labels are removed. Responses, including failures, use `Cache-Control: no-store`.
Disabled access returns 404, bad/missing credentials 401, supplied inputs 400, and
upstream/configuration/projection failures a sanitized 502.

Bind an authenticated client connection to **only** this GET operation. At an
already-approved TLS gateway, allow the exact path `/api/v1/exports/projection`
and method GET; deny every other path/method for that connection, including the
config, baseline, projection POST, and CSV routes. Forward the Authorization
header, disable response caching, and redact it from access logs. Do not expose
the whole application or publish a new port as part of this change. The export
token is checked only by this operation; it is **not** authentication for the
existing dashboard APIs. Existing browser JSON POST and CSV contracts are
unchanged and must remain behind the deployment's existing access boundary.

This repository makes the planner ready for a later private authenticated client.
Actual credential provisioning, private data access, gateway configuration,
service exposure, and deployment require separate owner-approved operations.

## Synthetic access-preservation validation

`npm test` covers ordinary sync failures, including inability to copy access
attributes. The separate `tests/posix-config-sync.ts` test requires root, Linux
`setpriv`, Python 3, and an ACL-capable temporary filesystem. Run
`sudo node --import tsx tests/posix-config-sync.ts` only in a disposable validation
environment, never on a production host. It copies public code/dependencies (no
private config) into a temporary directory, uses distinct numeric sync and service
identities, and verifies group access, file-specific ACL access, and rejection
when the operator cannot preserve the original group. It removes its fixtures.
