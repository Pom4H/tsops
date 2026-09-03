---
title: Monitoring example
---

# Monitoring example

[`examples/otel`](https://github.com/Pom4H/tsops/tree/main/examples/otel) models an application together with OpenTelemetry Collector, Loki, and Grafana.

## Inspect the graph

```bash
pnpm tsops plan \
  --config examples/otel/tsops.config.ts \
  --dry-run
```

## What to inspect

- Third-party services can use explicit images while product applications use Dockerfile builds.
- ConfigMaps carry collector and dashboard configuration.
- Volume and mount definitions stay next to the application that consumes them.
- Internal OTLP and dashboard endpoints are resolved from application keys rather than duplicated host-name strings.
- Public routes remain namespace-aware.

This example is intentionally application-scoped. Installing cluster-wide operators and shared observability infrastructure is normally better handled by Helm, GitOps, or upstream infrastructure tooling.
