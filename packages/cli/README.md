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

**Output example:**
```
- built api: ghcr.io/org/api:abc123
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

```yaml
# .github/workflows/deploy.yml
- name: Deploy to production
  env:
    GIT_SHA: ${{ github.sha }}
  run: |
    pnpm tsops build --app api
    pnpm tsops deploy --namespace prod --app api
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

