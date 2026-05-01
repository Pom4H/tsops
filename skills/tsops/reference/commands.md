# tsops CLI commands

All commands accept `-c, --config <path>` (defaults to `tsops.config`) and `--dry-run`.

## `tsops plan`

Validate manifests, diff against cluster state, list orphaned resources. **Run before every deploy.**

```bash
tsops plan                              # all namespaces, all apps
tsops plan --namespace prod             # one namespace
tsops plan --namespace prod --app api   # one app in one namespace
tsops plan --dry-run                    # skip Docker/kubectl, log only
```

Output groups:
1. **Global resources** — namespaces, secrets, configMaps validated once across all apps.
2. **Per-app changes** — Deployment, Service, Ingress, etc. with diffs.
3. **Orphans** — resources tagged `tsops/managed=true` in the cluster but not declared in config. These will be deleted by `deploy`.
4. **Summary** — fails the command if any validation errors are present.

If plan output shows errors, **fix the config**, do not deploy.

## `tsops build`

Resolve image refs and invoke Docker.

```bash
tsops build                             # all apps with build definitions
tsops build --app api                   # one app
tsops build --force                     # rebuild even if image exists in registry
tsops build --changed-files <file>...   # incremental: only apps affected by changed files
```

Use `--changed-files` in CI to skip builds for unchanged services. Pair with `git diff --name-only HEAD^1`.

## `tsops deploy`

Apply manifests atomically, prune orphans.

```bash
tsops deploy --namespace prod
tsops deploy --namespace prod --app api
tsops deploy --namespace prod --dry-run
```

Deploy refuses to run if `plan` would have errors. Always atomic per app — partial failures roll back to the previous manifest version.

## `tsops up preview` / `tsops down preview`

Overlay namespace lifecycle. Used for PR-style preview environments.

```bash
tsops up preview --var pr=857                      # bring up overlay for PR #857
tsops up preview --var pr=857 --skip-cert          # operator debugging only
tsops up preview --var pr=857 --skip-database      # operator debugging only

tsops down preview --var pr=857                    # tear down + drop schema
tsops down preview --var pr=857 --keep-database    # tear down, keep DB
```

`--skip-cert` and `--skip-database` are operator-only flags. **Do not use them in CI or product orchestration** — they bypass the lifecycle hooks that make previews safe.

## Exit codes

- `0` — success or no changes
- `1` — validation error (config invalid, missing secret, etc.)
- `2` — runtime failure (Docker/kubectl error, network, ...)

In CI, treat `1` as "config bug, fix and retry"; treat `2` as "infrastructure issue, may be transient".
