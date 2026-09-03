# API reference

The `tsops` package is both the CLI and the recommended public TypeScript entry point.

```ts
import {
  defineConfig,
  defineDockerfileBuild,
  buildGraph,
  topoSort,
  validateDependencies,
  normalizePort,
  normalizePorts
} from 'tsops'
```

Most projects only need `defineConfig` and the returned runtime helpers.

## `defineConfig(config)`

Preserves literal project, namespace, application, Secret, and ConfigMap keys while attaching runtime helpers to the configuration.

```ts
import { defineConfig } from 'tsops'

const config = defineConfig({
  project: 'orchard',
  namespaces: {
    local: { runtime: 'local', domain: 'orchard.localhost' },
    production: { runtime: 'kubernetes', domain: 'orchard.example.com' }
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
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    }
  }
})

export default config
```

### Top-level fields

| Field | Purpose |
| --- | --- |
| `project` | Stable project identifier used in deterministic names and local routes |
| `namespaces` | Static runtime environments and parameterized overlay templates |
| `clusters` | Mapping from namespaces to `kubectl` contexts and API servers |
| `images` | Registry, repository layout, and tag strategy |
| `apps` | Application builds, ports, dependencies, env, routes, and deploy selection |
| `secrets` | Named Secret definitions or namespace-aware resolver functions |
| `configMaps` | Named ConfigMap definitions or namespace-aware resolver functions |
| `validation` | Optional validation policy, currently including sensitive-env scanning |

## Namespace runtimes

```ts
runtime: 'local' | 'docker' | 'kubernetes'
```

`kubernetes` is the default. The selected runtime changes endpoint resolution, not application identity.

A static namespace may contain arbitrary product variables as long as reserved helper names are avoided. Static namespaces in one config should keep the same variable shape.

```ts
namespaces: {
  staging: {
    runtime: 'kubernetes',
    domain: 'staging.example.com',
    replicas: 1
  },
  production: {
    runtime: 'kubernetes',
    domain: 'example.com',
    replicas: 3
  }
}
```

## Overlay namespace

An overlay is resolved from runtime variables by `tsops up` and `tsops down`:

```ts
preview: {
  extends: 'staging',
  naming: ({ pr }) => `pr-${pr}`,
  domain: ({ pr }) => `pr-${pr}.staging.example.com`,
  fallback: 'staging'
}
```

Core fields:

| Field | Purpose |
| --- | --- |
| `extends` | Base static namespace whose variables are inherited |
| `naming(vars)` | Kubernetes namespace name |
| `domain(vars)` | External domain for the resolved overlay |
| `fallback` | Namespace used by generated fallback Services |
| `cert` | Wildcard Secret reuse or custom certificate Job |
| `access` | Optional fail-closed Traefik BasicAuth gate |
| `appSecrets` | Explicit Secrets copied for included applications |
| `namespacePolicy` | ResourceQuota and LimitRange settings |
| `database` | Optional schema-per-overlay lifecycle |
| `validateVars` | Pre-side-effect variable policy |

See [Preview environments](/guide/preview-overlays) for the complete contract.

## Application definition

```ts
apps: {
  api: {
    image: 'ghcr.io/acme/api@sha256:...',
    build: {
      type: 'dockerfile',
      context: 'apps/api',
      dockerfile: 'apps/api/Dockerfile'
    },
    dev: ['bun', 'run', 'dev'],
    needs: ['database-proxy'],
    env: ({ url, secretKey }) => ({
      UI_URL: url('web', 'service'),
      DATABASE_URL: secretKey('database', 'DATABASE_URL')
    }),
    ports: [{ name: 'http', port: 80, targetPort: 3000 }],
    ingress: ({ domain }) => ({ domain: `api.${domain}` }),
    deploy: ['staging', 'production']
  }
}
```

Frequently used fields:

| Field | Purpose |
| --- | --- |
| `image` | Explicit image when tsops does not build it |
| `build` | Dockerfile build context and reproducibility settings |
| `dev` | Local command, package script, command object, or `false` |
| `needs` | Typed application dependency edges and deploy order |
| `env` | One source or an ordered array of static/resolved env sources |
| `ports` | Service, target, and optional local ports |
| `ingress` | Public domain and optional protocol |
| `deploy` | Namespace inclusion or exclusion policy |
| `volumes`, `volumeMounts`, `args`, `podAnnotations` | Workload-specific Kubernetes settings |

`AppDefinition` is open to additional fields for adapters, but unknown data has no effect unless an operation explicitly consumes it.

## Dockerfile builds

```ts
build: {
  type: 'dockerfile',
  context: 'apps/api',
  dockerfile: 'apps/api/Dockerfile',
  inputs: ['apps/api/**', 'packages/shared/**', 'pnpm-lock.yaml'],
  sourceKey: { mode: 'inputs', inputs: ['apps/api/**', 'packages/shared/**'] },
  cache: {
    type: 'registry',
    ref: 'ghcr.io/acme/api:buildcache',
    mode: 'max'
  },
  target: 'production',
  platform: 'linux/amd64',
  args: { NODE_ENV: 'production' }
}
```

`sourceKey` may be:

- `true` or `{ mode: 'context' }` for a context-derived key;
- a string;
- a resolver function;
- `{ mode: 'inputs', inputs: [...] }`;
- `{ mode: 'custom', value: ... }`.

`build.inputs` also defines affected-application matching for `tsops build --filter`.

## Ports

```ts
ports: [
  {
    name: 'http',
    port: 80,
    targetPort: 3000,
    localPort: 4300,
    protocol: 'TCP'
  }
]
```

- `port` is the Kubernetes Service port.
- `targetPort` is the container or process-facing port.
- `localPort` is an optional localhost fallback outside the Portless URL map.

The public `normalizePort`, `normalizePorts`, and `pickPort` helpers expose the same normalization rules used internally.

## Context helpers

Application callbacks receive namespace variables plus the helpers below. Literal application and resource names are inferred from the config.

### `url(app, type, options?)`

```ts
url('api', 'service')
url('api', 'cluster')
url('api', 'ingress')
url('metrics', 'service', { port: 'prometheus' })
```

Returns a reachable URL for the active namespace runtime.

### `dns(app, type, options?)`

Returns a host name without a scheme by default. Options can add protocol, port, headless-pod selection, external handling, or a custom cluster domain.

### Port helpers

```ts
servicePort('api')
targetPort('api')
listenPort('api')
```

Select a named port by passing the port name where supported.

### Resource helpers

```ts
secret('database')
secretKey('database', 'DATABASE_URL')
configMap('api-settings')
configMapKey('api-settings', 'LOG_LEVEL')
resource('secret', 'database')
serviceName('api')
```

Whole-Secret and whole-ConfigMap references become `envFrom`; key references become Kubernetes `valueFrom` bindings.

### Utilities

```ts
env('LOG_LEVEL', 'info')
template('https://{host}/api', { host: 'example.com' })
```

Read the [Context helpers guide](/guide/context-helpers) for examples and behavior details.

## Environment composition

`env` accepts one source or an array merged from left to right:

```ts
env: [
  { LOG_LEVEL: 'info' },
  ({ configMap }) => configMap('shared-runtime'),
  ({ secret }) => secret('database'),
  ({ namespace }) => ({ NAMESPACE: namespace })
]
```

Later explicit keys override earlier keys. Whole resource references remain separate `envFrom` entries.

## Sensitive-env validation

```ts
validation: {
  sensitiveEnv: {
    mode: 'error',
    scanBuildEnv: true,
    scanRuntimeEnv: true,
    allowKeys: ['PUBLIC_API_KEY'],
    allowPrefixes: ['NEXT_PUBLIC_']
  }
}
```

Build-time environment values are especially important because they can become part of image layers.

## Runtime helpers

The object returned by `defineConfig` may be imported by application code:

```ts
import config from '../../tsops.config.js'

process.env.API_URL = config.url('api', 'service')
```

Resolution uses `TSOPS_NAMESPACE`. Under `tsops dev`, `TSOPS_DEV_URLS` supplies the Portless routes generated for the complete local graph.

## Graph utilities

Advanced integrations can import:

```ts
buildGraph(...)
validateDependencies(...)
topoSort(...)
```

These functions expose dependency validation and deterministic ordering without requiring CLI output parsing.

## Programmatic operations

Use `@tsops/node` when an integration needs the configured planner, builder, or deployer with standard Node.js adapters:

```ts
import config from './tsops.config.js'
import { createNodeTsOps } from '@tsops/node'

const tsops = createNodeTsOps(config)
const plan = await tsops.planWithChanges({ namespace: 'production' })
```

Use `@tsops/core` directly when supplying custom Docker, Kubernetes, command, environment, or logging ports.

## CLI

```text
tsops dev
tsops plan
tsops build
tsops deploy
tsops up <overlay>
tsops down <overlay>
```

Run `tsops <command> --help` for the authoritative option list. The [Getting-started guide](/guide/getting-started) demonstrates the supported delivery flow.
