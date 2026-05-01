# @tsops/vercel

> **Status: skeleton.** Port surface and orchestration are in place; the REST adapter throws stubs.

Vercel platform adapter for tsops. Lets you describe a Vercel-deployed app in the same `tsops.config.ts` you use for Kubernetes, and lets your application code import the same typed config (URLs, env, secrets) regardless of where each app actually runs.

## Why

tsops's value is a typed operational model — one `tsops.config.ts` consumed by both the manifest builder and your application code. That value compounds when the same config covers a hybrid topology:

- **frontend** on Vercel (`platform: vercel({ projectId })`)
- **backend** on Kubernetes (default)

`config.url('api', 'ingress')` on the frontend resolves to the k8s ingress URL; renaming the backend or moving it to a different namespace is a compile error in every Vercel-hosted caller.

## Mapping

| tsops concept            | Vercel concept                          |
|--------------------------|------------------------------------------|
| `namespace.production`   | `target: 'production'`                   |
| any other namespace      | `target: 'preview'` (configurable)       |
| `app.ingress.domain`     | Project domain attachment                |
| `app.env`                | Project env vars (per-environment bucket)|
| `app.secrets`            | Encrypted env vars                       |
| `app.build`              | Skipped — Vercel builds                  |
| `app.ports`              | Ignored — Vercel handles routing         |
| `tsops plan`             | Diff env, domains, project settings      |
| `tsops deploy`           | Sync settings (+ trigger deploy if API mode) |

## Two deploy sources

`vercel({ projectId, deploySource: 'git' })` (default):
- Vercel pulls from your connected git repo on push.
- `tsops deploy` only syncs env vars, domains, and project settings.
- Builds happen outside tsops.

`vercel({ projectId, deploySource: 'api' })`:
- `tsops deploy` triggers `POST /v13/deployments`.
- Useful when you want `tsops plan` validation to gate the deploy, or to ship from non-git sources.

## What's in the skeleton

```
src/
├── index.ts                 # public API + vercel() helper
├── types.ts                 # VercelPlatformOptions, VercelChange, ...
├── mapping.ts               # namespace → environment, env/domain diff
├── ports/vercel.ts          # VercelClient port (DI surface)
├── adapters/api.ts          # REST adapter — stubs that log + throw
└── operations/
    ├── planner.ts           # diff desired vs current state
    └── deployer.ts          # apply a VercelChange in correct order
```

## What's not done

- `VercelApi` HTTP calls — every method throws "not implemented yet". Filling them in is mostly mechanical (Vercel REST API + `fetch`).
- Wiring into `@tsops/core`'s `TsOps` orchestrator — currently a parallel mini-orchestrator. See `docs/guide/vercel.md` for the proposed core change.
- CLI plumbing — `tsops plan` / `tsops deploy` need to dispatch Vercel-platform apps to this package instead of kubectl.
- Build integration — for `deploySource: 'api'`, we need either a tarball builder or git-ref resolution.
- Secret value mapping — currently treats all env values as strings; `SecretRef` / `ConfigMapRef` resolution still needs to be plugged through.

## License

MIT
