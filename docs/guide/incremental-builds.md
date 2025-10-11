# Incremental Builds and Deploys

tsops supports incremental builds and deployments based on git changes, allowing you to build and deploy only the applications affected by your code changes. This significantly speeds up CI/CD pipelines in monorepos.

## Overview

The `--git` flag allows you to compare your current working directory against a git reference and automatically determine which apps need to be rebuilt or redeployed based on changed files.

## Usage

### Build Only Changed Apps

```bash
# Build apps changed since last commit
tsops build --git HEAD^1

# Build apps changed compared to main branch
tsops build --git main

# Build apps changed compared to origin/main
tsops build --git origin/main
```

### Deploy Only Changed Apps

```bash
# Deploy apps changed since last commit
tsops deploy --git HEAD^1

# Deploy apps changed compared to main branch
tsops deploy --git main

# Deploy apps changed in staging compared to production
tsops deploy --git production --namespace staging
```

## How It Works

### App Detection

tsops determines which apps are affected by comparing the changed files against each app's `build.context` directory:

```typescript
const config = defineConfig({
  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: 'packages/api',  // ← Files in this directory trigger api rebuild
        dockerfile: 'packages/api/Dockerfile'
      }
    },
    web: {
      build: {
        type: 'dockerfile',
        context: 'packages/web',  // ← Files in this directory trigger web rebuild
        dockerfile: 'packages/web/Dockerfile'
      }
    }
  }
})
```

**Example:**
- If files changed: `packages/api/src/index.ts`, `packages/api/Dockerfile`
- Then only `api` app will be built/deployed
- `web` app is skipped (no changes detected)

### Git Reference Support

The `--git` flag accepts any valid git reference:

| Reference | Description |
|-----------|-------------|
| `HEAD^1` | Compare to previous commit |
| `HEAD~3` | Compare to 3 commits ago |
| `main` | Compare to local main branch |
| `origin/main` | Compare to remote main branch |
| `v1.2.3` | Compare to a specific tag |
| `abc123` | Compare to a specific commit |

### Dirty State Detection

When using `git-sha` or `git-tag` image tagging strategies, tsops automatically appends `-dirty` suffix if your working directory has uncommitted changes:

```typescript
const config = defineConfig({
  images: {
    registry: 'ghcr.io/acme',
    tagStrategy: 'git-sha'  // or 'git-tag'
  }
})
```

**Examples:**
- Clean working directory: `ghcr.io/acme/api:abc123def456`
- Dirty working directory: `ghcr.io/acme/api:abc123def456-dirty`
- Tagged release (dirty): `ghcr.io/acme/api:v1.2.3-dirty`

This helps you identify when images were built from uncommitted changes.

## Combining with Other Filters

The `--git` flag works alongside other filtering options:

### Filter by Namespace

```bash
# Build changed apps in production namespace only
tsops build --git main --namespace prod

# Deploy changed apps to staging
tsops deploy --git main --namespace staging
```

### Filter by App (App Takes Precedence)

```bash
# Deploy specific app (ignores git changes)
tsops deploy --git main --app api
```

When both `--app` and `--git` are specified, the explicit `--app` filter takes precedence.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Incremental Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Important: fetch full history for git comparisons

      - name: Build changed apps
        run: |
          # Build only apps changed in this push
          pnpm tsops build --git origin/main

      - name: Deploy changed apps
        run: |
          # Deploy only apps that were changed
          pnpm tsops deploy --git origin/main --namespace prod
```

### GitLab CI Example

```yaml
deploy:
  stage: deploy
  script:
    - git fetch origin main
    - |
      # Build and deploy only changed apps compared to main
      pnpm tsops build --git origin/main
      pnpm tsops deploy --git origin/main --namespace prod
  only:
    - main
```

### Turborepo Integration

If you're using Turborepo, combine it with tsops for maximum efficiency:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    }
  }
}
```

```bash
# 1. Build changed packages with Turborepo
turbo run build --filter='...[origin/main]'

# 2. Build Docker images for affected apps with tsops
pnpm tsops build --git origin/main

# 3. Deploy affected apps
pnpm tsops deploy --git origin/main
```

## Benefits

### CI/CD Performance

**Before (build all apps):**
```bash
$ tsops build
Building 5 apps... ⏱️ 15 minutes
```

**After (incremental build):**
```bash
$ tsops build --git main
Detected 3 changed files
Building 1 affected app... ⏱️ 3 minutes
```

### Reduced Resource Usage

- **Faster pipelines:** Only build and deploy what changed
- **Lower costs:** Fewer CPU minutes, less registry storage
- **Quicker rollbacks:** Deploy single app instead of entire system

## Troubleshooting

### No Changes Detected

If you see "No changes detected" but expect changes:

```bash
# Check what git sees as changed
git diff --name-only origin/main

# Verify app build contexts match changed files
cat tsops.config.ts | grep context
```

### All Apps Building Despite --git Flag

Ensure your build contexts are specific to each app:

```typescript
// ❌ Bad: All apps use root context
apps: {
  api: { build: { context: '.' } },
  web: { build: { context: '.' } }
}

// ✅ Good: Each app has specific context
apps: {
  api: { build: { context: 'apps/api' } },
  web: { build: { context: 'apps/web' } }
}
```

### Git Ref Not Found

```bash
# Ensure ref exists
git rev-parse origin/main

# Fetch latest refs in CI
git fetch origin main
```

## See Also

- [Configuration Guide](/guide/getting-started)
- [CI/CD Examples](/examples/ci-cd/)
- [Monorepo Setup](/examples/monorepo)
