# Hybrid Vercel + Kubernetes example

Frontend on Vercel, API on Kubernetes — described in one `tsops.config.ts`.

```
┌──────────────────┐                  ┌──────────────────┐
│  web (Vercel)    │ ───────────────▶ │  api (k8s)       │
│  Next.js / etc   │   typed URL       │  Dockerfile      │
└──────────────────┘                  └──────────────────┘
```

## What this demonstrates

- **One typed config covers both platforms.** `web` uses `platform: vercel(...)`; `api` uses the default Kubernetes flow.
- **Cross-platform service discovery is type-safe.** The Next.js frontend on Vercel imports the same `tsops.config.ts` and calls `config.url('api', 'ingress')`. Renaming `api` is a compile error in `web`.
- **Per-platform deploy semantics.** `tsops plan` produces two sections — Vercel env-var/domain diffs for `web`, kubectl resource diffs for `api`. `tsops deploy` dispatches to the right backend per app.

## Status

This example targets the **finished** integration of `@tsops/vercel`. Today:

- `api @ prod` works end-to-end — that's the standard tsops k8s flow.
- `web @ prod` requires the in-progress Vercel orchestrator and REST adapter implementation. See [`docs/guide/vercel.md`](../../docs/guide/vercel.md) for the integration plan and effort estimate.

## Running (when ready)

```bash
# Validate everything that can be validated today
pnpm tsops plan --namespace prod

# Deploy only the k8s app
pnpm tsops deploy --namespace prod --app api

# Deploy only the Vercel app (once the adapter is implemented)
VERCEL_TOKEN=... pnpm tsops deploy --namespace prod --app web
```

## Files

- `tsops.config.ts` — the hybrid configuration.
- `apps/web/` — would contain the Next.js project (not included in this skeleton).
- `apps/api/` — would contain the API service Dockerfile (not included in this skeleton).
