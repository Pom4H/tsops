# Vercel adapter

> **Status: skeleton.** Package scaffold and types are in place at `packages/vercel`. The REST adapter throws stubs and the orchestrator integration is not wired through the existing `tsops` CLI yet. This page is the design doc for finishing the work.

## Why a Vercel adapter at all

tsops's value proposition is a typed operational model — one `tsops.config.ts` consumed by both the manifest builder and the application code. That value compounds when the same config covers a hybrid topology:

```
┌──────────────────┐                ┌──────────────────┐
│ frontend (web)   │                │ api              │
│ platform: vercel │ ── config.url('api', 'ingress') ─▶│ kubernetes       │
└──────────────────┘                └──────────────────┘
```

Renaming the `api` app, changing its port, or moving it across namespaces is a compile error in every Vercel-hosted caller. Without this, the frontend ends up with `BACKEND_URL` strings in `vercel env` that drift independently of the cluster.

## Conceptual mapping

Vercel and Kubernetes are not the same shape. The mapping below is the contract that the rest of the design follows.

| tsops concept             | Vercel concept                              | Notes                                                          |
|---------------------------|----------------------------------------------|----------------------------------------------------------------|
| `namespace.production`    | `target: 'production'`                       | Configurable via `vercel({ environment })`                     |
| any other namespace       | `target: 'preview'`                          | All overlay namespaces (`pr-*`) collapse here by default       |
| `app.ingress.domain`      | Project domain attachment                    | TLS provisioned by Vercel                                      |
| `app.env`                 | Project env vars (per-environment bucket)    | Plain values                                                   |
| `app.secrets`             | Encrypted env vars (`type: 'encrypted'`)     | tsops still validates placeholders before sending              |
| `app.build`               | _Skipped_                                    | Vercel builds; we don't build images                           |
| `app.ports`               | _Ignored_                                    | Vercel handles routing                                         |
| `tsops plan`              | Diff env, domains, project settings          | Same diff-first UX as the kubectl path                         |
| `tsops deploy`            | Sync settings (and optionally trigger a deploy) | Two modes — see below                                       |

## Two deploy sources

The single biggest design choice is whether tsops triggers Vercel deployments or just syncs surrounding state.

### `deploySource: 'git'` (default)

```ts
platform: vercel({ projectId: 'prj_abc', deploySource: 'git' })
```

Vercel's git integration owns the build trigger. `tsops deploy` only:
1. Applies env-var deltas (so the next deploy picks them up).
2. Attaches/detaches domains.

**Pros:** keeps Vercel's idiomatic flow (PR previews, comments, instant rollback). Zero CI changes.

**Cons:** `tsops plan` cannot block the deploy itself — only the env state. If a developer pushes a broken commit, Vercel deploys it; tsops only catches drift on the next `plan`.

### `deploySource: 'api'`

```ts
platform: vercel({ projectId: 'prj_abc', deploySource: 'api' })
```

`tsops deploy` calls `POST /v13/deployments` with either a git ref or a pre-built tarball. Builds happen on Vercel; tsops gates the trigger.

**Pros:** `tsops plan` validation runs before any deploy. Same atomic-deploy story as Kubernetes.

**Cons:** Lose Vercel's git-integration features (PR comments, automatic previews per branch). You're now responsible for branch ↔ env mapping in CI.

**Recommended default:** `'git'` for product apps, `'api'` for monorepos where multiple changes need to ship together.

## Architecture

```
packages/vercel/
├── src/
│   ├── index.ts                 # vercel() helper, public re-exports
│   ├── types.ts                 # VercelPlatformOptions, VercelChange, ...
│   ├── mapping.ts               # namespace → environment, diffs
│   ├── ports/vercel.ts          # VercelClient port
│   ├── adapters/api.ts          # REST adapter (stubs)
│   └── operations/
│       ├── planner.ts           # diff desired vs current
│       └── deployer.ts          # apply a VercelChange in order
```

This mirrors `@tsops/core` + `@tsops/node`: a port (`VercelClient`) and an adapter (`VercelApi`), so consumers can swap the implementation or stub it in tests.

## Integration with the core orchestrator

The current `TsOps` constructor in `@tsops/core` requires both `docker` and `kubectl` adapters:

```ts
// packages/core/src/tsops.ts
constructor(config: TConfig, options: TsOpsOptions) {
  if (!options || !options.docker || !options.kubectl) {
    throw new Error('TsOps requires docker and kubectl adapters. ...')
  }
}
```

For a clean hybrid story, this needs to change to:

1. **Make adapters opt-in.** An app declaring `platform: vercel(...)` doesn't need Docker or kubectl. An app without a `platform` field defaults to Kubernetes (current behaviour). Both adapters become optional, validated only when at least one app demands them.

2. **Add a `platform` discriminator on `AppDefinition`.** With a tagged union (`{ kind: 'kubernetes' | 'vercel' | ... }`), the `Builder`, `Planner`, and `Deployer` route per-app to the correct backend. The k8s flow stays unchanged for apps without `platform`.

3. **Aggregate per-platform plan output.** `planWithChanges` already groups by app — adding a `platform` field per entry is non-breaking. The CLI renderer can then label each app's changes (`api @ prod (kubernetes)`, `web @ prod (vercel)`).

The skeleton intentionally avoids these changes for now and ships a parallel mini-orchestrator (`VercelPlanner` + `VercelDeployer`) so the package can be exercised in isolation.

## Open questions

- **Cross-platform service discovery.** `config.url('api', 'service')` only makes sense for in-cluster traffic. For Vercel→k8s, callers should use `config.url('api', 'ingress')`. Should we make `service` throw a typed error when called from a Vercel-hosted app, or silently fall back to `ingress`?
- **Preview overlays.** A `pr-857` overlay in tsops creates a real namespace in k8s. On Vercel, every PR already gets a preview deployment automatically. Mapping is probably "Vercel apps ignore overlays; k8s apps materialise them" — but tsops needs to keep `config.url(...)` resolution coherent across both.
- **Secret values.** Currently the planner expects pre-resolved string env. The k8s path keeps `SecretRef` / `ConfigMapRef` markers up to manifest time so secrets never leave the operator's machine. For Vercel, we have to resolve the value (POST to API). That's a different security posture and worth documenting per-app.
- **Drift detection on Vercel side.** Vercel projects can be edited via the dashboard. Should `tsops plan` flag dashboard-edited values as orphans, or treat the dashboard as authoritative? K8s answer is "tsops/managed=true label". Vercel has no equivalent; closest is `comment` field on env vars.

## Effort estimate

For a v0.1 that covers the 80% case (`deploySource: 'git'`, env + domain sync, dry-run support):

- REST adapter: 2–3 days
- Core change for opt-in adapters + platform discriminator: 1–2 days
- CLI dispatch + output formatting: 1 day
- Tests against a recorded Vercel API fixture: 1–2 days
- Docs + examples: 1 day

Roughly a week of focused work. `deploySource: 'api'` and full preview-overlay coherence add another week.

## Related

- Skeleton: `packages/vercel/`
- Hybrid example: `examples/hybrid-vercel-k8s/`
- Architecture overview: [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
