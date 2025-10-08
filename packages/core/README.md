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

### 3. **Ports Layer** (`ports/`)

Type-only contracts that describe external integrations. Implementations live in platform packages such as `@tsops/node`:

- **`docker.ts`** – `DockerClient` interface used by `Builder`
- **`kubectl.ts`** – `KubectlClient` interface used by `Deployer`

### 4. **Infrastructure Layer**

- **`environment-provider.ts`** – Abstraction for accessing environment variables (bundler-safe defaults)
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

### Basic Example (Node runtime)

```typescript
import { createNodeTsOps } from '@tsops/node'
import config from './tsops.config'

const tsops = createNodeTsOps(config, { dryRun: true })

const plan = await tsops.planWithChanges({ namespace: 'prod' })
await tsops.build({ app: 'api' })
await tsops.deploy({ namespace: 'prod', app: 'api' })
```

`createNodeTsOps` wires the Node adapters (`Docker`, `Kubectl`, `DefaultCommandRunner`) together with the default environment provider (`GitEnvironmentProvider(ProcessEnvironmentProvider)`) so the orchestrator stays platform-neutral.

### With Custom Dependencies

You can still instantiate `TsOps` directly when you need to provide bespoke adapters (for example, using mocked runners in tests or targeting a different execution environment):

```typescript
import { TsOps, ConsoleLogger, type Logger } from '@tsops/core'
import {
  DefaultCommandRunner,
  Docker,
  Kubectl,
  GitEnvironmentProvider,
  ProcessEnvironmentProvider
} from '@tsops/node'

const runner = new DefaultCommandRunner()
const logger: Logger = new ConsoleLogger()
const env = new GitEnvironmentProvider(new ProcessEnvironmentProvider())

const tsops = new TsOps(config, {
  docker: new Docker({ runner, logger, dryRun: true }),
  kubectl: new Kubectl({ runner, logger, dryRun: true }),
  logger,
  env,
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

- **tsops** – CLI package that also exports `defineConfig`
- **@tsops/node** – Node-specific adapters (`createNodeTsOps`, Docker/kubectl runners)
- **@tsops/k8** – Kubernetes manifest builders
