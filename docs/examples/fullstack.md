---
title: Full-Stack Example
---

## Full-Stack Example

This example deploys a simple frontend (Next.js) and backend (Hono) with Kubernetes Services and Ingress.

- Project files live in `examples/fullstack/`
- Config is defined in `examples/fullstack/tsops.config.ts`

### How to run

```bash
pnpm install
pnpm tsops plan --config examples/fullstack/tsops.config.ts
```

### Config Highlights

- frontend exposes HTTP on port 80 (container 3000)
- backend exposes HTTP on port 8080 and is reachable from frontend via serviceDNS
- uses `network` to set external host for the frontend


