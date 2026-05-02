# @tsops/k8

## 2.0.2

## 2.0.1

### Patch Changes

- [#53](https://github.com/Pom4H/tsops/pull/53) [`93cb495`](https://github.com/Pom4H/tsops/commit/93cb4951643cd8d68e418a101670d5c7100d5b9f) Thanks [@arhebs](https://github.com/arhebs)! - Complete the PR preview overlay contract by copying configured app secrets into
  overlay namespaces and report the CLI version from the published package
  metadata.

## 2.0.0

### Minor Changes

- [#47](https://github.com/Pom4H/tsops/pull/47) [`b7895b3`](https://github.com/Pom4H/tsops/commit/b7895b363e3a4b89824da7f7e54d1ae0dee13cb9) Thanks [@Pom4H](https://github.com/Pom4H)! - feat: preview/overlay namespaces (RFC 0001)

  Adds first-class support for ephemeral preview namespaces (e.g. one per pull
  request) on top of the existing static namespace model.

  - New `OverlayNamespaceDefinition` form: `extends`, `naming(vars)`,
    `domain(vars)`, `fallback`, optional `cert` and `database`.
    `NamespaceDefinition` is now a discriminated union — see
    `isOverlayNamespace` for the type guard.
  - New CLI commands: `tsops up <ns> --var key=value [--include a,b]
[--apps-from-changes]` and `tsops down <ns> --var key=value`.
  - Apps not in `--include` are emitted as `Service: ExternalName` proxies into
    the overlay's `fallback` namespace, so partial deploys stay routable.
  - Optional per-namespace TLS via certbot DNS-01 (`cert.mode: 'per-namespace'`)
    or shared wildcard reuse (`cert.mode: 'wildcard-shared'`).
  - Optional schema-per-overlay PostgreSQL lifecycle (`database.preDeploy` /
    `postDestroy`).

  Existing static-namespace configs are unaffected; the union widening is the
  reason for the major bump on `@tsops/core` / `tsops`.

## 1.8.0

- Initial release prior to introducing this changelog.
- Detailed release notes for this version were not backfilled here.

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
