# @tsops/node

## 2.0.4

### Patch Changes

- Updated dependencies [[`a15012f`](https://github.com/Pom4H/tsops/commit/a15012fd0d8fa545feca85b29377d8f1e9347010)]:
  - @tsops/core@2.0.4

## 2.0.3

### Patch Changes

- Updated dependencies [[`db07cb8`](https://github.com/Pom4H/tsops/commit/db07cb8351220afe6c6e12ae17d6e4548ed1a089)]:
  - @tsops/core@2.0.3

## 2.0.2

### Patch Changes

- Updated dependencies [[`2a27a35`](https://github.com/Pom4H/tsops/commit/2a27a35ce6cbe773c3ad1cc17ccc477514f6fd3f)]:
  - @tsops/core@2.0.2

## 2.0.1

### Patch Changes

- [#53](https://github.com/Pom4H/tsops/pull/53) [`93cb495`](https://github.com/Pom4H/tsops/commit/93cb4951643cd8d68e418a101670d5c7100d5b9f) Thanks [@arhebs](https://github.com/arhebs)! - Complete the PR preview overlay contract by copying configured app secrets into
  overlay namespaces and report the CLI version from the published package
  metadata.
- Updated dependencies [[`93cb495`](https://github.com/Pom4H/tsops/commit/93cb4951643cd8d68e418a101670d5c7100d5b9f)]:
  - @tsops/core@2.0.1

## 2.0.0

### Patch Changes

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

- Updated dependencies [[`b7895b3`](https://github.com/Pom4H/tsops/commit/b7895b363e3a4b89824da7f7e54d1ae0dee13cb9)]:
  - @tsops/core@2.0.0

## 1.9.0

### Patch Changes

- Updated dependencies [[`f3d77f7`](https://github.com/Pom4H/tsops/commit/f3d77f7d39738b3ebbdecb99ec564d1acd2bd5bd), [`403319f`](https://github.com/Pom4H/tsops/commit/403319fb69715bdb6a6e7b77870bde18e6f93d77), [`416dace`](https://github.com/Pom4H/tsops/commit/416dacecd5143699ac32e79fb936b9375e8353fe), [`855c825`](https://github.com/Pom4H/tsops/commit/855c825a7fd190c790766f3cc3d98164cdfa99f1), [`6245db0`](https://github.com/Pom4H/tsops/commit/6245db0c0b7c07240c49fa11a30a2129f1960634)]:
  - @tsops/core@1.9.0

> Historical note: releases `1.0.0` through `1.8.0` are not yet backfilled in this changelog.
> The entries below are retained from the earlier `0.2.x` release history so consumers can still
> trace older changes until the missing `1.x` entries are added.

## 0.2.8

### Patch Changes

- Updated dependencies [[`5e9f244`](https://github.com/Pom4H/tsops/commit/5e9f2441ab4ace09c271ad13fe97e9fc991f0630)]:
  - @tsops/core@0.9.0

## 0.2.7

### Patch Changes

- Updated dependencies [[`3807ec3`](https://github.com/Pom4H/tsops/commit/3807ec3b930809233eee232297cd78a7de65191e), [`5e9f244`](https://github.com/Pom4H/tsops/commit/5e9f2441ab4ace09c271ad13fe97e9fc991f0630)]:
  - @tsops/core@0.8.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`fa30ffc`](https://github.com/Pom4H/tsops/commit/fa30ffcd05880a1744a6bd6cdd9b12712da654af)]:
  - @tsops/core@0.7.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`3143e09`](https://github.com/Pom4H/tsops/commit/3143e092ffce4c10466f0b14e592a5ecfe0f5b25)]:
  - @tsops/core@0.6.1

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @tsops/core@0.6.0

## 0.2.3

### Patch Changes

- feat: add image existence check before build and force rebuild flag

  - Add `imageExists()` method to DockerClient to check if image already exists in registry using `docker manifest inspect`
  - Build process now automatically skips building images that already exist in the registry
  - Add `--force` (`-f`) flag to CLI build command to force rebuild even if image exists
  - Add `force` option to `build()` method in TsOps API
  - Improves CI/CD efficiency by avoiding unnecessary rebuilds of existing images

- Updated dependencies []:
  - @tsops/core@0.5.2

## 0.2.2

### Patch Changes

- Updated dependencies [[`d1653e0`](https://github.com/Pom4H/tsops/commit/d1653e01fb7749cb965e8b7d9b3fc42ac9fbd52e)]:
  - @tsops/core@0.5.1

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @tsops/core@0.5.0

## 0.2.0

### Minor Changes

- [`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3) Thanks [@Pom4H](https://github.com/Pom4H)! - Published a dedicated `tsops/cli` entry point so command-line tooling can keep using Node built-ins without affecting bundlers

### Patch Changes

- Updated dependencies [[`470b2cb`](https://github.com/Pom4H/tsops/commit/470b2cb3f970198ddf8a7d0793fcfdcebb2634e3)]:
  - @tsops/core@0.4.1
