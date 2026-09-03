# Examples

The repository keeps runnable or type-checked examples under [`examples/`](https://github.com/Pom4H/tsops/tree/main/examples). They are the source of truth; this page intentionally avoids copying large configurations that would drift.

## Full-stack application

[`examples/fullstack`](https://github.com/Pom4H/tsops/tree/main/examples/fullstack) contains a Hono backend, a Next.js frontend, Dockerfiles, ports, ingress, and a complete `tsops.config.ts`.

```bash
pnpm tsops plan --config examples/fullstack/tsops.config.ts --dry-run
```

Read the [full-stack notes](/examples/fullstack).

## Preview namespaces

[`examples/preview-namespaces`](https://github.com/Pom4H/tsops/tree/main/examples/preview-namespaces) demonstrates the complete overlay contract:

- a stable staging namespace;
- runtime `pr` variables;
- selective application deployment;
- fallback Services for untouched applications;
- wildcard TLS reuse;
- a fail-closed access gate;
- `ResourceQuota` and `LimitRange` policy;
- generated per-preview database credentials and schema lifecycle.

```bash
pnpm tsops up preview \
  --config examples/preview-namespaces/tsops.config.ts \
  --var pr=42 \
  --include worken-front \
  --dry-run
```

The authoritative field-by-field explanation is the [Preview environments contract](/guide/preview-overlays).

## Monorepo

[`examples/monorepo`](https://github.com/Pom4H/tsops/tree/main/examples/monorepo) shows multiple application build contexts and the configuration shape used for affected-build filtering.

```bash
pnpm tsops build \
  --config examples/monorepo/tsops.config.ts \
  --filter origin/main \
  --dry-run
```

Read the [monorepo notes](/examples/monorepo).

## OpenTelemetry stack

[`examples/otel`](https://github.com/Pom4H/tsops/tree/main/examples/otel) models an application together with OpenTelemetry Collector, Loki, and Grafana services. It is useful for service discovery, environment composition, and ingress examples.

Read the [monitoring notes](/examples/monitoring).

## Direct methods

[`examples/direct-methods`](https://github.com/Pom4H/tsops/tree/main/examples/direct-methods) exercises the programmatic API without depending on the CLI presentation layer. Use it when integrating `@tsops/core` or `@tsops/node` into another tool.

## CI examples

The [`docs/examples/ci-cd`](https://github.com/Pom4H/tsops/tree/main/docs/examples/ci-cd) directory contains workflow fragments for affected Docker builds and Turborepo integration. They are templates: registry authentication, cluster credentials, namespaces, and promotion policy must be adapted to the target repository.

## Keeping examples honest

Examples should satisfy three rules:

1. Reference only current public types and CLI flags.
2. Link to repository files rather than duplicating long configurations in documentation.
3. Use `--dry-run` in copy-paste validation commands unless the section explicitly explains cluster side effects.

A public feature is not complete until at least one maintained example demonstrates it.
