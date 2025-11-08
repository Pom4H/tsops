# @tsops/node

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
