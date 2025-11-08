# tsops

## 1.7.0

### Minor Changes

- [#24](https://github.com/Pom4H/tsops/pull/24) [`3807ec3`](https://github.com/Pom4H/tsops/commit/3807ec3b930809233eee232297cd78a7de65191e) Thanks [@Pom4H](https://github.com/Pom4H)! - ## Features

  ### Unified Dynamic Parameters for All App Configuration Fields

  All app configuration parameters now support both static values and dynamic functions with access to namespace context. This provides a consistent, unified approach across the entire configuration API.

  **Supported Parameters:**

  - `ports` - Service ports configuration
  - `args` - Container arguments
  - `volumes` - Volume definitions
  - `volumeMounts` - Volume mount configurations
  - `podAnnotations` - Pod annotations

  **Before (only static):**

  ```typescript
  apps: {
    'my-app': {
      ports: [{ name: 'http', port: 80, targetPort: 3000 }],  // Always 3000
      args: ['--mode=prod'],                                   // Always prod mode
    }
  }
  ```

  **After (static or dynamic):**

  ```typescript
  apps: {
    'worken-front': {
      // Dynamic ports: different targetPort per namespace
      ports: ({ namespace }) => [{
        name: 'http',
        port: 80,
        targetPort: namespace === 'dev' ? 3000 : 3000
      }],

      // Dynamic args: enable debug in dev
      args: ({ production }) =>
        production ? ['--mode=prod'] : ['--mode=dev', '--debug'],

      // Dynamic volumes: region-specific storage
      volumes: ({ region }) =>
        region === 'us' ? usVolumes : euVolumes,

      // Dynamic annotations: namespace-specific labels
      podAnnotations: ({ namespace }) => ({
        'environment': namespace,
        'monitored': namespace === 'prod' ? 'true' : 'false'
      })
    },

    'worken-api': {
      ports: ({ namespace }) => [{
        name: 'http',
        port: 80,
        targetPort: namespace === 'dev' ? 3001 : 3000  // Different ports locally!
      }]
    }
  }
  ```

  **Context Available:**
  All parameters get full access to namespace context:

  - `namespace` - Current namespace name ('dev', 'prod', 'stage')
  - `domain` - Namespace domain
  - `region` - Namespace region
  - `production` - Boolean flag (true for production namespace)
  - `project` - Project name
  - Plus all custom namespace variables

  **Use Cases:**

  1. **Local Development Ports**: Run multiple services on localhost with different ports

  ```typescript
  ports: ({ domain }) => [
    {
      name: "http",
      port: 80,
      targetPort: domain === "localhost" ? 3001 : 3000,
    },
  ];
  ```

  2. **Environment-Specific Arguments**: Different config per environment

  ```typescript
  args: ({ namespace }) =>
    namespace === "dev"
      ? ["--log-level=debug", "--hot-reload"]
      : ["--log-level=info"];
  ```

  3. **Region-Specific Volumes**: Different storage configurations

  ```typescript
  volumes: ({ region }) => [
    {
      name: "data",
      persistentVolumeClaim: {
        claimName: `data-${region}`,
      },
    },
  ];
  ```

  4. **Monitoring Labels**: Conditional annotations

  ```typescript
  podAnnotations: ({ production }) => ({
    "prometheus.io/scrape": production ? "true" : "false",
    "datadog.com/tags": production ? "env:prod" : "env:dev",
  });
  ```

  **Technical Details:**

  - Full type safety with TypeScript
  - Context typed based on your namespace definition
  - Autocomplete for all context properties
  - No performance overhead (resolved once during planning)

  This feature completes the unified approach to configuration, where every parameter can be either static (for simplicity) or dynamic (for flexibility), using the same pattern throughout the entire API.

- [#24](https://github.com/Pom4H/tsops/pull/24) [`5e9f244`](https://github.com/Pom4H/tsops/commit/5e9f2441ab4ace09c271ad13fe97e9fc991f0630) Thanks [@Pom4H](https://github.com/Pom4H)! - ## Features

  ### Added `port()` Runtime Helper

  New `port()` helper provides a single source of truth for application ports. Applications can now query their own port configuration at runtime, enabling dynamic port assignment based on namespace.

  **Problem:**
  Previously, port configuration lived in tsops config, but applications had no way to know what port they should listen on. This led to hardcoded ports in application code or ENV variable duplication.

  **Solution:**
  The `port()` helper extracts the targetPort from the ports configuration, with full support for:

  - Static port values
  - Dynamic port functions (namespace-aware)
  - String format parsing (`"80:3000"` → `3000`)
  - Proper error handling

  **Usage:**

  ```typescript
  // In your application code:
  import config from "./tsops.config";

  const PORT = config.port("worken-api");
  app.listen(PORT);

  console.log(`Server listening on port ${PORT}`);
  // Dev: "Server listening on port 3001"
  // Prod: "Server listening on port 80"
  ```

  **Configuration:**

  ```typescript
  // tsops.config.ts
  export default defineConfig({
    // ...
    apps: {
      "worken-front": {
        ports: ({ domain }) => [
          {
            name: "http",
            port: 80,
            targetPort: domain === "localhost" ? 3000 : 3000,
          },
        ],
      },
      "worken-api": {
        ports: ({ domain }) => [
          {
            name: "http",
            port: 80,
            targetPort: domain === "localhost" ? 3001 : 3000, // Different port locally!
          },
        ],
      },
      "openai-api": {
        ports: ({ domain }) => [
          {
            name: "http",
            port: 80,
            targetPort: domain === "localhost" ? 3002 : 3000,
          },
        ],
      },
    },
  });
  ```

  **Benefits:**

  1. **Single Source of Truth**: Port configuration lives only in tsops config
  2. **Type-Safe**: Full TypeScript support with autocomplete
  3. **Namespace-Aware**: Automatically respects `TSOPS_NAMESPACE` environment variable
  4. **Dynamic**: Supports conditional logic via functions
  5. **Error Handling**: Clear error messages if ports not configured

  **Local Development:**
  Perfect for running multiple services on different ports:

  - `worken-front`: http://localhost:3000
  - `worken-api`: http://localhost:3001
  - `openai-api`: http://localhost:3002

  **Production:**
  All services can use standard container ports (80, 3000, etc.) without conflicts.

  **String Format Support:**
  Also supports the `"service:container"` string format:

  ```typescript
  ports: [{ name: "http", port: "80:3000" }];
  config.port("app"); // → 3000
  ```

  This feature completes the runtime helpers trinity: `dns()`, `url()`, and `port()` - everything your application needs to know about its deployment environment.

### Patch Changes

- Updated dependencies [[`3807ec3`](https://github.com/Pom4H/tsops/commit/3807ec3b930809233eee232297cd78a7de65191e), [`5e9f244`](https://github.com/Pom4H/tsops/commit/5e9f2441ab4ace09c271ad13fe97e9fc991f0630)]:
  - @tsops/core@0.8.0
  - @tsops/node@0.2.7

## 1.6.0

### Minor Changes

- [#22](https://github.com/Pom4H/tsops/pull/22) [`fa30ffc`](https://github.com/Pom4H/tsops/commit/fa30ffcd05880a1744a6bd6cdd9b12712da654af) Thanks [@Pom4H](https://github.com/Pom4H)! - ## Features

  ### Added port support in ingress for local development

  Added optional `port` field to ingress definition, enabling multiple services to run on different ports during local development on the same domain (e.g., localhost).

  **Use Case:**
  When developing locally, you often need to run multiple services on `localhost` with different ports:

  - `worken-front`: http://localhost:3000
  - `worken-api`: http://localhost:3001
  - `openai-api`: http://localhost:3002

  **Example:**

  ```typescript
  apps: {
    'worken-front': {
      ingress: ({ domain }) => ({
        domain,
        port: domain === 'localhost' ? 3000 : undefined
      }),
      // ... rest of config
    },
    'worken-api': {
      ingress: ({ domain }) => ({
        domain: `api.${domain}`,
        port: domain === 'localhost' ? 3001 : undefined
      }),
      // ... rest of config
    }
  }
  ```

  **Result:**

  ```typescript
  // In dev (domain: localhost):
  config.url("worken-front", "ingress"); // → http://localhost:3000
  config.url("worken-api", "ingress"); // → http://localhost:3001

  // In production (domain: worken.ru):
  config.url("worken-front", "ingress"); // → https://worken.ru
  config.url("worken-api", "ingress"); // → https://api.worken.ru
  ```

  **Technical Details:**

  - Port is only added to `ingress` type URLs
  - `cluster` and `service` types remain unaffected (no ports)
  - Port is optional and omitted when `undefined`
  - Works seamlessly with protocol auto-detection

  **Changes:**

  - Added `port?: number` to `IngressDefinitionObject`
  - Updated `resolveNetwork` to extract and return port from ingress
  - Updated runtime `url()` helper to append port when present
  - Added comprehensive test coverage

  This feature makes local development workflows much smoother when running multiple services simultaneously!

### Patch Changes

- Updated dependencies [[`fa30ffc`](https://github.com/Pom4H/tsops/commit/fa30ffcd05880a1744a6bd6cdd9b12712da654af)]:
  - @tsops/core@0.7.0
  - @tsops/node@0.2.6

## 1.5.1

### Patch Changes

- [#20](https://github.com/Pom4H/tsops/pull/20) [`3143e09`](https://github.com/Pom4H/tsops/commit/3143e092ffce4c10466f0b14e592a5ecfe0f5b25) Thanks [@Pom4H](https://github.com/Pom4H)! - ## Bug Fixes

  ### Fixed TypeError when ingress function returns undefined

  Fixed a critical bug where `resolveNetwork` would crash with `TypeError: Cannot read properties of undefined (reading 'includes')` when:

  - An app's `ingress` function returned `undefined` or `null`
  - Runtime config was imported in any application (causing iteration over all apps including those without ingress)

  **Before:**

  ```typescript
  // This would crash the entire config import!
  apps: {
    mastra: {
      ports: [...] // No ingress
    }
  }
  ```

  **After:**

  ```typescript
  // Now safely handles apps without ingress
  apps: {
    mastra: {
      ports: [...] // No ingress - works fine!
    }
  }
  ```

  **Changes:**

  - Added validation in `resolveNetwork` to check if `resolved` object exists before accessing properties
  - Added proper error handling in `dns()` helper when requesting ingress DNS for apps without ingress configuration
  - Returns clear error message: `Cannot get ingress DNS for app "X": no ingress configuration found`

  **Tests:**

  - Added test cases for apps without ingress
  - Added test cases for conditional ingress that might return undefined
  - All 6 tests passing

  This fix is critical for production usage where config contains both public-facing apps (with ingress) and internal services (without ingress).

- Updated dependencies [[`3143e09`](https://github.com/Pom4H/tsops/commit/3143e092ffce4c10466f0b14e592a5ecfe0f5b25)]:
  - @tsops/core@0.6.1
  - @tsops/node@0.2.5

## 1.5.0

### Minor Changes

- ## Breaking Changes

  ### Simplified Ingress Definition

  The `ingress` definition now only accepts an object format or a function returning an object. String and boolean formats have been removed for better type safety and explicit protocol control.

  **Before:**

  ```typescript
  ingress: "example.com"; // ❌ No longer supported
  ingress: true; // ❌ No longer supported
  ```

  **After:**

  ```typescript
  ingress: ({ domain }) => ({ domain: `api.${domain}` });
  // With explicit protocol:
  ingress: ({ domain }) => ({
    domain: `api.${domain}`,
    protocol: "https", // optional, auto-detected by default
  });
  ```

  ### Protocol Auto-Detection

  Ingress protocol is now automatically detected based on the domain:

  - Local domains (`*.localtest.me`, `localhost`, `*.local`) → `http`
  - Production domains → `https`
  - Can be explicitly overridden via `protocol` option

  ## Features

  ### Service Discovery Documentation

  Added comprehensive documentation and examples for proper service-to-service communication using runtime config helpers:

  ```typescript
  // ✅ Correct: Use runtime config
  import config from "./tsops.config";

  const apiUrl = config.url("api", "service"); // http://api
  const apiUrl = config.url("api", "cluster"); // http://api.prod.svc.cluster.local
  const publicUrl = config.url("api", "ingress"); // https://api.example.com
  ```

  Benefits:

  - Type-safe with compile-time checking
  - Respects `TSOPS_NAMESPACE` environment variable
  - Single source of truth
  - No container restarts needed for endpoint changes

  ### Platform-Agnostic Documentation

  All documentation has been updated to be platform-agnostic, removing specific references to Kubernetes to prepare for future multi-platform support.

  ## Migration Guide

  ### Update Ingress Definitions

  Change all ingress definitions to use object format:

  ```typescript
  // Before
  apps: {
    api: {
      ingress: "api.example.com"; // ❌
    }
  }

  // After
  apps: {
    api: {
      ingress: ({ domain }) => ({ domain: `api.${domain}` }); // ✅
    }
  }
  ```

  ### Use Runtime Config for Service Discovery

  Replace hardcoded DNS or ENV variables with runtime config:

  ```typescript
  // ❌ Before: Hardcoded in ENV
  env: () => ({
    BACKEND_URL: "http://backend:3000", // Anti-pattern!
  });

  // ✅ After: In your application code
  import config from "./tsops.config";
  const backendUrl = config.url("backend", "service");
  ```

  ### ENV Variables Are Only For

  Use ENV variables **only** for:

  - Secrets (API keys, passwords, tokens)
  - External services (outside the cluster)
  - Feature flags and configuration
  - Build-time values

  **Never** use ENV for internal service URLs - use `config.url()` in runtime instead.

### Patch Changes

- Updated dependencies []:
  - @tsops/core@0.6.0
  - @tsops/node@0.2.4

## 1.4.2

### Patch Changes

- feat: add image existence check before build and force rebuild flag

  - Add `imageExists()` method to DockerClient to check if image already exists in registry using `docker manifest inspect`
  - Build process now automatically skips building images that already exist in the registry
  - Add `--force` (`-f`) flag to CLI build command to force rebuild even if image exists
  - Add `force` option to `build()` method in TsOps API
  - Improves CI/CD efficiency by avoiding unnecessary rebuilds of existing images

- Updated dependencies []:
  - @tsops/core@0.5.2
  - @tsops/node@0.2.3

## 1.4.1

### Patch Changes

- Updated dependencies [[`d1653e0`](https://github.com/Pom4H/tsops/commit/d1653e01fb7749cb965e8b7d9b3fc42ac9fbd52e)]:
  - @tsops/core@0.5.1
  - @tsops/node@0.2.2

## 1.4.0

### Minor Changes

- feat: add url helper for building complete URLs with automatic port resolution
- feat: refactor runtime configuration with direct helper methods

  ### Refactored Runtime Configuration

  Completely refactored runtime configuration to provide direct helper methods: `env`, `dns`, and `url`. Replaced old methods (`getEnv`, `getInternalEndpoint`, `getExternalEndpoint`) with cleaner API.

  **Breaking Changes:**

  - **Removed**: `config.getEnv()`, `config.getInternalEndpoint()`, `config.getExternalEndpoint()`, `config.getApp()`, `config.getNamespace()`
  - **Added**: `config.env()`, `config.dns()`, `config.url()` with cleaner API
  - **Renamed**: `network` configuration property → `ingress`
  - **Changed**: Ingress URLs now return HTTPS without port by default

  **Migration Guide:**

  ```typescript
  // Old API (deprecated)
  const env = config.getEnv("api");
  const internal = config.getInternalEndpoint("api");
  const external = config.getExternalEndpoint("api");

  // New API (current)
  const nodeEnv = config.env("api", "NODE_ENV");
  const internal = config.url("api", "cluster");
  const external = config.url("api", "ingress");
  ```

  ## New Features

  ### URL Helper

  Added a new `url` helper function that automatically builds complete URLs with ports, eliminating the need to manually construct URLs from DNS names and ports.

  **Usage:**

  ```typescript
  env: ({ url }) => ({
    BACKEND_URL: url("backend", "ingress"), // -> 'https://api.example.com:3000'
    API_URL: url("api", "cluster"), // -> 'http://api.namespace.svc.cluster.local:8080'
    SERVICE_URL: url("api", "service"), // -> 'http://api:8080'
  });
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
    API_URL: `http://${dns("api", "cluster")}:3000`,
  });

  // After
  env: ({ url }) => ({
    API_URL: url("api", "cluster"),
  });
  ```

### Patch Changes

- Updated dependencies []:
  - @tsops/core@0.5.0
  - @tsops/node@0.2.1

## 1.3.1

### Patch Changes

- [`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3) Thanks [@Pom4H](https://github.com/Pom4H)! - Published a dedicated `tsops/cli` entry point so command-line tooling can keep using Node built-ins without affecting bundlers

- Updated dependencies [[`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3)]:
  - @tsops/core@0.4.1
  - @tsops/node@0.2.0

## 1.3.0

### Minor Changes

- [`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3) Thanks [@Pom4H](https://github.com/Pom4H)! - Published a dedicated `tsops/cli` entry point so command-line tooling can keep using Node built-ins without affecting bundlers

### Patch Changes

- Updated dependencies [[`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3)]:
  - @tsops/core@0.4.0

## 1.2.2

### Patch Changes

- [`bfcc2c0`](https://github.com/Pom4H/tsops/commit/bfcc2c03e37340c7528d52f8f5cce1fd1bc00e65) Thanks [@Pom4H](https://github.com/Pom4H)! - Fix return typing of `defineConfig` and expose `TsOpsConfigWithRuntime` so consumer configs no longer reference the internal `.pnpm` path.

- Updated dependencies [[`bfcc2c0`](https://github.com/Pom4H/tsops/commit/bfcc2c03e37340c7528d52f8f5cce1fd1bc00e65)]:
  - @tsops/core@0.3.2
