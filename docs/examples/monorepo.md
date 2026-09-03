---
title: Monorepo example
---

# Monorepo example

[`examples/monorepo`](https://github.com/Pom4H/tsops/tree/main/examples/monorepo) shows multiple application build contexts inside one repository.

## Inspect the graph

```bash
pnpm tsops plan \
  --config examples/monorepo/tsops.config.ts \
  --dry-run
```

## Inspect affected builds

```bash
pnpm tsops build \
  --config examples/monorepo/tsops.config.ts \
  --filter origin/main \
  --source-key \
  --dry-run
```

## What to inspect

- Each application owns an explicit build context.
- `build.inputs` can include shared packages and lockfiles.
- Git-diff filtering selects affected applications without maintaining a second CI matrix.
- Source-key reuse skips an exact image build when selected inputs and build metadata are unchanged.
- BuildKit registry cache accelerates builds that still need to run.
- Root-level Secrets and ConfigMaps can be referenced through typed helpers.

Turborepo and tsops are complementary: Turborepo caches package tasks, while tsops decides which containerized applications need image and deployment work.
