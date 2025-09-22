# TsOps

TsOps is a TypeScript-first operations toolkit that lets you describe build, test, and deployment pipelines as code and run them through a tiny CLI. It was designed for small platform teams that want a stateless alternative to heavyweight GitOps stacks while keeping the deployment story programmable and testable.

## Features

- Plain TypeScript configuration for services, environments, pipelines, hooks, and notifications
- First-class Kubernetes support: manifest rendering helpers, kubectl apply/diff/rollout, ingress autowiring
- Optional auto-installation of ingress controllers and self-signed TLS automation per-environment
- Build/test/deploy pipelines share common Git metadata (branch, SHA, tag, dirty state)
- Extensible architecture with pluggable command executor, manifest renderer, ingress/TLS services, and notification dispatcher
- Batteries-included CLI with diff and dry-run workflows, environment overrides, and hook support

## Installation

```bash
pnpm add tsops
```

The CLI is published as a binary named `tsops`. After installing it locally you can run it with `pnpm tsops ...` or add it to your project scripts.

> **Prerequisites:** Node.js 22+

## Quick Start

1. Create `tsops.config.ts` in the root of your repo:

```ts
import type { TsOpsConfig } from 'tsops';

const config: TsOpsConfig = {
  project: {
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    defaultBranch: 'main',
  },
  environments: {
    dev: {
      cluster: { apiServer: 'https://k8s.dev.example.com', context: 'dev' },
      namespace: 'demo-dev',
      imageTagStrategy: { type: 'gitSha', length: 7 },
      ingressController: { type: 'traefik', autoInstall: true },
      tls: { selfSigned: { enabled: true } },
    },
  },
  services: {
    api: {
      containerImage: 'ghcr.io/example/api',
      defaultEnvironment: 'dev',
      manifests: ({ image, env }) => [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'api', namespace: env.namespace },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 'api' } },
            template: {
              metadata: { labels: { app: 'api' } },
              spec: {
                containers: [{ name: 'api', image, ports: [{ containerPort: 8080 }] }],
              },
            },
          },
        },
      ],
    },
  },
  pipeline: {
    build: {
      run: async ({ exec, env, service, git }) => {
        await exec(
          `docker build -t ${service.containerImage}:${git.shortSha} .`,
          { env },
        );
      },
    },
    test: { run: async ({ exec }) => exec('pnpm test') },
    deploy: {
      run: async ({ kubectl, environment, manifests }) => {
        await kubectl.apply({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests,
        });
      },
      diff: async ({ kubectl, environment, manifests }) =>
        kubectl.diff({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests,
        }),
    },
  },
  secrets: { provider: { type: 'vault', connection: {} }, map: {} },
  notifications: {
    channels: {},
    onEvents: {},
  },
};

export default config;
```

2. Run your first build:

```bash
pnpm tsops build api
```

3. Ship a deployment diff:

```bash
pnpm tsops deploy api --diff-only
```

## CLI Usage

```bash
pnpm tsops --help
```

Key commands:

- `tsops build <service>` – run the build pipeline. Options: `-e, --environment`, repeated `--env KEY=VALUE` overrides.
- `tsops test` – execute the shared test pipeline.
- `tsops deploy <service>` – run the deploy pipeline. Options: `--diff`, `--diff-only`, `--skip-hooks`, `--no-notify`, `--image-tag`.

Global options:

- `-c, --config` – path to a config file (TypeScript or JavaScript). Defaults to `tsops.config.ts`.

Configs written in TypeScript are compiled on the fly by the locally-installed TypeScript compiler. Add it to your project (`pnpm add -D typescript`) or precompile the config to JavaScript. Plain JavaScript configs work as `.js`, `.cjs`, or `.mjs`. Bun and Deno can execute `.ts` configs directly without any extra setup.

## Programmatic API

The CLI is a thin wrapper around the `TsOps` class. You can embed it directly inside scripts or tests:

```ts
import { TsOps } from 'tsops';
import config from './tsops.config';

const tsops = new TsOps(config, {
  cwd: process.cwd(),
  logger: console,
});

await tsops.build('api');
await tsops.deploy('api', 'dev', { diff: true });
```

Optional constructor overrides:

- `exec`: provide your own command runner (defaults to the built-in `CommandExecutor`).
- `kubectl`: supply a custom `KubectlClient` implementation.
- `logger`: hook into logs.
- `notificationDispatcher`: reroute notifications (Slack, email, etc.).

## Configuration Primer

- **Services** – define container images, manifests, environment overrides, ingress routes, and dependencies.
- **Environments** – encode cluster context, namespace, image tagging strategy, ingress controller preferences, and TLS settings.
- **Pipeline** – async `build`, `test`, and `deploy` runners receive shared Git metadata, environment info, and helpers.
- **Hooks** – optional `beforeDeploy`, `afterDeploy`, and `onFailure` hooks run with `exec` + `kubectl` access.
- **Notifications** – configure channels and routing for `deploySuccess` / `deployFailure` (or any custom events).
- **Secrets** – declare secret providers and key mappings to hydrate your pipelines.

A detailed reference for every shape lives in [`src/types.ts`](src/types.ts).

## Architecture

Internally the library is split into focused services so you can swap pieces without touching the orchestration layer:

- `CommandExecutor` – spawns shell commands and captures output.
- `GitMetadataProvider` – resolves branch/SHA/tag with graceful fallbacks.
- `ManifestRenderer` & `IngressBuilder` – compose workload manifests and inject ingress definitions when needed.
- `IngressControllerInstaller` – idempotently bootstraps controllers such as Traefik per environment.
- `SelfSignedTlsManager` – provisions self-signed TLS secrets for ingress hosts when requested.
- `createDefaultKubectlClient` – wraps kubectl apply/diff/rollout/exec operations.

`TsOps` wires these components together so your config remains the single source of truth.

## Development

```bash
pnpm install
pnpm build      # compile TypeScript to dist/
pnpm test       # run the Vitest suite
pnpm typecheck  # ensure types compile without emitting
```

The repo uses pnpm workspaces and Vitest for fast iteration. Running `pnpm test --watch` will execute the spec suite in watch mode.

## Contributing

1. Fork and clone the repository.
2. Create a feature branch and make your changes.
3. Ensure `pnpm test` and `pnpm typecheck` pass.
4. Submit a pull request describing the change and any new configuration contracts.

All contributions are welcome—from docs and examples to new pipeline helpers. File an issue if you discover a bug or need a new deployment capability.

## License

MIT © Roman Popov
