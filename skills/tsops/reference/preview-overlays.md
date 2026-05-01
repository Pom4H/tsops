# Preview overlay namespaces

Overlay namespaces are PR-style ephemeral environments. They inherit from a base static namespace and are materialized at runtime via `--var key=value`.

## Lifecycle

```bash
tsops up   preview --var pr=857   # create namespace pr-857
tsops down preview --var pr=857   # delete namespace + drop schema
```

`tsops up` applies resources in this order:

1. Namespace
2. ResourceQuota / LimitRange (`namespacePolicy`)
3. TLS hook (`cert`) — copies wildcard cert from source namespace
4. Access hook (`access`) — Traefik BasicAuth middleware attached to all public routes
5. Database pre-deploy hook (`database.preDeploy`) — runs schema migration job, awaited before app rollout
6. App secrets, configMaps, workloads, services, public routes

`tsops down` runs `database.postDestroy` (default: drop schema) before namespace deletion, unless `--keep-database` is set.

## Common operations

### Bring up a preview for PR #857

```bash
tsops up preview --var pr=857
```

This creates namespace `pr-857` with all apps. Vars (like `pr`) are passed via `--var`; the overlay's `naming` and `domain` templates produce the final namespace name and ingress hostname.

### Deploy only changed apps to the overlay

```bash
tsops up preview --var pr=857 --include web,api
```

Apps **not** in `--include` become `Service: ExternalName` stubs that proxy to the same app in the overlay's `fallback` namespace (typically staging). This lets a single PR show changes to only the services it touches.

### Tear down

```bash
tsops down preview --var pr=857
```

Always teardown when the PR closes. Overlay namespaces are guarded against accidental teardown of static namespaces — `tsops down` refuses to run on a non-overlay namespace. Static namespaces must be deleted via `kubectl` after human review.

## When to add a new var

If the user says "I need to parameterize X per preview", that's a new `OverlayVars` field:

```ts
namespaces: {
  preview: {
    extends: 'staging',
    naming: ({ pr }) => `pr-${pr}`,
    domain: ({ pr }) => `pr-${pr}.staging.example.com`,
    fallback: 'staging',
    // new var: deploy a different image tag for testing
    imageTag: ({ tag }) => tag
  }
}
```

Then deploy with `tsops up preview --var pr=857 --var tag=feat-foo-abc123`.

## Hard rules for previews

1. **Never disable BasicAuth** (`failClosed: false`) in production preview configs unless the access secret is actually optional. The default — `failClosed: true` — is what keeps preview environments from leaking to the public internet.

2. **Never reuse runtime DB credentials across overlays.** Use `runtimeSecret.mode: 'generated-per-overlay'` so each PR gets its own role/password. Reuse causes one PR's tests to corrupt another's data.

3. **Never run `--skip-cert` or `--skip-database` in CI.** Those flags are operator debugging aids; they bypass safety hooks.

4. **`tsops down` is destructive.** It drops the database schema by default. If the user wants to inspect post-mortem, run `--keep-database` and remember to clean up later.
