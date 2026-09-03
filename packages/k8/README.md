# @tsops/k8

Deterministic Kubernetes resource builders and generated API types used by tsops.

Most projects should use the `tsops` package and its application graph. Use `@tsops/k8` directly only when extending or testing the manifest layer.

## Responsibilities

- build Kubernetes objects from already resolved application and namespace data;
- keep names, labels, selectors, ports, and ownership metadata consistent;
- provide typed resource shapes without performing external I/O;
- expose pure builders that can be tested without a cluster.

## Resource coverage

The package contains builders and related types for resources used by the current delivery workflows, including:

- Deployments;
- Services and `ExternalName` fallback Services;
- standard Ingress resources;
- Traefik IngressRoute and Middleware resources;
- cert-manager Certificates;
- Jobs used by overlay lifecycle hooks;
- ResourceQuota and LimitRange policy;
- supporting Secret and ConfigMap shapes.

`ManifestBuilder` composes application resources, while focused builders handle lifecycle and namespace-level objects.

## Purity contract

Builders must not invoke `kubectl`, read environment variables, inspect a registry, or decide product policy. They receive resolved data and return serializable Kubernetes objects.

```ts
const resources = manifestBuilder.build(appName, resolvedContext)
```

For equal inputs, the result must be equal. Cluster diff and apply behavior belongs to `@tsops/node`; selection and policy belong to `@tsops/core`.

## Generated Kubernetes types

The package generates TypeScript declarations from the Kubernetes OpenAPI schema. The generation script is intentionally separate from normal builds:

```bash
pnpm --filter @tsops/k8 build
pnpm --filter @tsops/k8 generate:k8s-types
```

Review generated diffs and compatibility before committing a schema refresh.

## Development

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

See the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for dependency direction and the public [API overview](../../docs/api/index.md) for application-level configuration.
