---
title: Monorepo Example
---

## Monorepo Example

This example deploys two apps from a monorepo with shared tooling and demonstrates incremental build optimizations.

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
- Uses `dns` between backend and frontend

## Incremental Builds for Monorepo

When working with monorepos, you typically have multiple applications in separate directories. Building all apps on every change is wasteful. Use the `--filter` flag to build only affected apps.

### Automatic detection based on git changes

The `--filter` flag compares files changed since a git reference and builds only apps whose `build.context` contains changed files:

```bash
# Build only apps with changes since last commit
pnpm tsops build --filter HEAD^1

# Build only apps with changes compared to main branch
pnpm tsops build --filter main

# Build only apps with changes compared to remote main
pnpm tsops build --filter origin/main
```

### How it works

Given a monorepo structure:

```
monorepo/
├── apps/
│   ├── backend/         # build.context: 'apps/backend'
│   │   ├── src/
│   │   └── Dockerfile
│   └── frontend/        # build.context: 'apps/frontend'
│       ├── app/
│       └── Dockerfile
└── tsops.config.ts
```

If you change `apps/backend/src/index.ts`:

```bash
$ pnpm tsops build --filter HEAD^1

📊 Detected 1 changed file(s) compared to HEAD^1
Building 1 affected app(s): backend

✅ Built images:
   • backend: ghcr.io/acme/monorepo-backend:abc123
```

Only `backend` is built because `apps/backend/src/index.ts` matches `build.context: 'apps/backend'`.

### CI/CD integration

**GitHub Actions example:**

```yaml
name: Build and Deploy Changed Apps

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-changed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for git diff
      
      - uses: pnpm/action-setup@v2
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      
      - name: Build only changed apps
        env:
          GIT_SHA: ${{ github.sha }}
          DOCKER_REGISTRY: ghcr.io/${{ github.repository_owner }}
        run: |
          # For PRs: compare against base branch
          # For pushes: compare against previous commit
          BASE_REF="${{ github.event.pull_request.base.sha || 'HEAD^1' }}"
          pnpm tsops build --filter $BASE_REF
      
      - name: Deploy changed apps
        if: github.ref == 'refs/heads/main'
        run: pnpm tsops deploy --namespace prod
```

### Combining with Turborepo

For even better monorepo optimization, combine tsops with Turborepo:

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "tsops:build": {
      "dependsOn": ["build"],
      "inputs": ["src/**", "Dockerfile", "$DOCKER_REGISTRY"],
      "cache": false  // Docker builds have side effects
    }
  }
}
```

```bash
# Build TypeScript packages that changed
turbo run build --filter=[HEAD^1]

# Build Docker images for changed apps
pnpm tsops build --filter HEAD^1

# Or use Turborepo to orchestrate both
turbo run tsops:build --filter=[HEAD^1]
```

### Benefits

- **Faster CI/CD:** Only build what changed (10x-50x speedup for large monorepos)
- **Lower costs:** Fewer Docker builds = less compute time
- **Better DX:** Local iteration without rebuilding unchanged apps
- **Predictable:** Deterministic based on file paths

### Tips

1. **Structure your monorepo:** Keep each app's files within its `build.context` directory
2. **Shared code:** Changes to shared packages may require rebuilding multiple apps
3. **Config changes:** Changes to `tsops.config.ts` don't trigger rebuilds automatically—use `--force` if needed
4. **Cache images:** Docker's layer caching still applies, making rebuilds even faster


