# tsops

## 2.0.3

### Patch Changes

- [#58](https://github.com/Pom4H/tsops/pull/58) [`db07cb8`](https://github.com/Pom4H/tsops/commit/db07cb8351220afe6c6e12ae17d6e4548ed1a089) Thanks [@arhebs](https://github.com/arhebs)! - Do not require generated runtime database Secrets for built-in drop-schema jobs;
  the drop SQL only needs lifecycle credentials and resolved metadata.
- Updated dependencies [[`db07cb8`](https://github.com/Pom4H/tsops/commit/db07cb8351220afe6c6e12ae17d6e4548ed1a089)]:
  - @tsops/core@2.0.3
  - @tsops/node@2.0.3

## 2.0.2

### Patch Changes

- [#56](https://github.com/Pom4H/tsops/pull/56) [`2a27a35`](https://github.com/Pom4H/tsops/commit/2a27a35ce6cbe773c3ad1cc17ccc477514f6fd3f) Thanks [@arhebs](https://github.com/arhebs)! - Escape shell-sensitive SQL in built-in PostgreSQL drop-schema jobs so dollar-quoted
  guards run correctly through `/bin/sh -c`.
- Updated dependencies [[`2a27a35`](https://github.com/Pom4H/tsops/commit/2a27a35ce6cbe773c3ad1cc17ccc477514f6fd3f)]:
  - @tsops/core@2.0.2
  - @tsops/node@2.0.2

## 2.0.1

### Patch Changes

- [#53](https://github.com/Pom4H/tsops/pull/53) [`93cb495`](https://github.com/Pom4H/tsops/commit/93cb4951643cd8d68e418a101670d5c7100d5b9f) Thanks [@arhebs](https://github.com/arhebs)! - Complete the PR preview overlay contract by copying configured app secrets into
  overlay namespaces and report the CLI version from the published package
  metadata.
- Updated dependencies [[`93cb495`](https://github.com/Pom4H/tsops/commit/93cb4951643cd8d68e418a101670d5c7100d5b9f)]:
  - @tsops/core@2.0.1
  - @tsops/node@2.0.1

## 2.0.0

### Major Changes

- [#47](https://github.com/Pom4H/tsops/pull/47) [`b7895b3`](https://github.com/Pom4H/tsops/commit/b7895b363e3a4b89824da7f7e54d1ae0dee13cb9) Thanks [@Pom4H](https://github.com/Pom4H)! - feat: preview/overlay namespaces (RFC 0001)

  Adds first-class support for ephemeral preview namespaces (e.g. one per pull
  request) on top of the existing static namespace model.

  - New `OverlayNamespaceDefinition` form: `extends`, `naming(vars)`,
    `domain(vars)`, `fallback`, optional `cert` and `database`.
    `NamespaceDefinition` is now a discriminated union — see
    `isOverlayNamespace` for the type guard.
  - New CLI commands: `tsops up <ns> --var key=value [--include a,b]
[--apps-from-changes]` and `tsops down <ns> --var key=value`.
  - Apps not in `--include` are emitted as `Service: ExternalName` proxies into
    the overlay's `fallback` namespace, so partial deploys stay routable.
  - Optional per-namespace TLS via certbot DNS-01 (`cert.mode: 'per-namespace'`)
    or shared wildcard reuse (`cert.mode: 'wildcard-shared'`).
  - Optional schema-per-overlay PostgreSQL lifecycle (`database.preDeploy` /
    `postDestroy`).

  Existing static-namespace configs are unaffected; the union widening is the
  reason for the major bump on `@tsops/core` / `tsops`.

### Patch Changes

- Updated dependencies [[`b7895b3`](https://github.com/Pom4H/tsops/commit/b7895b363e3a4b89824da7f7e54d1ae0dee13cb9)]:
  - @tsops/core@2.0.0
  - @tsops/node@2.0.0

## 1.9.0

### Minor Changes

- [#37](https://github.com/Pom4H/tsops/pull/37) [`f3d77f7`](https://github.com/Pom4H/tsops/commit/f3d77f7d39738b3ebbdecb99ec564d1acd2bd5bd) Thanks [@Pom4H](https://github.com/Pom4H)! - Add explicit app dependencies via `app.needs`.

  ```ts
  apps: {
    web:  { needs: ['api'] },
    api:  { needs: ['db'] },
    db:   { /* ... */ }
  }
  ```

  Declaring dependencies gives you three things:

  1. **Validation at plan time.** Unknown apps, self-references, cycles, and dependencies excluded from the current namespace are errors — the planner throws with a summary of what's wrong.
  2. **Topological ordering.** `plan.entries` comes out sorted per namespace; dependencies appear before their dependents. Independent apps keep their declaration order.
  3. **Introspection.** `plan.dependencies[namespace]` exposes the resolved `graph` (nodes + edges) and the computed `order` for anyone building diagrams or custom deploy logic.

  Standalone primitives are exported for reuse: `buildGraph`, `topoSort`, `validateDependencies`, and the `DependencyGraph` / `DependencyEdge` / `DependencyError` types.

  This is purely declarative ordering; tsops does not currently wait for readiness between deploys.

- [#35](https://github.com/Pom4H/tsops/pull/35) [`403319f`](https://github.com/Pom4H/tsops/commit/403319fb69715bdb6a6e7b77870bde18e6f93d77) Thanks [@Pom4H](https://github.com/Pom4H)! - Add `defineDockerfileBuild(defaults)` helper: a factory that removes the boilerplate of repeating `context` / `platform` / `env` / `args` across every app's `build` block. Each app only supplies its Dockerfile path (and optional per-app overrides, which shallow-merge into the defaults).

- [#34](https://github.com/Pom4H/tsops/pull/34) [`416dace`](https://github.com/Pom4H/tsops/commit/416dacecd5143699ac32e79fb936b9375e8353fe) Thanks [@Pom4H](https://github.com/Pom4H)! - Composable app env: accept arrays of env sources and multiple `envFrom` refs.

  `app.env` may now be an array mixing plain records, `secret(...)` / `configMap(...)` refs (applied as `envFrom`), and resolver functions. Entries are merged left-to-right; duplicate keys follow last-wins.

  ```ts
  env: ({ secret, configMap, url }) => [
    secret("common-secrets"), // envFrom
    configMap("shared-config"), // envFrom
    { NODE_ENV: "production" }, // plain record
    ({ project }) => ({ PROJECT: project }),
    { API_URL: url("api", "service") },
  ];
  ```

  The deployment builder now emits one `envFrom` entry per ref, so combining several secrets and configMaps in a single app works correctly. Resolver functions can themselves return arrays; nested arrays are flattened.

  Internally `resolveEnv` now returns `ResolvedEnv = { env, envFrom }` and `PlanEntry.envFrom` is always populated (empty array when none). The k8 `ManifestBuilderContext.env` narrows to `Record<string, unknown>` and gains `envFrom?: Array<SecretRef|ConfigMapRef>`.

- [#28](https://github.com/Pom4H/tsops/pull/28) [`855c825`](https://github.com/Pom4H/tsops/commit/855c825a7fd190c790766f3cc3d98164cdfa99f1) Thanks [@Pom4H](https://github.com/Pom4H)! - Networking rework: correct `servicePort` vs `targetPort` semantics, runtime-aware URLs, named-port selection.

  **What changed**

  - `url(app, 'service')` now uses the k8s Service port (`servicePort`), not the container port. Default ports (`:80` / `:443`) are omitted.
  - New `namespace.runtime: 'kubernetes' | 'docker' | 'local'` controls how service URLs resolve:
    - `kubernetes` (default): `http://<app>` using `servicePort`.
    - `docker`: `http://<app>:<targetPort>` for docker-compose networking.
    - `local`: `http://localhost:<localPort ?? targetPort>`.
      Legacy `local: true` is a shorthand for `runtime: 'local'`.
  - New `ServicePort.localPort` lets multiple services coexist on localhost with distinct ports.
  - `DNSType` gains `'cluster'`: `dns(app, 'cluster')` → `app.ns.svc.cluster.local`.
  - New helpers on both app context and the `defineConfig` result: `servicePort(app, portName?)`, `targetPort(app, portName?)`, `listenPort(app, portName?)`. `url()` accepts `{ port: 'metrics' }` for named-port selection.
  - Port normalization (`"80:3000"` shorthand, `targetPort` fallback, named target ports) is now centralized in `@tsops/core` and re-exported from `tsops` as `normalizePort` / `normalizePorts` / `pickPort`.
  - Fixed: explicit `ingress.protocol` was silently discarded by operator-precedence bug in protocol auto-detection.

  **Migration**

  - Service URLs under a `kubernetes`-runtime namespace drop the container port. If you were relying on `url('api', 'service')` returning `http://api:3000`, either switch the namespace to `runtime: 'docker'` or use `targetPort(app)` directly.
  - Local-dev namespaces keep working: `local: true` continues to resolve to `localhost:<targetPort>`. Set `localPort` on a `ServicePort` to override per service.

- [#36](https://github.com/Pom4H/tsops/pull/36) [`6245db0`](https://github.com/Pom4H/tsops/commit/6245db0c0b7c07240c49fa11a30a2129f1960634) Thanks [@Pom4H](https://github.com/Pom4H)! - Add sensitive-env validation hook.

  Opt in via `validation.sensitiveEnv` on the root config:

  ```ts
  validation: {
    sensitiveEnv: { mode: 'warn', allowKeys: ['NEXT_PUBLIC_SENTRY_KEY'] }
  }
  ```

  The planner now scans:

  - `DockerfileBuild.env` — build-time env bakes into image layers, so any key matching `/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|KEY/i` with a plain-string value is flagged.
  - Resolved runtime env — same pattern, but values backed by `secret(...)` / `configMap(...)` references are safe and skipped.

  Modes: `off` (disabled), `warn` (default — findings returned on `plan.warnings`), `error` (throws an aggregated error on plan).

  `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` prefixes are allow-listed by default for frontend public vars. Override with `allowPrefixes` / `allowKeys` / `pattern`.

  Exports added: `scanBuildEnv`, `scanRuntimeEnv`, `enforceMode`, and the `SensitiveEnvConfig` / `SensitiveEnvFinding` types.

### Patch Changes

- Updated dependencies [[`f3d77f7`](https://github.com/Pom4H/tsops/commit/f3d77f7d39738b3ebbdecb99ec564d1acd2bd5bd), [`403319f`](https://github.com/Pom4H/tsops/commit/403319fb69715bdb6a6e7b77870bde18e6f93d77), [`416dace`](https://github.com/Pom4H/tsops/commit/416dacecd5143699ac32e79fb936b9375e8353fe), [`855c825`](https://github.com/Pom4H/tsops/commit/855c825a7fd190c790766f3cc3d98164cdfa99f1), [`6245db0`](https://github.com/Pom4H/tsops/commit/6245db0c0b7c07240c49fa11a30a2129f1960634)]:
  - @tsops/core@1.9.0
  - @tsops/node@1.9.0

## 1.8.0

### Minor Changes

- [#24](https://github.com/Pom4H/tsops/pull/24) [`5e9f244`](https://github.com/Pom4H/tsops/commit/5e9f2441ab4ace09c271ad13fe97e9fc991f0630) Thanks [@Pom4H](https://github.com/Pom4H)! - ## Features

  ### 🎯 Explicit Local Development Mode

  Added explicit `local: boolean` flag to namespace configuration for clearer local development semantics.

### Patch Changes

- Updated dependencies [[`5e9f244`](https://github.com/Pom4H/tsops/commit/5e9f2441ab4ace09c271ad13fe97e9fc991f0630)]:
  - @tsops/core@0.9.0
  - @tsops/node@0.2.8

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
