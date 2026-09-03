---
title: Full-stack example
---

# Full-stack example

[`examples/fullstack`](https://github.com/Pom4H/tsops/tree/main/examples/fullstack) contains a Hono backend, a Next.js frontend, Dockerfiles, Service ports, and ingress configuration.

## Inspect the graph

```bash
pnpm tsops plan \
  --config examples/fullstack/tsops.config.ts \
  --dry-run
```

Remove `--dry-run` only after the configured Kubernetes context and namespace are appropriate for your machine.

## What to inspect

- Each application has its own build context.
- Service and target ports are distinct.
- The frontend and backend share one namespace model.
- The same application keys can be used by `config.url()` from runtime code.
- Ingress is derived from namespace domain data rather than copied into a separate values file.

For a production project, add a `runtime: 'local'` namespace and install Portless to run the package-level `dev` scripts through `tsops dev`.
