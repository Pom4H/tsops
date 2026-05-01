# Runtime helpers

Importing `tsops.config.ts` in application code unlocks three helpers. These are the **type-safe replacement for environment variables** for any value tsops already knows about.

```ts
import config from '../tsops.config'
```

The active namespace is selected by `process.env.TSOPS_NAMESPACE` at runtime. If unset, the first namespace declared in the config wins (use this only for local development).

## `config.url(app, scope, options?)`

Returns a complete URL with protocol resolved from context.

```ts
config.url('api', 'service')                       // → http://api
config.url('api', 'cluster')                       // → http://api.prod.svc.cluster.local
config.url('api', 'ingress')                       // → https://api.example.com   (prod)
                                                   //   http://api.dev.localtest.me (dev)

config.url('api', 'service', { port: 'metrics' })  // → http://api:9090
```

| Scope     | Use when                                                  |
|-----------|-----------------------------------------------------------|
| `service` | Same-namespace calls. Default for backend-to-backend.     |
| `cluster` | Cross-namespace calls. Required when caller and callee live in different namespaces. |
| `ingress` | External calls (browser, Vercel-hosted frontend). Public URL with TLS. |

Protocol selection:
- `service` / `cluster` always `http` (in-cluster traffic)
- `ingress` reads from the app's `ingress` config; auto-detects `http` for `*.localtest.me` / `localhost` / `*.local`, `https` otherwise

## `config.dns(app, scope)`

Like `url` but returns just the hostname. Use when you need the bare DNS name (e.g. for `Host:` headers, gRPC channels, custom protocol prefixes).

## `config.env(app, key)`

Resolved environment variable for one app in the active namespace.

```ts
const nodeEnv = config.env('api', 'NODE_ENV')   // typed as string, key autocompleted
```

Use this only to read values that tsops already defined for the app's `env` block. For ad-hoc env reads, use `process.env` directly.

## Namespace switching at runtime

```bash
TSOPS_NAMESPACE=prod node server.js
TSOPS_NAMESPACE=pr-857 node server.js   # in a preview overlay namespace
```

This is the **only** way to switch namespace at runtime. Do not parse the namespace from a custom env var — `TSOPS_NAMESPACE` is the contract.

## When to use `config.url` vs an env var

```ts
// ✅ Internal service — always config.url
const apiUrl = config.url('api', 'service')

// ✅ External service tsops doesn't know about — env var is correct
const stripeKey = process.env.STRIPE_API_KEY

// ❌ Wrong: hardcoding internal URL in env
// In tsops.config.ts:  env: () => ({ BACKEND_URL: 'http://api:3000' })
// In app code:         fetch(process.env.BACKEND_URL + '/foo')

// ✅ Right: same intent, type-safe
// In app code:         fetch(config.url('api', 'service') + '/foo')
```

If the user (or another agent) tries to add an internal URL to the `env` block, refuse and explain. This is non-negotiable — see the "Hard rules" section in `SKILL.md`.
