# tsops roadmap

_Last reviewed: September 2026_

## Mission

Make the application graph of a TypeScript monorepo executable from a developer's worktree to Kubernetes production.

The product succeeds when application identity, connectivity, image provenance, preview policy, and deployment intent do not have to be re-described in unrelated files.

## Current foundation

Version 2.1 establishes the useful end-to-end boundary:

- typed `tsops.config.ts` with runtime-aware URL helpers;
- local process orchestration through Portless with stable, worktree-isolated routes;
- affected-application build filtering;
- source-key image reuse and BuildKit registry cache;
- immutable image-digest handoff from build to deploy;
- Kubernetes planning, validation, diff reporting, and managed-orphan cleanup;
- parameterized preview namespaces with selective application deployment;
- preview fallbacks through `ExternalName` Services;
- optional TLS, access, resource-policy, and PostgreSQL schema lifecycle hooks.

The next phase is consolidation, not surface-area expansion.

## Now

### 1. Make the graph inspectable

Add one stable machine-readable representation of the resolved application graph. Human CLI output, CI decisions, IDE tooling, and coding agents should consume the same structure.

Candidate interface:

```bash
tsops inspect --namespace production --format json
```

The output should include resolved applications, dependencies, build inputs, images, ports, endpoints, namespace runtime, and validation diagnostics. It must be versioned and deterministic.

### 2. Harden preview lifecycle

Focus on the operational edges that decide whether previews can be trusted:

- explicit readiness and timeout semantics;
- idempotent retries after interrupted hooks;
- concurrency protection for duplicate pull-request jobs;
- failure-safe cleanup reporting;
- clear ownership of copied and generated Secrets;
- structured output for CI comments and cleanup automation.

### 3. Complete build-to-deploy provenance

Make immutable image handoff the normal CI path:

- a first-class JSON result from `tsops build`;
- provenance metadata for source-key decisions;
- explicit cache-hit and rebuild reasons;
- deploy verification that the planned digest is the applied digest;
- examples for common monorepo CI layouts.

### 4. Keep documentation executable

Every public workflow must have one maintained example. Documentation builds in CI, dead links fail the build, and examples should be validated against the current types whenever practical.

## Next, when demanded by real usage

### Optional remote Kubernetes development mode

Tilt, Skaffold, Garden, and DevSpace already provide mature remote-cluster iteration. tsops should add this only where the typed application graph creates a clear advantage.

A credible first slice would reuse existing build inputs and dependency metadata to provide:

- watch mode for affected applications;
- explicit `sync`, `rebuild`, or `ignore` strategies per application;
- stable status output for humans and agents;
- no second topology file.

This is not a commitment to reproduce every live-update feature of established tools.

### IDE integration

After the inspectable graph exists, a thin language-server or editor extension can provide application navigation, endpoint previews, dependency graphs, and diagnostics. The compiler and CLI remain the source of truth.

## Not planned

### Shallow provider adapters

No `@tsops/vercel`, `@tsops/fly`, `@tsops/cloud-run`, or similar packages while Kubernetes is the product boundary. Those platforms have different primitives; forcing them behind a common adapter would weaken the model before there is evidence that users need it.

### Cluster and cloud provisioning

tsops will not become a Terraform or Pulumi replacement. Clusters, networks, accounts, managed databases, and shared operators remain upstream infrastructure.

### A standalone AI skill package

Agent support should come from deterministic commands, structured output, concise repository instructions, and compiler-visible relationships. A large duplicated instruction bundle is not a durable product moat. A small generated integration can be reconsidered after the machine-readable graph is stable.

### A hosted control plane

A dashboard, SaaS state backend, or proprietary deployment service is not justified before the open-source delivery loop has repeat users.

## Decision filters

A proposed feature belongs in tsops when it satisfies most of these:

1. It removes a duplicate description of the product application graph.
2. It improves continuity between local, preview, and Kubernetes runtimes.
3. It can be deterministic and testable without a hosted service.
4. It improves reviewability for both humans and automation.
5. It is difficult to express cleanly by composing an existing focused tool.

A feature does not belong merely because it can be written in TypeScript.

## Success signals

- A new monorepo can reach its first stable local route in under ten minutes.
- A pull request can create and destroy a selective preview without custom shell orchestration.
- CI can explain why each image was reused or rebuilt and deploy exact digests.
- Renaming an application produces compiler or plan diagnostics instead of a runtime networking failure.
- Documentation and examples remain link-clean and version-correct on every merge.
- Multiple independent projects use the same core workflow before another deployment target is considered.
