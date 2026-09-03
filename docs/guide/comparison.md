# How tsops compares

This page describes product boundaries, not a benchmark. The ecosystem snapshot was reviewed in **September 2026**.

## The short distinction

Most neighboring tools start from one of four abstractions:

1. **Manifests** — Helm, Kustomize, cdk8s.
2. **A Kubernetes development loop** — Tilt, Skaffold, Garden, DevSpace.
3. **Cloud resources** — Pulumi, Terraform, OpenTofu.
4. **A cloud application framework** — SST, Nitric.

tsops starts from a fifth: **the containerized product application graph**. It keeps application identity, builds, ports, dependencies, local routes, preview topology, Kubernetes workloads, and runtime endpoint lookup in one TypeScript model.

## Comparison table

| Approach | Primary job | Stronger than tsops at | What tsops adds |
| --- | --- | --- | --- |
| Helm / Kustomize | Package and transform Kubernetes manifests | Ecosystem breadth, arbitrary Kubernetes configuration, operator familiarity | A typed model shared with local processes, builds, previews, and application runtime |
| cdk8s | Synthesize Kubernetes YAML from general-purpose languages | Programmatic authoring of arbitrary Kubernetes resources and reusable constructs | Build/deploy operations, local topology, preview lifecycle, runtime service discovery |
| Tilt / Skaffold | Tight inner loop against Kubernetes | Mature remote file sync, live update, logs, port forwarding, cluster development UX | A TypeScript application contract that also owns CI builds, selective previews, and runtime endpoints |
| Garden / DevSpace | Developer environments and Kubernetes workflows | Rich action graphs, remote development workflows, sync/tunnel features | A smaller application-first model with compiler-visible app names and fewer configuration layers |
| Pulumi | Provision cloud and Kubernetes resources as code | Providers, state management, cloud infrastructure, policy, organization features | A deliberately narrower delivery loop for apps already targeting Kubernetes |
| SST | Define and run full-stack applications on cloud providers | AWS/Cloudflare resources, managed-cloud integration, polished typed linking | A Kubernetes-native container and namespace model with selective overlay environments |
| Score | Portable workload specification between developers and platforms | Platform-agnostic workload handoff and implementation neutrality | An executable TypeScript graph with build, plan, deploy, preview, and runtime APIs |

## What changed in the ecosystem

The 2026 direction is consistent:

- **Pulumi and SST** continue to invest in state visibility, diffs, typed resource linking, and workflows that are easier for both humans and agents to inspect.
- **Tilt, Skaffold, Garden, and DevSpace** remain deeper than tsops on remote-cluster iteration; recent work has mainly refined sync, watch, forwarding, performance, and reliability.
- **cdk8s** remains an active way to synthesize Kubernetes YAML, but synthesis and delivery are still separate responsibilities.

The conclusion for tsops is not to imitate the breadth of those projects. Its credible wedge is continuity: one application identity from a local worktree through an isolated pull request to Kubernetes production.

## Choose tsops when

- your product is a TypeScript monorepo with multiple containerized applications;
- Kubernetes is the deployment target rather than one of many hypothetical targets;
- local host names, CI image selection, preview environments, Services, and application URLs currently drift across files;
- you want affected-build filtering and exact source-key image reuse;
- you want pull-request environments that can deploy only changed applications;
- application code should resolve endpoints from the same typed model used by delivery tooling.

## Choose another tool when

### Choose Helm or Kustomize

Use them when manifests themselves are the product, when a platform team distributes charts to many unrelated applications, or when you need unrestricted access to every Kubernetes API shape.

### Choose cdk8s

Use it when the main goal is a general Kubernetes authoring SDK and you are happy to keep image builds, local development, deploy orchestration, and runtime configuration elsewhere.

### Choose Tilt or Skaffold

Use them when remote-cluster live update, file synchronization, logs, and port forwarding dominate the developer workflow. tsops may add a remote development mode later, but it should not pretend to match their current depth.

### Choose Garden or DevSpace

Use them when a broad workflow engine or a complete remote development environment is more important than a compact TypeScript application model.

### Choose Pulumi, Terraform, or OpenTofu

Use them to provision clusters, networks, databases, accounts, identity, and managed services. tsops intentionally begins after that infrastructure exists.

### Choose SST

Use it when AWS or Cloudflare resources are part of the application model and a Kubernetes/container boundary would be artificial.

## Can they be combined?

Yes. A practical split is:

```text
Pulumi / Terraform / OpenTofu
  provision cluster, network, registry, managed databases, identity

Helm
  install shared cluster operators and third-party charts

tsops
  run, build, preview, and deploy the product's own applications
```

That boundary keeps tsops focused and lets mature infrastructure and operator ecosystems do what they already do well.

## Strategic decision

The current positioning is therefore:

> **One typed application graph from localhost to Kubernetes.**

The supporting category is:

> **Typed application delivery for TypeScript monorepos on Kubernetes.**

The old phrase “TypeScript-first Kubernetes toolkit” remains technically true, but it is too broad to explain why tsops should exist. “TypeScript instead of YAML” is an implementation detail, not the product value.
