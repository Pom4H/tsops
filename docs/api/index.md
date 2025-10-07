# API Reference

Complete API documentation for tsops.

## Core

### defineConfig()

Define your tsops configuration with full type safety and runtime helpers.

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'demo',

  namespaces: {
    dev: { domain: 'dev.example.com', production: false, replicas: 1 },
    prod: { domain: 'example.com', production: true, replicas: 3 }
  },

  clusters: {
    prod: {
      apiServer: 'https://prod.local:6443',
      context: 'prod',
      namespaces: ['prod']
    }
  },

  images: {
    registry: 'ghcr.io/acme',
    tagStrategy: 'git-sha',
    includeProjectInName: true
  },

  secrets: {
    'api-secrets': ({ production }) => ({
      JWT_SECRET: production
        ? process.env.JWT_SECRET ?? ''
        : 'dev-secret'
    })
  },

  configMaps: {
    settings: { LOG_LEVEL: 'info' }
  },

  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: './api',
        dockerfile: './api/Dockerfile'
      },
      network: ({ domain }) => `api.${domain}`,
      env: ({ secret, serviceDNS }) => ({
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
        DATABASE_URL: serviceDNS('postgres', 5432)
      }),
      ports: [{ name: 'http', port: 80, targetPort: 8080 }]
    }
  }
})
```

`process.env` access happens at config-evaluation time, so make sure the variables you need are defined before running `tsops`.

`defineConfig` ensures all namespaces share the same shape and returns an object that preserves your configuration plus runtime helpers (`getApp`, `getEnv`, `getExternalEndpoint`, ...).

### TsOps

Programmatic API for planning, building, and deploying.

```typescript
import { TsOps, GitEnvironmentProvider, ProcessEnvironmentProvider } from '@tsops/core'
import config from './tsops.config.js'

const tsops = new TsOps(config, {
  dryRun: true,
  env: new GitEnvironmentProvider(new ProcessEnvironmentProvider())
})

const plan = await tsops.planWithChanges({ namespace: 'prod' })
const buildResult = await tsops.build({ app: 'api' })
await tsops.deploy({ namespace: 'prod', app: 'api' })
```

Use `plan()` for resolved entries only, or `planWithChanges()` to include Kubernetes validation, diffs, and orphan detection.

## CLI

### plan

Validate manifests, diff cluster state, and list orphaned resources without applying changes.

```bash
tsops plan [options]
```

**Options:**
- `-n, --namespace <name>` - Target a single namespace
- `--app <name>` - Target a single app
- `-c, --config <path>` - Config file path (defaults to `tsops.config`)
- `--dry-run` - Skip Docker/kubectl execution, log actions only

The output groups:
- Global resources (namespaces, secrets, configMaps) validated once per unique artifact
- Per-app changes with diffs (suppressed when `--dry-run` is used)
- Orphaned resources that would be deleted by `deploy`
- A summary that fails the command if validation errors occur

### build

Resolve image references and invoke Docker builds/pushes.

```bash
tsops build [options]
```

**Options:**
- `--app <name>` - Target a single app
- `-n, --namespace <name>` - Use namespace context (influences env functions)
- `-c, --config <path>` - Config file path
- `--dry-run` - Log Docker commands without executing

### deploy

Generate manifests, validate secret placeholders, apply resources atomically, and clean up orphans.

```bash
tsops deploy [options]
```

**Options:**
- `-n, --namespace <name>` - Target a single namespace
- `--app <name>` - Target a single app
- `-c, --config <path>` - Config file path
- `--dry-run` - Log kubectl actions without executing

## Context Helpers

Functions available in app configuration.

### Metadata

```typescript
project: string         // Current project name
namespace: string       // Current namespace
appName: string         // Current app name
cluster: ClusterMetadata // Cluster info
// + all namespace variables (e.g., production, replicas, domain, etc.)
```

### serviceDNS()

```typescript
serviceDNS(app: string, options?: number | ServiceDNSOptions): string
```

Generate Kubernetes service DNS with support for protocols, headless/stateful services, and external lookups.

**Examples:**
```typescript
serviceDNS('api', 3000)  // Simple with port
serviceDNS('api', { port: 3000, protocol: 'https' })  // With protocol prefix
serviceDNS('postgres', { headless: true, podIndex: 0 })  // StatefulSet pod DNS
```

### secret()

```typescript
secret(secretName: string): SecretRef  // Reference entire secret (envFrom)
secret(secretName: string, key: string): SecretRef  // Reference specific key
```

Simplified API for secret references.

**Examples:**
```typescript
env: ({ secret }) => secret('api-secrets')  // All keys as env vars
env: ({ secret }) => ({
  JWT_SECRET: secret('api-secrets', 'JWT_SECRET')  // Specific key
})
```

### configMap()

```typescript
configMap(name: string): ConfigMapRef  // Reference entire configMap
configMap(name: string, key: string): ConfigMapRef  // Reference specific key
```

### label()

```typescript
label(key: string, value?: string): string
```

Generate Kubernetes labels following project conventions.

### resource()

```typescript
resource(kind: ResourceKind, name: string): string
```

Generate resource name following project conventions.

### env()

```typescript
env<T extends string>(key: string, fallback?: T): T
```

Get environment variable with optional fallback.

### template()

```typescript
template(str: string, vars: Record<string, string>): string
```

Simple template string helper.

[View All Helpers →](/guide/context-helpers)

## Types

### TsOpsConfig

Simplified shape of the main configuration type.

```typescript
interface TsOpsConfig {
  project: string
  namespaces: Record<string, NamespaceVars>
  clusters: Record<string, {
    apiServer: string
    context: string
    namespaces: readonly string[]
  }>
  images: {
    registry: string
    tagStrategy: 'git-sha' | 'git-tag' | 'timestamp' | string
    repository?: string
    includeProjectInName?: boolean
  }
  secrets?: Record<string, SecretDefinition>
  configMaps?: Record<string, ConfigMapDefinition>
  apps: Record<string, AppDefinition>
}
```

`NamespaceVars` must be the same shape for every namespace and becomes part of the helper context.

### AppDefinition

Application definition (runtime helpers use the same generics internally).

```typescript
interface AppDefinition {
  image?: string
  build?: DockerfileBuild | Record<string, unknown>
  env?: Record<string, EnvValue> | ((ctx: AppContext) => Record<string, EnvValue> | SecretRef | ConfigMapRef)
  secrets?: Record<string, Record<string, string>> | ((ctx: AppContext) => Record<string, Record<string, string>>)
  configMaps?: Record<string, Record<string, string>> | ((ctx: AppContext) => Record<string, Record<string, string>>)
  network?: string | boolean | AppNetworkOptions | ((ctx: AppContext) => string | boolean | AppNetworkOptions)
  deploy?: 'all' | readonly string[] | { include?: readonly string[]; exclude?: readonly string[] }
  ports?: ServicePort[]
  podAnnotations?: Record<string, string>
  volumes?: Volume[]
  volumeMounts?: VolumeMount[]
  args?: string[]
}
```

When `network` returns a domain string, tsops automatically provisions ingress/Traefik routes and exposes that host through runtime helpers (`getExternalEndpoint`). Set `network` to `false` to skip ingress generation.

## Runtime

### getEnv()

Resolve environment variables at runtime directly from your config object.

```typescript
import config from './tsops.config.js'

process.env.TSOPS_NAMESPACE = 'prod'

const env = config.getEnv('api')
console.log(env.DATABASE_URL)
```

### getInternalEndpoint()

Get internal Kubernetes DNS endpoint for an app.

```typescript
const endpoint = config.getInternalEndpoint('api')
// => 'http://demo-api.prod.svc.cluster.local:8080'
```

### getExternalEndpoint()

Get the public URL (if `network` configured an external host).

```typescript
const external = config.getExternalEndpoint('api')
// => 'https://api.prod.example.com' | undefined
```

### getApp()

Get the full resolved configuration including metadata.

```typescript
const app = config.getApp('api')
console.log(app.env)               // Resolved environment variables
console.log(app.internalEndpoint)  // Internal K8s endpoint
console.log(app.host)              // Domain without protocol (use getExternalEndpoint for https://)
console.log(app.image)             // Docker image reference
```

The active namespace is determined by `TSOPS_NAMESPACE`; when unset, the first namespace in your config is used.

## Next Steps

- [Getting Started Guide](/guide/getting-started)
- [Context Helpers](/guide/context-helpers)
- [Secrets & ConfigMaps](/guide/secrets)
- [What is tsops?](/guide/what-is-tsops)
