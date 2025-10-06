---
title: Monorepo Example
---

## Monorepo Example

This example deploys two apps from a monorepo with shared tooling.

- Project files live in `examples/monorepo/`
- Config is defined in `examples/monorepo/tsops.config.ts`

### How to run

```bash
pnpm install
pnpm tsops plan --config examples/monorepo/tsops.config.ts
```

### Config Highlights

- Uses `image` or Dockerfile `build` as needed
- Secrets managed via root-level `secrets` and referenced with `secret()`
- Uses `serviceDNS` between backend and frontend


