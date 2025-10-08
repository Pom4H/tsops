# @tsops/node

Node-specific adapters and helpers for `tsops`. This package implements the `DockerClient` and `KubectlClient` ports exposed by `@tsops/core` and provides convenience factories for Node runtimes.

## What’s Included

- `createNodeTsOps` – wires the default Node adapters together (command runner, Docker, kubectl, Git-aware environment provider).
- `DefaultCommandRunner` – thin wrapper around `child_process.spawn` with promise-based ergonomics.
- `Docker` – executes `docker login/build/push`, honouring `dryRun`.
- `Kubectl` – applies/diffs/deletes manifests, batches resources, and reads secrets from the cluster.
- `ProcessEnvironmentProvider` & `GitEnvironmentProvider` – enrich environment lookups with Git metadata, used by default image tag strategies.
- `Git` helper – exposes raw Git metadata queries when you need them directly.

## Usage

```ts
import { createNodeTsOps } from '@tsops/node'
import config from './tsops.config.js'

const tsops = createNodeTsOps(config, { dryRun: true })

await tsops.planWithChanges({ namespace: 'prod' })
```

If you need custom behaviour (e.g., mocking Docker in tests), instantiate `TsOps` from `@tsops/core` and provide your own `DockerClient`/`KubectlClient` implementations, reusing pieces from this package as needed.
