---
'@tsops/core': minor
'@tsops/k8': minor
'tsops': minor
---

Networking rework: correct `servicePort` vs `targetPort` semantics, runtime-aware URLs, named-port selection.

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
