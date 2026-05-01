# RFC 0001: Platform abstraction for non-Kubernetes targets

- **Status:** Draft
- **Author(s):** @pom4h
- **Created:** 2026-05-01
- **PR:** _to be assigned_
- **Implementation tracking:** _to be filed_

## Summary

Introduce a `Platform` abstraction so an app declared in `tsops.config.ts`
can target a deployment backend other than Kubernetes — initially Vercel —
while still participating in the same typed config graph (service
discovery, env, secrets, plan/deploy lifecycle).

The Kubernetes flow becomes the default platform; new platforms are added
as packages that implement a small `PlatformAdapter` contract. Apps opt
into a non-default platform with a `platform: vercel({ ... })` marker.
Apps without the marker continue to behave exactly as today.

## Motivation

The single largest piece of value tsops delivers is **one typed config
imported by both the manifest builder and the application code**. That
value compounds when the same config covers a hybrid topology:

```
┌──────────────────┐                  ┌──────────────────┐
│  web (Vercel)    │ ──────────────▶  │  api (k8s)       │
│                  │   typed URL      │                  │
└──────────────────┘                  └──────────────────┘
```

Today, a team that wants their frontend on Vercel and backend on
Kubernetes has to:

1. Maintain two configurations (`tsops.config.ts` for k8s + `vercel.json`
   + Vercel dashboard env vars).
2. Hardcode the API URL into Vercel env vars (`NEXT_PUBLIC_API_URL`),
   typed against nothing.
3. Discover renames and ingress changes at runtime — Vercel deploy
   succeeds, frontend gets a 502 against the renamed service.

The compiler is sitting right there and cannot help, because the
operational model spans two systems.

There is no Vercel-shaped fix for this — the fix is to extend tsops's
operational model to cover both platforms, and that is what this RFC
proposes.

## Guide-level explanation

A user marks an app with the `platform` field to deploy it somewhere
other than Kubernetes:

```ts
import { defineConfig } from 'tsops'
import { vercel } from '@tsops/vercel'

export default defineConfig({
  apps: {
    web: {
      platform: vercel({
        projectId: 'prj_orchard_web',
        deploySource: 'git'
      }),
      ingress: ({ domain }) => ({ domain: `app.${domain}` }),
      env: ({ secret }) => ({
        SENTRY_DSN: secret('web-secrets', 'SENTRY_DSN')
      })
    },

    api: {
      // No platform marker → defaults to Kubernetes (today's behaviour)
      build: { type: 'dockerfile', context: './api', dockerfile: './api/Dockerfile' },
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],
      ingress: ({ domain }) => ({ domain: `api.${domain}` })
    }
  }
})
```

The application code on Vercel imports the same config it always does:

```ts
// apps/web/src/api-client.ts
import config from '../../tsops.config'

const apiUrl = config.url('api', 'ingress')   // → https://api.example.com
```

`tsops plan` and `tsops deploy` work as before, but their output is
now grouped per platform:

```
📋 Plan: orchard @ prod

▾ Kubernetes
   api @ prod (api.example.com)
      ➕ Deployment/orchard-api
      ➕ Service/orchard-api
      ➕ Ingress/orchard-api

▾ Vercel
   web @ prod (project: prj_orchard_web)
      ➕ env  NEXT_PUBLIC_API_URL=https://api.example.com (target: production)
      ➕ env  SENTRY_DSN=*** (encrypted, target: production)
      ➕ domain  app.example.com

✅ Validation passed.
```

A user without any `platform` markers in their config sees no change in
behaviour, output, or required adapters.

## Reference-level explanation

### Contract

A new port lives in `@tsops/core`:

```ts
// packages/core/src/ports/platform.ts

export interface PlatformAdapter<TPlatformOptions = unknown> {
  /** Stable identifier — matches the `kind` field on platform options. */
  readonly kind: string

  /**
   * Plan changes for one app/namespace. Pure: must not mutate external
   * state. Returns a per-platform `Change` shape that the CLI renders
   * generically via `describe()`.
   */
  plan(input: PlatformPlanInput<TPlatformOptions>): Promise<PlatformChange>

  /**
   * Apply a change produced by `plan`. Idempotent — running deploy twice
   * with no source changes must be a no-op (modulo deployment triggers).
   */
  apply(change: PlatformChange, ctx: PlatformApplyContext): Promise<PlatformApplyResult>

  /**
   * Render a `PlatformChange` as user-facing diff lines. Returns plain
   * strings so the CLI doesn't have to know per-platform shapes.
   */
  describe(change: PlatformChange): string[]
}

export interface PlatformPlanInput<TOptions> {
  app: string
  namespace: string
  production: boolean
  platform: TOptions
  resolvedEnv: Record<string, string>
  resolvedSecrets: Record<string, string>
  ingressDomain?: string
}

export interface PlatformChange {
  kind: string
  app: string
  summary: { add: number; update: number; remove: number }
  payload: unknown // per-platform
}
```

### Per-app discriminator

`AppDefinition` gains an optional `platform` field:

```ts
// packages/core/src/types.ts

export interface PlatformOptionsBase {
  readonly kind: string
}

export type AppDefinition<...> = {
  // ...existing fields
  platform?: PlatformOptionsBase
}
```

Concrete platform packages export a tagged factory:

```ts
// packages/vercel/src/index.ts
export function vercel(options): VercelPlatformOptions {
  return { kind: 'vercel', ...options }
}
```

The `kind` discriminator is what the orchestrator switches on at
plan/deploy time.

### Orchestrator changes

The current `TsOps` constructor unconditionally requires `docker` and
`kubectl`:

```ts
// today
if (!options || !options.docker || !options.kubectl) {
  throw new Error('TsOps requires docker and kubectl adapters. ...')
}
```

This becomes:

```ts
// proposed
constructor(config, options: TsOpsOptions) {
  this.platforms = new Map<string, PlatformAdapter>()

  // Default Kubernetes platform — registered only if any app needs it.
  const needsK8s = appsWithoutPlatformMarker(config).length > 0
  if (needsK8s) {
    if (!options.docker || !options.kubectl) {
      throw new Error('Kubernetes apps require docker and kubectl adapters.')
    }
    this.platforms.set('kubernetes', new KubernetesPlatformAdapter({ ... }))
  }

  for (const platform of options.platforms ?? []) {
    this.platforms.set(platform.kind, platform)
  }

  this.assertPlatformsCoverConfig(config)
}
```

`Builder`, `Planner`, and `Deployer` are refactored to dispatch per-app:

```ts
async planWithChanges(options) {
  const apps = this.resolver.resolveApps(options)
  const result: PlanResult = { global: ..., apps: [] }

  for (const app of apps) {
    const platform = this.platforms.get(app.platform.kind)
    if (!platform) {
      throw new Error(`No adapter registered for platform: ${app.platform.kind}`)
    }
    const change = await platform.plan(toPlatformPlanInput(app))
    result.apps.push({ app: app.name, namespace: app.namespace, change })
  }

  return result
}
```

The existing per-namespace global resources flow (namespaces, shared
secrets, configMaps) stays scoped to the Kubernetes adapter.

### `createNodeTsOps`

Becomes a thin wiring helper:

```ts
export function createNodeTsOps(config, options = {}) {
  const platforms: PlatformAdapter[] = options.platforms ?? []
  // ... existing default docker/kubectl wiring, but conditional on
  //     whether any app needs them
  return new TsOps(config, { docker, kubectl, platforms, ... })
}
```

`@tsops/vercel` consumers register the adapter explicitly:

```ts
import { createNodeTsOps } from '@tsops/node'
import { VercelApi, VercelPlatformAdapter } from '@tsops/vercel'

const tsops = createNodeTsOps(config, {
  platforms: [
    new VercelPlatformAdapter({
      client: new VercelApi({ token: process.env.VERCEL_TOKEN!, logger })
    })
  ]
})
```

### Cross-platform service discovery

`config.url('api', 'service')` and `config.url('api', 'cluster')` only
make sense for in-cluster traffic. Behaviour from a Vercel-hosted
caller:

- `config.url('api', 'ingress')` — works as today, returns the public URL.
- `config.url('api', 'service' | 'cluster')` — at type level, the
  `app: TAppNames` parameter is narrowed by the caller's platform; calls
  to non-Kubernetes-resolvable forms produce a typed error in the
  caller.

This is enforceable today because runtime helpers are generated per
config; the generator can emit a narrower signature when the caller
has been tagged with a non-Kubernetes platform. Detail of the typing
mechanism is left to implementation.

### Preview overlays

Overlay namespaces (`pr-857`) materialise as real Kubernetes namespaces.
Vercel apps in the same config respond differently:

- For `tsops up preview --var pr=857`, the Vercel adapter creates env-var
  entries scoped to `target: 'preview'` and attaches the overlay's
  generated subdomain to the Vercel project.
- `tsops down preview` removes those env vars and detaches the subdomain.
- Vercel's own per-PR preview deployments are orthogonal and continue to
  happen on git push; tsops only owns the env/domain state attached to
  them.

### Migration

This is fully backwards-compatible:

- Configs without `platform` markers behave identically to today.
- The `TsOpsOptions` shape gains an optional `platforms?:
  PlatformAdapter[]` field; `docker` and `kubectl` remain required for
  configs with at least one Kubernetes app, which today is every config.
- No public types are removed. `kind: 'kubernetes'` is reserved as a
  built-in platform identifier.

A dedicated `kubernetes()` helper is _not_ added; omitting `platform`
remains the canonical way to say "this is a Kubernetes app". This keeps
existing configs untouched.

## Drawbacks

1. **Surface area growth.** Every new platform becomes an external
   contract. Once `kind: 'vercel'` is shipped, breaking changes to that
   shape become user-visible. The same is true for `PlatformAdapter`
   itself — adding a method later is a breaking change for adapter
   authors.

2. **Test matrix.** End-to-end tests now need to cover hybrid configs.
   Recording a Vercel API fixture takes work and the fixture decays as
   Vercel evolves its API.

3. **The "platform" word is overloaded.** Kubernetes itself is a
   platform; a deploy target is a platform; an internal developer
   platform is a platform. Naming is hard. Alternatives: `target`,
   `runtime`, `backend`. `runtime` already exists in tsops with a
   different meaning (`namespace.runtime`); `backend` reads strangely
   in code (`backend: vercel(...)`). `platform` is the least bad.

4. **Cross-platform service discovery typing is non-trivial.** Doing
   this without forcing the user to manually annotate every helper call
   requires generator changes that have not been prototyped yet.

5. **Drift detection lacks a state file.** Kubernetes drift is detected
   via `tsops/managed=true` labels. Vercel has no equivalent — env vars
   edited in the Vercel dashboard are indistinguishable from
   tsops-managed ones. The simplest answer is "tsops always wins on
   apply" but this surprises users who have edited values in the
   dashboard. An RFC for Vercel-side drift policy is a likely follow-up.

## Rationale and alternatives

### Alternative 1: keep tsops Kubernetes-only

Status quo. Users wanting a hybrid topology maintain two configs and
hardcode cross-system URLs. This is the cost of doing nothing.

This is the right choice _if_ tsops's intended scope is "a typed
Kubernetes deploy tool". This RFC argues that the intended scope is "a
typed operational model for product topology", and product topology
already routinely spans Kubernetes + a SaaS frontend host.

### Alternative 2: per-app overrides without an abstraction

Add a `vercel: { ... }` field to `AppDefinition` directly. Cheap, no
contract design needed.

Rejected because:

- It pushes Vercel into the core type definitions, even for users who
  don't use Vercel.
- The next platform (Fly.io, Cloud Run, ...) re-runs the entire
  argument; we end up with `app.vercel`, `app.flyio`, `app.cloudRun` —
  a worse version of the abstraction proposed here.

### Alternative 3: separate top-level configs per platform

`tsops.k8s.config.ts` + `tsops.vercel.config.ts`. Each tool reads its
own.

Rejected because it loses the entire reason for the integration: a
single typed graph that the application code imports. With separate
configs, `web` cannot type-check against `api`'s ingress.

### Alternative 4: external orchestration (CDK8s + Vercel SDK glue)

Build the typed graph outside tsops in user code, generate manifests
and Vercel API calls separately.

Rejected because it externalises exactly the integration tsops is built
to provide. Every user reinvents the same wheel.

## Prior art

- **Pulumi** has cross-cloud resources via providers, but each app's
  state is owned by one provider — no equivalent of "frontend on Vercel
  imports the same config as backend on AWS".
- **CDK8s** generates Kubernetes manifests from typed code but does not
  expose the result to application code at runtime.
- **SST** (Serverless Stack) has typed resource references that the app
  imports; closest in spirit. SST is AWS-only; this RFC generalises the
  pattern to multi-platform.
- **Encore** has a typed application graph that compiles to multiple
  cloud targets. Different ergonomic choice (annotated code, not a
  config file) but the same underlying insight.

## Unresolved questions

1. **Adapter loading.** Should the orchestrator auto-detect platform
   adapters from `apps.*.platform.kind` and dynamically import the
   matching package, or always require explicit registration in
   `createNodeTsOps`? Auto-detection is friendlier; explicit is more
   honest about dependencies.

2. **Preview overlay coherence.** A Vercel app in an overlay namespace
   creates `target: 'preview'` env vars on the shared Vercel project.
   Two simultaneous PRs touching the same Vercel project will overwrite
   each other's env vars unless tsops scopes them per overlay. Vercel's
   API supports per-deployment env vars but not per-PR env-var
   isolation on the project. Open question: is per-overlay isolation
   in scope for this RFC, or a follow-up?

3. **Build artefacts.** For `deploySource: 'api'` on Vercel, tsops needs
   either a tarball of the build context or a git ref. Should the
   `Builder` operation be generalised to "produce a build artefact"
   (image ref _or_ tarball _or_ git ref), or is each platform
   responsible for its own build path?

4. **Service discovery typing.** Outlined above; mechanism not
   prototyped. May require a small change to how `defineConfig` infers
   the runtime helpers' generic parameters.

5. **Drift policy on Vercel.** "tsops always wins" vs "warn on
   tsops-unknown env vars" vs "explicit `tsops.vercel/managed=true`
   tag". No clean answer; needs a follow-up RFC once Vercel users have
   real-world experience.

## Future possibilities

- **Additional platforms.** Fly.io, Cloud Run, Cloudflare Workers, AWS
  Lambda all fit the same `PlatformAdapter` shape. Each one is a
  separate package; none requires changes to `@tsops/core` after this
  RFC lands.
- **Cross-platform dependency graph.** `app.needs` already declares
  inter-app dependencies. Once platforms are pluggable, the planner can
  topologically sort across platforms (deploy `api` to k8s before
  `web` on Vercel, so the new ingress URL exists by the time Vercel
  builds).
- **Edge runtime config helpers.** `config.url(...)` could grow a
  `runtime: 'edge'` mode that produces values usable inside Cloudflare
  Workers / Vercel Edge Functions, where module resolution is
  different.
- **Multi-platform observability.** A `tsops status` command that
  queries each platform's API and prints consolidated health is a
  natural extension once adapters exist.

## Implementation phasing

If accepted, the work splits into independently-shippable phases:

**Phase 1 — Contract.** Land `PlatformAdapter` + per-app `platform`
field in `@tsops/core`. The Kubernetes flow becomes the default
platform internally but is not yet exposed as a registered adapter.
No user-visible change.

**Phase 2 — Vercel adapter.** Fill in `VercelApi` HTTP calls, ship
`@tsops/vercel` v0.1 covering `deploySource: 'git'` (env + domain
sync). CLI dispatches per platform.

**Phase 3 — API-driven Vercel deploys.** `deploySource: 'api'` mode,
build artefact handling, full preview-overlay coherence.

**Phase 4 — Service-discovery typing.** Type-level enforcement that
Vercel-hosted callers cannot resolve `service`/`cluster` URLs.

Phases 1 and 2 together are the "answer Russ's hybrid Vercel/k8s
question" milestone — roughly two weeks of focused work.
