# Preview Overlay Contract

This contract is the authoritative shape for PR-style preview namespaces. Older
issue sketches are examples only; implementation should follow this document and
the fixture in `examples/preview-namespaces/tsops.config.ts`.

## CLI

```bash
tsops up preview --var pr=857
tsops up preview --var pr=857 --image-digests @preview-images.json
tsops down preview --var pr=857
tsops down preview --var pr=857 --keep-database
```

`tsops up` supports `--skip-cert` and `--skip-database` for operator debugging.
Product orchestration should not use those flags for normal previews.

Use `--image-digests` when CI has already built preview images and should deploy
exactly those immutable refs. The file is a JSON object keyed by tsops app name:

```json
{
  "api": "ghcr.io/example/api@sha256:abcd..."
}
```

tsops rejects unknown app keys and mutable tags before planning the rollout.

## Hook Order

For a resolved overlay namespace such as `pr-857`, `tsops up` applies resources
in this order:

1. Namespace.
2. `namespacePolicy` resources (`ResourceQuota`, `LimitRange`).
3. TLS hook (`cert`).
4. Access hook (`access`).
5. Database pre-deploy hook (`database.preDeploy`), awaited before app rollout.
6. App secrets, config maps, workloads, services, and public routes.

`tsops down` runs `database.postDestroy` before deleting the namespace, unless
`--keep-database` is set.

## TLS

`cert.mode = "wildcard-shared"` copies a Kubernetes TLS Secret into the resolved
overlay namespace before public routes are applied.

```ts
cert: {
  mode: 'wildcard-shared',
  secretName: 'staging-wildcard-tls',
  sourceNamespace: 'kube-system',
  copyToOverlayNamespace: true,
}
```

If the source secret is missing, deployment fails with the source namespace and
secret name in the error message.

## Access

`access.mode = "traefik-basic-auth"` copies a hashed htpasswd-style Secret into
the overlay namespace, renders a Traefik `Middleware`, and attaches it to every
public Ingress emitted by tsops.

```ts
access: {
  mode: 'traefik-basic-auth',
  sourceNamespace: 'kube-system',
  secretName: 'preview-basic-auth',
  middlewareName: ({ pr }) => `preview-basic-auth-pr-${pr}`,
  attachTo: 'all-public-routes',
  failClosed: true,
}
```

If `failClosed` is not explicitly `false`, missing or malformed access secrets
fail the deploy before public routes are created.

## Namespace Policy

Every production preview overlay should include conservative namespace policy:

```ts
namespacePolicy: {
  resourceQuota: {
    pods: 25,
    secrets: 50,
    jobs: 20,
    requestsCpu: '4',
    requestsMemory: '8Gi',
    limitsCpu: '8',
    limitsMemory: '16Gi',
    persistentVolumeClaims: 0,
  },
  limitRange: {
    defaultRequestCpu: '100m',
    defaultRequestMemory: '256Mi',
    defaultLimitCpu: '500m',
    defaultLimitMemory: '1Gi',
  },
}
```

These values are initial guardrails; adjust them only after real preview cycle
measurements.

## Database

Database lifecycle credentials and runtime credentials are distinct. The
lifecycle secret is copied only so hook Jobs in the overlay namespace can read
it. App pods should use the generated runtime Secret referenced by
`runtimeSecret`. For `runtimeSecret.mode = "generated-per-overlay"`, tsops
creates the Secret before the database pre-deploy Job and app rollout. If the
Secret already exists with the expected schema and runtime role metadata, tsops
reuses it so redeploys do not rotate the app password.

```ts
database: {
  lifecycleUrlSecret: {
    name: 'staging-db-lifecycle',
    key: 'DATABASE_URL',
    sourceNamespace: 'kube-system',
  },
  runtimeSecret: {
    mode: 'generated-per-overlay',
    name: ({ pr }) => `pr-${pr}-db-app`,
    key: 'DATABASE_URL',
  },
  runtimeRole: ({ pr }) => `worken_pr_${pr}_app`,
  schema: ({ pr }) => `pr_${pr}`,
  preDeploy: {
    mode: 'job',
    name: ({ pr }) => `preview-db-prepare-pr-${pr}`,
    image: `ghcr.io/example/preview-db-prepare:${process.env.GITHUB_SHA}`,
    timeoutSeconds: 600,
    env: ({ seed }) => ({
      PREVIEW_SEED_MODE: seed ?? 'demo',
    }),
    logs: 'tail-on-failure',
  },
  postDestroy: 'drop-schema',
}
```

The Job receives `DATABASE_URL` from the lifecycle secret plus:

- `DATABASE_SCHEMA`
- `TSOPS_OVERLAY_SCHEMA`
- `DATABASE_RUNTIME_SECRET_NAME`
- `DATABASE_RUNTIME_SECRET_KEY`
- `DATABASE_RUNTIME_ROLE`
- `DATABASE_RUNTIME_URL` from the generated runtime Secret
- `DATABASE_RUNTIME_PASSWORD` from the generated runtime Secret
- any values returned from `preDeploy.env(vars)`

`runtimeSecret` also injects `DATABASE_URL` into app plans as a Kubernetes
SecretRef and sets `DATABASE_SCHEMA` and `DATABASE_RUNTIME_ROLE`. The generated
Secret contains the configured runtime URL key plus `DATABASE_PASSWORD`,
`DATABASE_SCHEMA`, and `DATABASE_RUNTIME_ROLE`.

## Runtime Vars

Use `validateVars` for overlay-local policy that must fail closed before any
cluster changes happen. For example, V1 preview configs can reject real vendor
integrations even if an operator invokes raw `tsops`:

```ts
validateVars: ({ integrations }) => {
  if (integrations === 'real') {
    throw new Error('real integrations are not enabled for V1 preview overlays')
  }
}
```
