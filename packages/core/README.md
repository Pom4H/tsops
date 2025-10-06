# @tsops/core

Core library for tsops, providing the domain model, configuration resolvers, and orchestration logic.

## Architecture

The core package is organized into several layers:

### 1. **Configuration Layer** (`config/`)

Resolvers that transform user configuration into runtime values:

- **`project.ts`** – Project metadata and service naming
- **`domain.ts`** – Domain resolution by region
- **`namespaces.ts`** – Namespace selection and context creation
- **`images.ts`** – Docker image reference building with tag strategies
- **`apps.ts`** – Application configuration resolution (host, env, network)
- **`network-normalizers.ts`** – Network configuration helpers (ingress, ingressRoute, certificate)

**Key concept**: Each resolver has a single responsibility and depends only on other resolvers it needs.

### 2. **Operations Layer** (`operations/`)

High-level operations that implement the main workflows:

- **`planner.ts`** – Resolves configuration into deployment plans
- **`builder.ts`** – Orchestrates Docker image builds
- **`deployer.ts`** – Generates manifests and applies them via kubectl

### 3. **Adapters Layer** (`adapters/`)

External service integrations:

- **`docker-service.ts`** – Docker CLI wrapper
- **`kubectl-service.ts`** – kubectl CLI wrapper

### 4. **Infrastructure Layer**

- **`command-runner.ts`** – Abstraction for executing shell commands
- **`environment-provider.ts`** – Abstraction for accessing environment variables
- **`logger.ts`** – Logging interface and console implementation

### 5. **Main Orchestrator**

**`tsops.ts`** – The `TsOps` class that ties everything together and provides the public API.

## Key Design Principles

### Dependency Injection

All classes accept their dependencies through constructors:

```typescript
class Builder {
  constructor(dependencies: {
    docker: DockerService
    logger: Logger
    resolver: ConfigResolver<TConfig>
  }) {
    // ...
  }
}
```

This makes the code testable and allows swapping implementations.

### Single Responsibility

Each class/module has one clear purpose:

- `Planner` – only planning
- `Builder` – only building
- `Deployer` – only deploying

### Environment Independence

No direct access to `process.env` or external state. Everything goes through abstractions:

- `EnvironmentProvider` for env vars
- `CommandRunner` for external commands
- `Logger` for output

## Usage

### Basic Example

```typescript
import { TsOps } from '@tsops/core'
import config from './tsops.config'

const tsops = new TsOps(config)

// Plan deployment
const plan = await tsops.plan({ namespace: 'prod', app: 'api' })

// Build images
await tsops.build({ app: 'api' })

// Deploy to Kubernetes
await tsops.deploy({ namespace: 'prod', app: 'api' })
```

### With Custom Dependencies

```typescript
import { TsOps, ProcessEnvironmentProvider } from '@tsops/core'

class MockEnvironmentProvider implements EnvironmentProvider {
  get(key: string) {
    return key === 'GIT_SHA' ? 'abc123' : undefined
  }
}

const tsops = new TsOps(config, {
  env: new MockEnvironmentProvider(),
  dryRun: true
})
```

## Configuration

See the main README for full configuration documentation. Key concepts:

- **`defineConfig`** – Type-safe configuration helper
- **Tag strategies** – `git-sha`, `git-tag`, `timestamp`, or custom
- **Namespace selection** – Resolvers automatically determine which apps deploy where
- **Network helpers** – Dynamic ingress/certificate configuration based on context

## Development

The package is built with TypeScript and exports `.js` files with declaration maps:

```bash
pnpm build       # Compile TypeScript
pnpm build:watch # Watch mode
```

## Related Packages

- **@tsops/k8** – Kubernetes manifest builders
- **tsops** – Command-line interface

