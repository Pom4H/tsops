# @tsops/node

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
