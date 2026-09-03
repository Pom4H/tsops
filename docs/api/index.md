# API reference

The `tsops` package is both the CLI and the recommended public TypeScript entry point.

```ts
import {
  defineConfig,
  defineDockerfileBuild,
  buildGraph,
  validateDependencies,
  topoSort,
  normalizePort,
  normalizePorts,
  pickPort
} from 'tsops'
```

Most projects only need `defineConfig` and the runtime helpers attached to its return value.

## `defineConfig(config)`

`defineConfig` preserves literal project, namespace, application, Secret, and ConfigMap keys while attaching runtime methods that use `TSOPS_NAMESPACE`.

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

  secrets: {
    database: {
      DATABASE_URL: process.env.DATABASE_URL ?? ''
    }
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
| `project` | Stable project identity used in deterministic names and local routes |
| `namespaces` | Static runtime environments and parameterized overlay templates |
| `clusters` | Kubernetes API servers, contexts, and the namespaces they own |
| `images` | Registry, repository layout, and tag strategy |
| `apps` | Application builds, local commands, dependencies, ports, env, and routes |
| `secrets` | Named Secret data or namespace-aware resolver functions |
| `configMaps` | Named ConfigMap data or namespace-aware resolver functions |
| `validation` | Optional safety policy, including sensitive environment scanning |

## Namespace runtimes

```ts
runtime: 'local' | 'docker' | 'kubernetes'
```

`kubernetes` is the default. The selected runtime changes how endpoints resolve, not the application keys used to request them.

A static namespace may contain custom product variables. All static namespaces in one config should keep a compatible variable shape, and custom fields cannot collide with reserved context-helper names.

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

## Overlay namespaces

An overlay is materialized from runtime variables by `tsops up` and resolved again by `tsops down`:

```ts
preview: {
  extends: 'staging',
  naming: ({ pr }) => `pr-${pr}`,
  domain: ({ pr }) => `pr-${pr}.staging.example.com`,
  fallback: 'staging'
}
```

| Field | Purpose |
| --- | --- |
| `extends` | Base static namespace whose variables are inherited |
| `naming(vars)` | Resolved Kubernetes namespace name |
| `domain(vars)` | Resolved public domain |
| `fallback` | Namespace used by fallback Services for excluded applications |
| `cert` | Wildcard Secret reuse or a custom certificate Job |
| `access` | Optional fail-closed Traefik BasicAuth gate |
| `appSecrets` | Explicit Secrets copied for included applications |
| `namespacePolicy` | ResourceQuota and LimitRange settings |
| `database` | Optional schema-per-overlay lifecycle |
| `validateVars` | Variable validation that runs before side effects |

See [Preview environments](/guide/preview-overlays) for the full lifecycle contract.

## Application definitions

```ts
apps: {
  api: {
    build: {
      type: 'dockerfile',
      context: 'apps/api',
      dockerfile: 'apps/api/Dockerfile'
    },
    dev: ['bun', 'run', 'dev'],
    needs: ['database-proxy'],
    env: ({ url, secret }) => ({
      UI_URL: url('web', 'service'),
      DATABASE_URL: secret('database', 'DATABASE_URL')
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
| `build` | Dockerfile context and reproducibility settings |
| `dev` | Local command, package script, command object, or `false` |
| `needs` | Typed application dependency edges and deployment order |
| `env` | One source or an ordered array of static and resolved env sources |
| `ports` | Service, target, and optional localhost fallback ports |
| `ingress` | Public domain and optional protocol |
| `deploy` | Namespace inclusion or exclusion policy |
| `volumes`, `volumeMounts`, `args`, `podAnnotations` | Workload-specific Kubernetes settings |

`AppDefinition` accepts additional adapter data, but unknown fields do nothing until an operation explicitly consumes them.

## Dockerfile builds

```ts
build: {
  type: 'dockerfile',
  context: 'apps/api',
  dockerfile: 'apps/api/Dockerfile',
  inputs: ['apps/api/**', 'packages/shared/**', 'pnpm-lock.yaml'],
  sourceKey: {
    mode: 'inputs',
    inputs: ['apps/api/**', 'packages/shared/**', 'pnpm-lock.yaml']
  },
  cache: {
    type: 'registry',
    ref: 'ghcr.io/acme/orchard/api:buildcache',
    mode: 'max'
  },
  target: 'production',
  platform: 'linux/amd64',
  args: { NODE_ENV: 'production' }
}
```

`sourceKey` accepts:

- `true` or `{ mode: 'context' }`;
- a fixed string;
- a resolver function;
- `{ mode: 'inputs', inputs: [...] }`;
- `{ mode: 'custom', value: ... }`.

`build.inputs` also drives affected-application matching for `tsops build --filter`.

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
- `targetPort` is the container or local process port.
- `localPort` is an optional localhost fallback outside the Portless URL map.

The package exports `normalizePort`, `normalizePorts`, and `pickPort` with the same normalization rules used internally.

## Application callback context

Application callbacks receive namespace variables plus metadata and helper functions.

### Metadata

```ts
project
namespace
appName
cluster
```

### Endpoints

```ts
url('api', 'service')
url('api', 'cluster')
url('api', 'ingress')
url('metrics', 'service', { port: 'prometheus' })

dns('api', 'service')
dns('api', 'cluster')
dns('api', 'ingress')

servicePort('api')
targetPort('api')
listenPort('api')
```

`url` accepts optional `{ protocol, port }`. `dns` accepts only the application and endpoint type.

### Secrets and ConfigMaps

```ts
secret('database')
secret('database', 'DATABASE_URL')

configMap('api-settings')
configMap('api-settings', 'LOG_LEVEL')
```

A whole-resource reference becomes `envFrom`. A keyed reference becomes a Kubernetes `valueFrom` binding. Names and keys are inferred from declared resources where possible.

### Names and utilities

```ts
label('component', 'backend')
resource('secret', 'database')
env('LOG_LEVEL', 'info')
template('https://{host}/api', { host: 'example.com' })
```

Read [Context helpers](/guide/context-helpers) for usage patterns.

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

Later explicit keys override earlier keys. Whole Secret and ConfigMap references remain separate `envFrom` entries.

## Sensitive-environment validation

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

Build-time values deserve particular scrutiny because they can be persisted in image layers.

## Runtime config methods

The value returned by `defineConfig` may be imported by application code:

```ts
import config from '../../tsops.config.js'

const apiUrl = config.url('api', 'service')
const apiHost = config.dns('api', 'service')
const apiPort = config.targetPort('api')
const nodeEnv = config.env('api', 'NODE_ENV')
```

Available methods are:

```ts
config.env(app, key)
config.dns(app, type)
config.url(app, type, options?)
config.port(app, portName?)
config.servicePort(app, portName?)
config.targetPort(app, portName?)
config.listenPort(app, portName?)
```

`TSOPS_NAMESPACE` selects the active namespace. Under `tsops dev`, `TSOPS_DEV_URLS` supplies the Portless route map used by service URL resolution.

## Graph utilities

Advanced integrations can import:

```ts
buildGraph(...)
validateDependencies(...)
topoSort(...)
```

These expose dependency validation and deterministic ordering without parsing CLI output.

## Programmatic operations

Use `@tsops/node` for the configured planner, builder, and deployer with standard Node.js adapters:

```ts
import config from './tsops.config.js'
import { createNodeTsOps } from '@tsops/node'

const tsops = createNodeTsOps(config)
const plan = await tsops.planWithChanges({ namespace: 'production' })
```

Use `@tsops/core` directly only when supplying custom Docker, Kubernetes, command, environment, or logging ports.

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
