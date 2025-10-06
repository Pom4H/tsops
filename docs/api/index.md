# API Reference

Complete API documentation for tsops.

## Core

### defineConfig()

Define your tsops configuration with full type safety.

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  domain: { prod: 'example.com' },
  // ...
})
```

[Full Reference →](/api/define-config)

### TsOps

Main class for executing tsops commands.

```typescript
import { TsOps } from 'tsops'
import config from './tsops.config'

const tsops = new TsOps(config, { dryRun: false })

// Plan
await tsops.plan({ namespace: 'production' })

// Build
await tsops.build({ app: 'api' })

// Deploy
await tsops.deploy({ namespace: 'production', app: 'api' })
```

## CLI

### plan

Generate deployment plan.

```bash
tsops plan [options]
```

**Options:**
- `-n, --namespace <name>` - Target namespace
- `--app <name>` - Target app
- `-c, --config <path>` - Config file path
- `--dry-run` - Skip external commands

[Full Reference →](/api/cli#plan)

### build

Build Docker images.

```bash
tsops build [options]
```

**Options:**
- `--app <name>` - Target app
- `-n, --namespace <name>` - Namespace (for dev/prod context)
- `-c, --config <path>` - Config file path
- `--dry-run` - Skip external commands

[Full Reference →](/api/cli#build)

### deploy

Deploy to Kubernetes.

```bash
tsops deploy [options]
```

**Options:**
- `-n, --namespace <name>` - Target namespace
- `--app <name>` - Target app
- `-c, --config <path>` - Config file path
- `--dry-run` - Skip external commands

[Full Reference →](/api/cli#deploy)

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

Generate Kubernetes service DNS with support for protocols, headless services, and external services.

**Examples:**
```typescript
serviceDNS('api', 3000)  // Simple with port
serviceDNS('api', { port: 3000, protocol: 'https' })  // With protocol
serviceDNS('postgres', { headless: true, podIndex: 0 })  // StatefulSet
```

### subdomain()

```typescript
subdomain(prefix: string, baseDomain?: string): string
```

Generate subdomain from base domain.

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

Generate Kubernetes label selector.

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

Main configuration type.

```typescript
interface TsOpsConfig<
  TProject extends string,
  TNamespaceName extends string,
  TDomain extends Record<string, string>,
  TCluster extends string,
  TApp extends string,
  TRegion extends string
> {
  project: TProject
  domain: TDomain
  namespaces: Record<TNamespaceName, NamespaceDefinition<TRegion>>
  clusters?: Record<TCluster, ClusterDefinition<TNamespaceName>>
  images?: ImagesConfig
  apps: Record<TApp, AppDefinition<TNamespaceName, TDomain>>
}
```

### AppDefinition

Application definition.

```typescript
interface AppDefinition<
  TNamespaceName extends string,
  TDomain extends Record<string, string>
> {
  host?: string | ((ctx: AppHostContextWithHelpers<TDomain>) => string)
  image?: string
  build?: BuildDefinition
  env?: AppEnv<TNamespaceName, TDomain>
  secrets?: AppSecretsDefinition<TNamespaceName, TDomain>
  configMaps?: AppConfigMapsDefinition<TNamespaceName, TDomain>
  network?: AppNetworkDefinition<TNamespaceName, TDomain>
  // ...
}
```

## Runtime

### getEnv()

Get environment variables at runtime.

```typescript
import { getEnv } from '@tsops/runtime'
import config from './tsops.config'

const env = await getEnv(config, 'api', process.env.NAMESPACE!)
```

[Full Reference →](/api/runtime)

## Next Steps

- [defineConfig Reference](/api/define-config)
- [Context Helpers](/api/context-helpers)
- [CLI Commands](/api/cli)


