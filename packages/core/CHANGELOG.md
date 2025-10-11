# @tsops/core

## 0.5.2

### Patch Changes

- Fix documentation examples to use `ingress` instead of deprecated `network` property

  - Updated all documentation examples in `docs/` directory
  - Changed `network: ({ domain }) => ...` to `ingress: ({ domain }) => ...`
  - Updated API reference to show correct `AppIngressOptions` type
  - Fixed examples in getting started, quick start, and context helpers guides
  - All examples now use the current API consistently

## 0.5.1

### Patch Changes

- [#9](https://github.com/Pom4H/tsops/pull/9) [`d1653e0`](https://github.com/Pom4H/tsops/commit/d1653e01fb7749cb965e8b7d9b3fc42ac9fbd52e) Thanks [@Pom4H](https://github.com/Pom4H)! - fix(core): runtime env() now reads from process.env

  - Update runtime helpers `config.env(app, key)` to return values from `process.env`
  - Aligns with docs and expected runtime behavior
  - Add tests to verify `config.env()` reads from `process.env`

## 0.5.0

### Minor Changes

- feat: add url helper for building complete URLs with automatic port resolution
- feat: refactor runtime configuration with direct helper methods

  ### Refactored Runtime Configuration

  Completely refactored runtime configuration to provide direct helper methods: `env`, `dns`, and `url`. Replaced old methods (`getEnv`, `getInternalEndpoint`, `getExternalEndpoint`) with cleaner API.

  **Usage:**

  ```typescript
  import config from './tsops.config'

  // DNS helpers
  const clusterDns = config.dns('api', 'cluster') // -> 'api.namespace.svc.cluster.local'
  const serviceDns = config.dns('api', 'service') // -> 'api'
  const ingressDns = config.dns('api', 'ingress') // -> 'api.example.com'

  // URL helpers with automatic port resolution
  const clusterUrl = config.url('api', 'cluster') // -> 'http://api.namespace.svc.cluster.local:3000'
  const serviceUrl = config.url('api', 'service') // -> 'http://api:3000'
  const ingressUrl = config.url('api', 'ingress') // -> 'https://api.example.com' (HTTPS, no port)

  // Environment variables
  const nodeEnv = config.env('api', 'NODE_ENV') // -> 'production'
  const port = config.env('api', 'PORT') // -> '3000'
  ```

  **Breaking Changes:**

  - **Removed**: `config.getEnv()`, `config.getInternalEndpoint()`, `config.getExternalEndpoint()`, `config.getApp()`, `config.getNamespace()`
  - **Added**: `config.env()`, `config.dns()`, `config.url()` with cleaner API
  - **Renamed**: `network` configuration property → `ingress`
  - **Changed**: Ingress URLs now return HTTPS without port by default

  **Migration Guide:**

  ```typescript
  // Old API (deprecated)
  const env = config.getEnv('api')
  const internal = config.getInternalEndpoint('api')
  const external = config.getExternalEndpoint('api')

  // New API (current)
  const nodeEnv = config.env('api', 'NODE_ENV')
  const internal = config.url('api', 'cluster')
  const external = config.url('api', 'ingress')
  ```

  **Features:**

  - **Direct methods**: `config.dns()`, `config.url()`, `config.env()` available directly on config
  - **Smart URL generation**: Ingress URLs use HTTPS without port, others use HTTP with port
  - **Clean interface**: Only essential methods, no complex runtime objects
  - **Type safety**: Full TypeScript support with proper inference
  - **Updated documentation**: All examples updated to use new API

  ## New Features

  ### URL Helper

  Added a new `url` helper function that automatically builds complete URLs with ports, eliminating the need to manually construct URLs from DNS names and ports.

  **Usage:**

  ```typescript
  env: ({ url }) => ({
    BACKEND_URL: url('backend', 'ingress'), // -> 'https://api.example.com:3000'
    API_URL: url('api', 'cluster'), // -> 'http://api.namespace.svc.cluster.local:8080'
    SERVICE_URL: url('api', 'service') // -> 'http://api:8080'
  })
  ```

  **Features:**

  - **Automatic port resolution**: Uses the first port from `app.ports[0].port`
  - **Protocol support**: Defaults to `http`, supports `https` via options
  - **All DNS types**: Works with `'cluster'`, `'service'`, and `'ingress'` types
  - **External DNS integration**: Properly resolves external hosts through `network` configuration

  ### Simplified DNS Helper

  - Removed 3rd argument (options) from `dns` helper for simplicity
  - `dns` now returns only DNS names without ports or protocols
  - `url` helper handles complete URL construction

  ## Breaking Changes

  - `dns` helper signature changed from `dns(app, type, options?)` to `dns(app, type)`
  - All examples updated to use `url` helper instead of manual URL construction

  ## Migration Guide

  Replace manual URL construction:

  ```typescript
  // Before
  env: ({ dns }) => ({
    API_URL: `http://${dns('api', 'cluster')}:3000`
  })

  // After
  env: ({ url }) => ({
    API_URL: url('api', 'cluster')
  })
  ```

## 0.4.1

### Patch Changes

- [`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3) Thanks [@Pom4H](https://github.com/Pom4H)! - Published a dedicated `tsops/cli` entry point so command-line tooling can keep using Node built-ins without affecting bundlers

## 0.4.0

### Minor Changes

- [`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3) Thanks [@Pom4H](https://github.com/Pom4H)! - Published a dedicated `tsops/cli` entry point so command-line tooling can keep using Node built-ins without affecting bundlers

## 0.3.2

### Patch Changes

- [`bfcc2c0`](https://github.com/Pom4H/tsops/commit/bfcc2c03e37340c7528d52f8f5cce1fd1bc00e65) Thanks [@Pom4H](https://github.com/Pom4H)! - Fix return typing of `defineConfig` and expose `TsOpsConfigWithRuntime` so consumer configs no longer reference the internal `.pnpm` path.
