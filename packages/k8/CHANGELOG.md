# @tsops/k8

## 1.9.0

### Minor Changes

- [#34](https://github.com/Pom4H/tsops/pull/34) [`416dace`](https://github.com/Pom4H/tsops/commit/416dacecd5143699ac32e79fb936b9375e8353fe) Thanks [@Pom4H](https://github.com/Pom4H)! - Composable app env: accept arrays of env sources and multiple `envFrom` refs.

  `app.env` may now be an array mixing plain records, `secret(...)` / `configMap(...)` refs (applied as `envFrom`), and resolver functions. Entries are merged left-to-right; duplicate keys follow last-wins.

  ```ts
  env: ({ secret, configMap, url }) => [
    secret("common-secrets"), // envFrom
    configMap("shared-config"), // envFrom
    { NODE_ENV: "production" }, // plain record
    ({ project }) => ({ PROJECT: project }),
    { API_URL: url("api", "service") },
  ];
  ```

  The deployment builder now emits one `envFrom` entry per ref, so combining several secrets and configMaps in a single app works correctly. Resolver functions can themselves return arrays; nested arrays are flattened.

  Internally `resolveEnv` now returns `ResolvedEnv = { env, envFrom }` and `PlanEntry.envFrom` is always populated (empty array when none). The k8 `ManifestBuilderContext.env` narrows to `Record<string, unknown>` and gains `envFrom?: Array<SecretRef|ConfigMapRef>`.

- [#28](https://github.com/Pom4H/tsops/pull/28) [`855c825`](https://github.com/Pom4H/tsops/commit/855c825a7fd190c790766f3cc3d98164cdfa99f1) Thanks [@Pom4H](https://github.com/Pom4H)! - Networking rework: correct `servicePort` vs `targetPort` semantics, runtime-aware URLs, named-port selection.

  **What changed**

  - `url(app, 'service')` now uses the k8s Service port (`servicePort`), not the container port. Default ports (`:80` / `:443`) are omitted.
  - New `namespace.runtime: 'kubernetes' | 'docker' | 'local'` controls how service URLs resolve:
    - `kubernetes` (default): `http://<app>` using `servicePort`.
    - `docker`: `http://<app>:<targetPort>` for docker-compose networking.
    - `local`: `http://localhost:<localPort ?? targetPort>`.
      Legacy `local: true` is a shorthand for `runtime: 'local'`.
  - New `ServicePort.localPort` lets multiple services coexist on localhost with distinct ports.
  - `DNSType` gains `'cluster'`: `dns(app, 'cluster')` → `app.ns.svc.cluster.local`.
  - New helpers on both app context and the `defineConfig` result: `servicePort(app, portName?)`, `targetPort(app, portName?)`, `listenPort(app, portName?)`. `url()` accepts `{ port: 'metrics' }` for named-port selection.
  - Port normalization (`"80:3000"` shorthand, `targetPort` fallback, named target ports) is now centralized in `@tsops/core` and re-exported from `tsops` as `normalizePort` / `normalizePorts` / `pickPort`.
  - Fixed: explicit `ingress.protocol` was silently discarded by operator-precedence bug in protocol auto-detection.

  **Migration**

  - Service URLs under a `kubernetes`-runtime namespace drop the container port. If you were relying on `url('api', 'service')` returning `http://api:3000`, either switch the namespace to `runtime: 'docker'` or use `targetPort(app)` directly.
  - Local-dev namespaces keep working: `local: true` continues to resolve to `localhost:<targetPort>`. Set `localPort` on a `ServicePort` to override per service.
