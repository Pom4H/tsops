---
'@tsops/core': major
'@tsops/k8': minor
'@tsops/node': patch
'tsops': major
---

feat: preview/overlay namespaces (RFC 0001)

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
