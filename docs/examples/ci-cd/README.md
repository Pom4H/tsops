# CI/CD examples

This directory contains GitHub Actions templates for TypeScript monorepos that use tsops.

- [`build-changed-apps.yml`](./build-changed-apps.yml) demonstrates verification, affected image builds, selective pull-request previews, cleanup on close, and production delivery.
- [`turborepo-integration.yml`](./turborepo-integration.yml) shows how Turborepo package tasks and tsops application-image selection complement each other.

The files are templates, not drop-in production credentials. Copy one into `.github/workflows/`, then adapt repository paths, registry authentication, Kubernetes authentication, namespaces, and GitHub environments.

## Requirements

- Node.js 24 and Corepack;
- full Git history through `actions/checkout` with `fetch-depth: 0`;
- registry credentials for `tsops build`;
- a configured Kubernetes context for real plan, preview, and deploy jobs;
- protected GitHub environments for preview and production cluster credentials.

Prefer short-lived OIDC credentials over a long-lived kubeconfig stored as a repository Secret.

## Affected application selection

`tsops build --filter <git-ref>` compares changed files with each application's `build.inputs`. When explicit inputs are absent, selection falls back to the build context.

```bash
pnpm tsops build --filter origin/main --source-key
```

This has two independent optimization layers:

1. affected-app filtering skips applications whose owned inputs did not change;
2. source-key reuse skips an exact Docker build when an equivalent image already exists.

BuildKit registry cache can still accelerate a build that is necessary.

A precise application definition might look like:

```ts
apps: {
  api: {
    build: {
      type: 'dockerfile',
      context: 'apps/api',
      dockerfile: 'apps/api/Dockerfile',
      inputs: [
        'apps/api/**',
        'packages/shared/**',
        'pnpm-lock.yaml'
      ],
      sourceKey: true,
      cache: { type: 'registry', mode: 'max' }
    }
  }
}
```

## Choosing the comparison ref

For pull requests, compare with the exact base SHA:

```text
${{ github.event.pull_request.base.sha }}
```

For pushes, compare with the previous event SHA:

```text
${{ github.event.before }}
```

The templates resolve this once and pass it to both build selection and selective preview deployment.

## Pull-request previews

A preview job can materialise an overlay and deploy only affected applications:

```bash
pnpm tsops up preview \
  --var pr=${{ github.event.pull_request.number }} \
  --apps-from-changes \
  --base-ref ${{ github.event.pull_request.base.sha }}
```

The corresponding `pull_request.closed` job should always attempt cleanup:

```bash
pnpm tsops down preview \
  --var pr=${{ github.event.pull_request.number }}
```

Use a concurrency group keyed by pull-request number so a newer update cancels an obsolete preview job.

## Immutable build-to-deploy handoff

The preferred CI boundary is an application-to-digest JSON artifact:

```json
{
  "api": "ghcr.io/acme/orchard/api@sha256:abcd...",
  "web": "ghcr.io/acme/orchard/web@sha256:ef01..."
}
```

An authorized deployment job consumes it with:

```bash
pnpm tsops deploy \
  --namespace production \
  --image-digests @images.json
```

Unknown application names and mutable tags are rejected before apply. Version 2.1 exposes the digest override input; first-class structured build-result output is a roadmap priority.

## Turborepo integration

Turborepo and tsops operate at different layers:

```text
Turborepo
  package task graph, task cache, TypeScript build and test work

tsops
  application graph, container build inputs, image reuse, previews and deploy
```

Both can use the same Git comparison ref without maintaining a second application ownership matrix.

## Validate a copied workflow

Before granting cluster credentials, keep operations side-effect free:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
pnpm tsops plan --namespace production --dry-run
```

Then configure registry and cluster authentication in protected GitHub environments and run a real `tsops plan` before enabling deploy.

## Related documentation

- [Getting started](../../guide/getting-started.md)
- [Preview environments](../../guide/preview-overlays.md)
- [Monorepo example](../monorepo.md)
- [CLI package reference](../../../packages/cli/README.md)
