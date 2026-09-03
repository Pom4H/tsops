# Getting started

This guide creates one application graph for local development and Kubernetes delivery.

## Requirements

- Node.js 24 or newer
- a project with at least one package-level `dev` script
- Portless for `tsops dev`
- Docker for image builds
- `kubectl` with a configured context for plan and deploy

Portless, Docker, and `kubectl` are only required for the commands that use them.

## Install

```bash
pnpm add -D tsops portless
```

The tsops repository uses pnpm, but local application commands may use Bun, pnpm, Yarn, or npm. `tsops dev` detects the nearest lockfile for each application.

## Create the application graph

Add `tsops.config.ts` at the repository root:

```ts
import { defineConfig } from 'tsops'

const config = defineConfig({
  project: 'orchard',

  namespaces: {
    local: {
      runtime: 'local',
      domain: 'orchard.localhost'
    },
    production: {
      runtime: 'kubernetes',
      domain: 'orchard.example.com'
    }
  },

  clusters: {
    production: {
      apiServer: 'https://kubernetes.example.com:6443',
      context: 'production',
      namespaces: ['production']
    }
  },

  images: {
    registry: 'ghcr.io/acme/orchard',
    tagStrategy: 'git-sha'
  },

  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: 'apps/api',
        dockerfile: 'apps/api/Dockerfile',
        inputs: ['apps/api/**', 'packages/shared/**', 'pnpm-lock.yaml'],
        sourceKey: true,
        cache: { type: 'registry', mode: 'max' }
      },
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },

    web: {
      build: {
        type: 'dockerfile',
        context: 'apps/web',
        dockerfile: 'apps/web/Dockerfile'
      },
      needs: ['api'],
      ingress: ({ domain }) => ({ domain }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    }
  }
})

export default config
```

Each build context should contain a `package.json` with a `dev` script. For unusual layouts, declare the command explicitly:

```ts
apps: {
  worker: {
    dev: ['bun', 'run', 'worker'],
    // ...image or build configuration
  }
}
```

## Use the graph from application code

Import the config from TypeScript application code and ask for a semantic endpoint:

```ts
import config from '../../tsops.config.js'

const apiUrl = config.url('api', 'service')
const response = await fetch(`${apiUrl}/health`)
```

Under `tsops dev`, the helper consumes `TSOPS_DEV_URLS` and returns the Portless URL. In Kubernetes it returns the Service URL for the selected namespace. Application code does not need separate local and cluster host-name constants.

## Run locally

```bash
pnpm tsops dev
```

Because the config contains exactly one namespace with `runtime: 'local'`, tsops selects it automatically. It discovers each package's `dev` script and prints stable routes such as:

```text
https://api.orchard.localhost
https://web.orchard.localhost
```

Use a subset when needed:

```bash
pnpm tsops dev --app api
```

See [Local development](/guide/local-development) for explicit commands, worktree behavior, and URL discovery.

## Review a cluster rollout

Start without external side effects:

```bash
pnpm tsops plan --namespace production --dry-run
```

Then run a real cluster diff:

```bash
pnpm tsops plan --namespace production
```

The plan groups namespace-level resources, application resources, validation failures, and managed orphans. Treat this output as the required review step before deploy.

## Build images

Authenticate to the configured registry, then run:

```bash
pnpm tsops build --namespace production --source-key
```

`--source-key` hashes selected source files and build metadata. If the resulting image already exists, tsops skips the Docker build and resolves its immutable digest. Registry-backed BuildKit cache remains available for builds that are not exact matches.

For a monorepo diff, combine it with filtering:

```bash
pnpm tsops build --namespace production --filter origin/main --source-key
```

## Deploy

```bash
pnpm tsops deploy --namespace production
```

CI can separate build and deploy by writing digest references to a JSON file:

```json
{
  "api": "ghcr.io/acme/orchard/api@sha256:abcd...",
  "web": "ghcr.io/acme/orchard/web@sha256:ef01..."
}
```

```bash
pnpm tsops deploy --namespace production --image-digests @images.json
```

Mutable tags and unknown application names are rejected before resources are applied.

## Add pull-request previews

A preview is an overlay namespace that inherits from a stable base namespace. It can deploy only affected applications while routing the rest back to the base through generated `ExternalName` Services.

```bash
pnpm tsops up preview --var pr=42 --apps-from-changes --base-ref origin/main
pnpm tsops down preview --var pr=42
```

Continue with the [Preview environments contract](/guide/preview-overlays) and the runnable [`examples/preview-namespaces`](https://github.com/Pom4H/tsops/tree/main/examples/preview-namespaces) configuration.

## Get help

- [Documentation home](/)
- [How tsops compares](/guide/comparison)
- [GitHub Discussions](https://github.com/Pom4H/tsops/discussions)
- [Report an issue](https://github.com/Pom4H/tsops/issues/new)
