---
title: Monitoring (OTEL + Loki + Grafana)
---

## Monitoring Example

This example deploys an observability stack with OpenTelemetry Collector, Loki and Grafana.

- Project files live in `examples/otel/`
- Config is defined in `examples/otel/tsops.config.ts`

### How to run

```bash
pnpm install
pnpm tsops plan --config examples/otel/tsops.config.ts
```

### Config Highlights

- `otelCollector`, `loki`, `grafana` are defined with `image`
- ConfigMaps are embedded as JSON strings and mounted into containers
- Apps use `serviceDNS('otelCollector', { protocol: 'http', port: 4318 })` for OTLP


