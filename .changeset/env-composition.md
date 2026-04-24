---
'@tsops/core': minor
'@tsops/k8': minor
'tsops': minor
---

Composable app env: accept arrays of env sources and multiple `envFrom` refs.

`app.env` may now be an array mixing plain records, `secret(...)` / `configMap(...)` refs (applied as `envFrom`), and resolver functions. Entries are merged left-to-right; duplicate keys follow last-wins.

```ts
env: ({ secret, configMap, url }) => [
  secret('common-secrets'),        // envFrom
  configMap('shared-config'),      // envFrom
  { NODE_ENV: 'production' },      // plain record
  ({ project }) => ({ PROJECT: project }),
  { API_URL: url('api', 'service') }
]
```

The deployment builder now emits one `envFrom` entry per ref, so combining several secrets and configMaps in a single app works correctly. Resolver functions can themselves return arrays; nested arrays are flattened.

Internally `resolveEnv` now returns `ResolvedEnv = { env, envFrom }` and `PlanEntry.envFrom` is always populated (empty array when none). The k8 `ManifestBuilderContext.env` narrows to `Record<string, unknown>` and gains `envFrom?: Array<SecretRef|ConfigMapRef>`.
