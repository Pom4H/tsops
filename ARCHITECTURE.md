# tsops Architecture

This document provides a comprehensive overview of the tsops architecture, designed to be LLM-friendly and easy to understand even with limited context.

## Overview

tsops is a TypeScript-first toolkit for deploying applications to Kubernetes. It follows clean architecture principles with clear separation of concerns.

## System Architecture

```
┌───────────────────────────────────────────────────────────┐
│                           tsops                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Command Parser (commander)                        │   │
│  │  - plan / build / deploy commands                  │   │
│  │  - Option parsing & validation                     │   │
│  └─────────────────────────┬──────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────┐
│                        @tsops/core                        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              TsOps (Main Orchestrator)              │  │
│  │  • Dependency injection container                   │  │
│  │  • Coordinates operations (plan/build/deploy)       │  │
│  └───┬─────────────────────────────────────────┬───────┘  │
│      │                                         │          │
│  ┌───▼──────────┐  ┌──────────────┐  ┌─────────▼──────┐   │
│  │   Planner    │  │   Builder    │  │    Deployer    │   │
│  │              │  │              │  │                │   │
│  │ • Resolves   │  │ • Builds     │  │ • Generates    │   │
│  │   config     │  │   Docker     │  │   manifests    │   │
│  │ • Creates    │  │   images     │  │ • Applies      │   │
│  │   plan       │  │ • Pushes     │  │   via kubectl  │   │
│  └───┬──────────┘  └──────┬───────┘  └────────┬───────┘   │
│      │                    │                   │           │
│  ┌───▼────────────────────▼───────────────────▼───────┐   │
│  │            ConfigResolver (Facade)                 │   │
│  │  ┌──────────┬──────────┬──────────┬──────────┐     │   │
│  │  │ Project  │  Domain  │Namespaces│  Images  │     │   │
│  │  │ Resolver │ Resolver │ Resolver │ Resolver │     │   │
│  │  └──────────┴──────────┴──────────┴──────────┘     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │        Apps Resolver                         │  │   │
│  │  │  • host / env / network resolution           │  │   │
│  │  │  • Uses network-normalizers.ts               │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────┘   │
│      │                    │                   │           │
│  ┌───▼──────────┐  ┌──────▼───────┐  ┌────────▼───────┐   │
│  │    Docker    │  │   Kubectl    │  │ ManifestBuilder│   │
│  │  (Adapter)   │  │  (Adapter)   │  │  (@tsops/k8)   │   │
│  └───┬──────────┘  └──────┬───────┘  └────────┬───────┘   │
│      │                    │                   │           │
│  ┌───▼────────────────────▼───────────────────▼────────┐  │
│  │           Infrastructure Layer                      │  │
│  │  • CommandRunner - executes shell commands          │  │
│  │  • EnvironmentProvider - accesses env vars          │  │
│  │  • Logger - output & debugging                      │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                         @tsops/k8                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           ManifestBuilder (Orchestrator)            │   │
│  └───┬──────────────────────────────────────────┬──────┘   │
│      │                                          │          │
│  ┌───▼───────┬───────────┬───────────┬──────────▼──────┐   │
│  │Deployment │  Service  │  Ingress  │  IngressRoute   │   │
│  │  Builder  │  Builder  │  Builder  │    Builder      │   │
│  └───────────┴───────────┴───────────┴─────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Certificate Builder                        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │      Generated Kubernetes API Types                 │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │  Docker CLI    │
            │  kubectl CLI   │
            └────────────────┘
```

## Layer Responsibilities

### 1. CLI Layer (`tsops`)
- **Purpose**: User interface for tsops
- **Responsibilities**:
  - Parse command-line arguments using `commander`
  - Load configuration files (TypeScript/JavaScript)
  - Invoke TsOps operations
  - Format and display results
- **Dependencies**: `@tsops/core`

### 2. Orchestration Layer (`@tsops/core`)

#### TsOps Class
- **Purpose**: Main entry point and dependency injection container
- **Responsibilities**:
  - Initialize all dependencies
  - Provide high-level API: `plan()`, `build()`, `deploy()`
  - Allow dependency injection for testing

#### Operations
- **Planner**: Resolves configuration into deployment plan
- **Builder**: Orchestrates Docker image builds
- **Deployer**: Generates manifests and applies them

### 3. Configuration Layer (`@tsops/core/config`)

All resolvers follow the same pattern:
1. Take raw config as input
2. Depend only on other resolvers they need
3. Expose domain-specific methods

#### ConfigResolver (Facade)
Coordinates all sub-resolvers and provides unified access.

#### Sub-Resolvers
- **ProjectResolver**: Project naming (e.g., `project-appname`)
- **DomainResolver**: Domain selection by region
- **NamespaceResolver**: Namespace selection, dev/prod detection
- **ImagesResolver**: Docker image reference building with tag strategies
- **AppsResolver**: Application configuration resolution

### 4. Adapter Layer (`@tsops/core/adapters`)

Adapters wrap external tools and follow a consistent interface:

- **Docker**: Wraps `docker build` and `docker push`
- **Kubectl**: Wraps `kubectl apply`

Both depend on:
- `CommandRunner` (for execution)
- `Logger` (for output)
- `dryRun` flag (for safe testing)

### 5. Infrastructure Layer (`@tsops/core`)

Pure abstractions with no business logic:

- **CommandRunner**: Executes shell commands
  - `DefaultCommandRunner`: Uses Node.js `child_process`
  - Interface allows mocking for tests

- **EnvironmentProvider**: Accesses environment variables
  - `ProcessEnvironmentProvider`: Uses `process.env`
  - Interface allows mocking for tests

- **Logger**: Output interface
  - `ConsoleLogger`: Logs to console
  - Interface allows custom implementations

### 6. Kubernetes Layer (`@tsops/k8`)

- **ManifestBuilder**: Coordinates all manifest builders
- **Individual Builders**: Pure functions that generate manifests
  - `buildDeployment()`: Creates Deployment
  - `buildService()`: Creates Service
  - `buildIngress()`: Creates Ingress
  - `buildIngressRoute()`: Creates Traefik IngressRoute
  - `buildCertificate()`: Creates cert-manager Certificate

## Data Flow

### Example: `tsops deploy --namespace prod --app api`

1. **CLI** parses arguments → `{ namespace: 'prod', app: 'api' }`
2. **CLI** loads config file → `TsOpsConfig`
3. **CLI** creates `TsOps` instance with config
4. **CLI** calls `tsops.deploy({ namespace: 'prod', app: 'api' })`
5. **TsOps** delegates to `Deployer.deploy()`
6. **Deployer** calls `Planner.plan()` to get deployment plan
7. **Planner** uses `ConfigResolver` to:
   - Select namespace: `'prod'`
   - Select app: `'api'`
   - Resolve host: `api.example.com`
   - Resolve image: `ghcr.io/org/api:abc123`
   - Resolve env: `{ NODE_ENV: 'production' }`
   - Resolve network config
8. **Deployer** calls `ManifestBuilder.build()` with plan entry
9. **ManifestBuilder** generates manifests using individual builders
10. **Deployer** calls `Kubectl.apply()` for each manifest
11. **Kubectl** uses `CommandRunner` to execute `kubectl apply`
12. **Deployer** returns result with applied manifest references
13. **CLI** formats and displays results

## Design Patterns

### 1. Dependency Injection
All classes receive dependencies through constructors, making them testable and flexible.

```typescript
class Builder {
  constructor(private deps: {
    docker: Docker
    logger: Logger
    resolver: ConfigResolver
  }) {}
}
```

### 2. Strategy Pattern
Tag strategies and network configuration support multiple implementations:

```typescript
tagStrategy: 'git-sha' | 'git-tag' | 'timestamp' | string | { kind: string, value?: string }
```

### 3. Facade Pattern
`ConfigResolver` provides a unified interface to all sub-resolvers.

### 4. Adapter Pattern
`Docker` and `Kubectl` adapt CLI tools to TypeScript interfaces.

### 5. Builder Pattern
Manifest builders compose complex Kubernetes resources step by step.

## Key Design Decisions

### Why Separate Resolvers?
Each resolver has a single responsibility and can be understood in isolation. This follows the Single Responsibility Principle and makes the code easier to navigate for both humans and LLMs.

### Why EnvironmentProvider?
Direct access to `process.env` creates hidden dependencies and makes testing harder. The abstraction allows:
- Testing with mock values
- Different environments (Node, browser, edge workers)
- Clear visibility of what env vars are used

### Why Network Normalizers?
The `resolveNetwork` function was becoming too large. Extracting normalizers:
- Reduces cognitive load
- Makes each piece testable in isolation
- Follows the Law of Demeter (each function talks to its direct collaborators)

### Why Commander Instead of Manual Parsing?
Manual argument parsing is error-prone and lacks features like:
- Auto-generated help text
- Type checking
- Subcommand support
- Option validation

## Testing Strategy

### Unit Tests
Each resolver, builder, and service should be testable in isolation:

```typescript
// Example: Testing ImagesResolver with mock env
const mockEnv: EnvironmentProvider = {
  get: (key) => (key === 'GIT_SHA' ? 'abc123' : undefined)
}

const resolver = createImagesResolver(config, projectResolver, mockEnv)
expect(resolver.buildRef('api')).toBe('ghcr.io/org/api:abc123')
```

### Integration Tests
Test operations with real dependencies:

```typescript
const tsops = new TsOps(config, {
  runner: mockCommandRunner,
  logger: mockLogger,
  env: mockEnv,
  dryRun: true
})

const result = await tsops.deploy({ namespace: 'test' })
expect(result.entries).toHaveLength(1)
```

## Common Patterns

### Adding a New Resolver

1. Create interface in `config/` directory
2. Create factory function: `createXResolver(config, ...deps)`
3. Add to `ConfigResolver` interface
4. Wire up in `createConfigResolver()`

### Adding a New Operation

1. Create class in `operations/` directory
2. Accept dependencies through constructor
3. Export result type
4. Wire up in `TsOps` constructor
5. Expose method on `TsOps` class

### Adding a New Manifest Type

1. Create builder function in `k8/builders/`
2. Add to `ManifestSet` type
3. Update `ManifestBuilder.build()` to call new builder
4. Add to supported manifests in `Kubectl`

## Performance Considerations

- **Lazy Evaluation**: Resolvers don't compute until needed
- **Batching**: Operations are batched per namespace/app
- **Caching**: Consider adding cache to frequently-called resolvers
- **Parallelization**: Build operations could run in parallel

## Error Handling

Errors should be thrown at the earliest point where validation can occur:

- **Config validation**: Throw during resolver creation
- **Missing values**: Throw during resolution
- **Command failures**: Propagate from CommandRunner

All errors include context:
```typescript
throw new Error(`App "${appName}" requires a host but none is configured`)
```

## Future Improvements

1. **Validation Layer**: Add schema validation for config files
2. **Plugin System**: Allow custom resolvers and builders
3. **Watch Mode**: Live-reload on config changes
4. **Rollback Support**: Track deployments and enable rollback
5. **Multi-Cluster**: Parallel deployment to multiple clusters
6. **Helm Integration**: Generate or use Helm charts

## Conclusion

The architecture prioritizes:
- **Clarity**: Each piece has one clear purpose
- **Testability**: Dependencies are injected and abstracted
- **Extensibility**: New features can be added without changing existing code
- **LLM-friendliness**: Small, focused modules that can be understood independently

For more details on specific packages, see:
- [`packages/core/README.md`](packages/core/README.md)
- [`packages/k8/README.md`](packages/k8/README.md)
- [`packages/cli/README.md`](packages/cli/README.md)

