# What is tsops?

tsops is **typed application delivery for Kubernetes**.

It gives a TypeScript monorepo one application graph that can be interpreted in several environments:

```text
                         ┌─ local processes and stable URLs
                         ├─ affected container builds
  tsops.config.ts ───────┼─ Kubernetes plan and deploy
                         ├─ pull-request overlay lifecycle
                         └─ application runtime URL resolution
```

The graph describes product-level concerns: applications, build inputs, images, ports, dependencies, environment bindings, public routes, namespaces, and preview policy. It does not try to describe an entire cloud account.

## Why an application graph matters

Containerized products commonly describe the same relationship in multiple places:

- a local port in a package script;
- a Service and container port in Kubernetes;
- a host name in an ingress manifest;
- an image path in CI;
- an API URL in application environment variables;
- a separate script for each pull-request environment.

Those files can all be valid independently and still disagree as a system. tsops makes application names and their relationships compiler-visible. A single key such as `api` is used by the build planner, generated manifests, preview routing, local URL map, and runtime helper.

```ts
const config = defineConfig({
  // ...project, namespaces, clusters, images
  apps: {
    api: {
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },
    web: {
      needs: ['api'],
      env: ({ url }) => ({
        API_URL: url('api', 'service')
      })
    }
  }
})

config.url('api', 'service')
```

Renaming or removing the application can now surface through TypeScript rather than through a failed request after deployment.

## One graph, three runtime shapes

Namespaces declare how applications are reached:

| Runtime | Typical use | `url('api', 'service')` resolves to |
| --- | --- | --- |
| `local` | Processes on a developer machine | A Portless URL under `tsops dev`, otherwise a localhost fallback |
| `docker` | Applications sharing a Docker network | The application name and target port |
| `kubernetes` | Preview, staging, production | A Kubernetes Service URL |

The application asks for a semantic endpoint; the active namespace decides its reachable form.

## Delivery primitives

### `tsops dev`

Starts local application processes through Portless. Routes are stable, HTTPS-capable, and automatically isolated by Git worktree. Every child process receives the complete `TSOPS_DEV_URLS` map, and runtime helpers consume that map automatically.

### `tsops plan`

Resolves the graph into Kubernetes resources, validates global and application artifacts, asks `kubectl` for diffs, and reports managed orphans. This is the review boundary before a cluster mutation.

### `tsops build`

Builds selected Docker images. Git-diff filtering limits work to affected applications. Source-key reuse adds a content-derived tag over BuildKit's layer cache and returns an immutable digest when the same build inputs already exist.

### `tsops deploy`

Applies deterministic manifests and removes resources previously managed by tsops but no longer present in the graph. CI may override application images only with validated immutable digest references.

### `tsops up` and `tsops down`

Materialise and destroy parameterized overlay namespaces. A preview may deploy only changed applications while generated `ExternalName` Services route untouched dependencies to a stable base namespace. Optional hooks cover TLS, access control, resource policy, and database isolation.

## What tsops does not own

The boundary is deliberate:

- **Cluster and cloud provisioning:** use Terraform, OpenTofu, Pulumi, Crossplane, or a provider-specific tool.
- **Third-party chart distribution:** use Helm when consuming or publishing a chart is the main requirement.
- **A general Kubernetes authoring SDK:** use cdk8s when synthesizing arbitrary Kubernetes YAML is the goal.
- **A mature remote-cluster live-update loop:** Tilt, Skaffold, Garden, and DevSpace currently go deeper on file synchronization and container replacement.
- **Every deployment platform:** tsops is staying Kubernetes-focused rather than adding shallow adapters for unrelated runtimes.

## Who it is for

tsops is most useful when a team owns a TypeScript monorepo with several containerized applications and wants local development, CI, preview environments, runtime service discovery, and Kubernetes delivery to share one model.

It is a poor fit for a single static site, a team already satisfied with generated Helm values, or an infrastructure repository whose primary job is provisioning cloud resources.

Continue with [Getting started](/guide/getting-started) or review [How tsops compares](/guide/comparison).
