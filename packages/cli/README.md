# tsops

TypeScript-first toolkit for planning, building, and deploying to Kubernetes.

## Installation

```bash
npm install -D tsops
# or
pnpm add -D tsops
# or
yarn add -D tsops
```

Or install globally:

```bash
npm install -g tsops
# or
pnpm add -g tsops
```

## Usage

```bash
tsops <command> [options]
```

### Commands

#### `plan`

Resolves the configuration into a deployment plan and prints the results.

```bash
tsops plan
tsops plan --namespace prod
tsops plan --app api
tsops plan --namespace prod --app api
```

**Output example:**
```
- api @ prod (us) -> ghcr.io/org/api:abc123, host=api.example.com
- frontend @ prod (us) -> ghcr.io/org/frontend:abc123
```

#### `build`

Builds and pushes Docker images for configured apps.

```bash
tsops build
tsops build --app api
tsops build --app api --namespace prod  # Determines dev/prod platform
```

**Incremental builds (monorepo optimization):**

```bash
# Build only apps affected by changes since last commit
tsops build --filter HEAD^1

# Build only apps affected by changes compared to main branch
tsops build --filter main

# Build only apps affected by changes compared to origin/main
tsops build --filter origin/main

# Force rebuild even if image exists in registry
tsops build --force
```

The `--filter` flag compares changed files against the specified git reference and builds only applications whose `build.context` directory contains changed files. This is especially useful in CI/CD pipelines for monorepo projects where you want to build only what changed.

**Output example:**
```
📊 Detected 3 changed file(s) compared to HEAD^1
Building 1 affected app(s): api

✅ Built images:
   • api: ghcr.io/org/api:abc123
```

#### `deploy`

Generates Kubernetes manifests and applies them using `kubectl`.

```bash
tsops deploy
tsops deploy --namespace prod
tsops deploy --app api
tsops deploy --namespace prod --app api
```

**Output example:**
```
- api @ prod
  • Deployment/api
  • Service/api
  • Ingress/api
  • Certificate/api-tls
```

### Options

All commands support:

- **`-n, --namespace <name>`** – Target a single namespace
- **`--app <name>`** – Target a single app
- **`-c, --config <path>`** – Path to config file (default: `tsops.config`)
- **`--dry-run`** – Log actions without executing external commands

Build-specific options:

- **`--filter <ref>`** – Build only apps affected by changes compared to git ref (e.g., `HEAD^1`, `main`, `origin/main`)
- **`-f, --force`** – Force rebuild even if image already exists in registry

### Help

```bash
tsops --help
tsops plan --help
tsops build --help
tsops deploy --help
```

## Configuration Files

The CLI looks for configuration files in this order:

1. Specified path via `--config`
2. `tsops.config` (tries `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` extensions)

### TypeScript Configs

For TypeScript configs, you need a runtime that can execute them:

```bash
# Using tsx
pnpm tsx node_modules/.bin/tsops plan --config tsops.config.ts

# Or if you have tsx globally
tsops plan  # Will work with tsops.config.ts
```

Alternatively, compile your config to JavaScript first:

```bash
tsc tsops.config.ts
tsops plan --config tsops.config.js
```

## Environment Variables

Some tag strategies require environment variables:

- **`GIT_SHA`** – Used by `tagStrategy: 'git-sha'`
- **`GIT_TAG`** – Used by `tagStrategy: 'git-tag'`

Example:

```bash
export GIT_SHA=$(git rev-parse HEAD)
tsops build --app api
```

## Examples

### Full Workflow

```bash
# 1. Plan what will be deployed
tsops plan --namespace prod

# 2. Build images for production
export GIT_SHA=$(git rev-parse HEAD)
tsops build

# 3. Deploy to production
tsops deploy --namespace prod

# 4. Deploy only API to staging (with dry-run)
tsops deploy --namespace staging --app api --dry-run
```

### CI/CD Integration

**Basic workflow:**

```yaml
# .github/workflows/deploy.yml
- name: Deploy to production
  env:
    GIT_SHA: ${{ github.sha }}
  run: |
    pnpm tsops build --app api
    pnpm tsops deploy --namespace prod --app api
```

**Optimized monorepo workflow (build only changed apps):**

```yaml
# .github/workflows/build-changed.yml
name: Build Changed Apps

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for git diff
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build changed apps
        env:
          GIT_SHA: ${{ github.sha }}
          DOCKER_REGISTRY: ghcr.io/${{ github.repository_owner }}
          DOCKER_USERNAME: ${{ github.actor }}
          DOCKER_PASSWORD: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Build only apps affected by changes in this PR/commit
          pnpm tsops build --filter ${{ github.event.pull_request.base.sha || 'HEAD^1' }}
      
      - name: Deploy changed apps
        if: github.ref == 'refs/heads/main'
        run: |
          pnpm tsops deploy --namespace prod
```

**Using with Turborepo (recommended for monorepos):**

```json
// turbo.json
{
  "tasks": {
    "tsops:build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "Dockerfile", "$DOCKER_REGISTRY"],
      "cache": false  // Docker builds have side effects
    }
  }
}
```

```bash
# In CI: Build only packages/apps affected by changes
turbo run build --filter=[HEAD^1]

# Then build Docker images for changed apps
pnpm tsops build --filter HEAD^1
```

## Configuration Example

```typescript
// tsops.config.ts
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'myapp',
  
  namespaces: {
    dev: {
      domain: 'dev.myapp.com',
      replicas: 1
    },
    prod: {
      domain: 'myapp.com',
      replicas: 3
    }
  },
  
  clusters: {
    'us-cluster': {
      apiServer: 'https://k8s.us.example.com',
      context: 'us-k8s',
      namespaces: ['dev', 'prod']
    }
  },
  
  images: {
    registry: 'ghcr.io/myorg',
    tagStrategy: 'git-sha'
  },
  
  apps: {
    api: {
      host: ({ domain }) => `api.${domain}`,
      build: {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile'
      },
      env: ({ replicas }) => ({
        NODE_ENV: replicas > 1 ? 'production' : 'development',
        REPLICAS: String(replicas)
      }),
      network: {
        ingress: {
          className: 'nginx'
        },
        certificate: {
          issuerRef: {
            kind: 'ClusterIssuer',
            name: 'letsencrypt-prod'
          }
        }
      }
    }
  }
})
```

## Related Packages

- **@tsops/core** – Core library with programmatic API
- **@tsops/k8** – Kubernetes manifest builders

## Development

```bash
pnpm build       # Compile TypeScript
```

The CLI binary is defined in `package.json`:

```json
{
  "bin": {
    "tsops": "./dist/index.js"
  }
}
```

