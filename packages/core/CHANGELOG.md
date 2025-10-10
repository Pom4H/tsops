# @tsops/core

## 0.5.0

### Minor Changes

- feat: add url helper for building complete URLs with automatic port resolution
- feat: add simplified runtime configuration with reusable helpers

  ### Simplified Runtime Configuration

  Added a new `getRuntime()` method that provides a simplified interface with only essential helpers: `env`, `dns`, and `url`.

  **Usage:**
  ```typescript
  const runtime = config.getRuntime()
  
  // DNS helpers
  const clusterDns = runtime.dns('api', 'cluster')     // -> 'api.namespace.svc.cluster.local'
  const serviceDns = runtime.dns('api', 'service')     // -> 'api'
  const ingressDns = runtime.dns('api', 'ingress')     // -> 'api.example.com'
  
  // URL helpers with automatic port resolution
  const clusterUrl = runtime.url('api', 'cluster')     // -> 'http://api.namespace.svc.cluster.local:3000'
  const serviceUrl = runtime.url('api', 'service')     // -> 'http://api:3000'
  const ingressUrl = runtime.url('api', 'ingress')     // -> 'http://api.example.com:3000'
  
  // Environment variables
  const env = runtime.getEnv('api')                    // -> { PORT: '3000', ... }
  ```

  **Features:**
  - **Reusable helpers**: `dns`, `url`, `env` functions can be used independently
  - **Automatic port resolution**: URLs include correct ports from app configuration
  - **Simplified interface**: Only essential methods, no complex runtime objects
  - **Type safety**: Full TypeScript support with proper inference

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
