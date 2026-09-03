# AGENTS.md

Instructions for coding agents working in `Pom4H/tsops`.

## Product contract

**tsops is typed application delivery for TypeScript monorepos on Kubernetes.**

The central artifact is one `tsops.config.ts` application graph reused by local development, image builds, previews, Kubernetes delivery, and runtime endpoint helpers.

Do not broaden the project into generic cloud infrastructure, shallow provider adapters, or a second workflow engine. Read [`ROADMAP.md`](ROADMAP.md) before proposing a new product surface.

## Repository map

```text
packages/core   domain model, config resolvers, operations, external-effect ports
packages/node   Node.js adapters for Git, Docker, kubectl, and commands
packages/k8     pure Kubernetes manifest builders and resource types
packages/cli    published tsops package and CLI presentation
examples        maintained application-graph fixtures
docs            VitePress user documentation
tests           cross-package behavior and type tests
```

Dependency direction:

```text
@tsops/k8 <- @tsops/core <- @tsops/node <- tsops CLI
```

`core` must not import Node.js I/O. The CLI must not be the only place where a domain rule exists.

## Toolchain

- Node.js 24+
- pnpm 10 through Corepack
- TypeScript 6 with strict project references
- Turborepo
- Biome for repository linting and formatting
- Vitest
- Changesets

## Start every task

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
```

If the baseline fails, report the existing failure before changing behavior. Do not silently weaken a check.

Then read the closest relevant files, tests, example, and documentation. Do not infer the current API from an old issue or pull request.

## Domain invariants

- Names are deterministic from explicit graph inputs.
- Application and namespace keys should remain literal in public TypeScript APIs.
- `url()` and `dns()` express semantic endpoints; the namespace runtime selects the reachable form.
- `local`, `docker`, and `kubernetes` runtimes use the same application identities.
- Secrets are referenced and validated; unresolved or placeholder values must fail closed.
- Deploy-time image overrides must be immutable digest references.
- Overlay variables are validated before cluster mutations.
- Preview fallbacks must remain explicit and inspectable.
- Managed orphan cleanup is label-scoped and visible in plan output.
- Domain operations return structured results before the CLI formats them.
- New behavior must not require a parallel topology file.

## Implementation rules

### Core

Prefer pure transformations and dependency-injected ports. Avoid new `any`, unsafe casts, runtime reflection, and hidden process-global access in public or core code. Model domain errors so callers can act on them.

### Node adapters

Keep subprocess, filesystem, Docker, Git, registry, and `kubectl` behavior here. Include command context in errors without leaking secrets.

### Kubernetes builders

Builders are deterministic and side-effect free. Keep names and labels consistent with the core resolver. Do not embed environment-specific policy unless it is an explicit graph field.

### CLI

The CLI owns parsing, human formatting, process signals, and exit codes. Every mutating command needs a dry-run or plan boundary where technically possible. Machine-readable output should be based on core result types, not scraped human text.

### Documentation and examples

A public workflow needs one maintained example. Link to source fixtures instead of copying large configurations. Documentation links must build without `ignoreDeadLinks`.

## Definition of done

A change is complete only when the relevant items are present:

1. Domain behavior and public types.
2. Unit tests and type-level assertions for valid and invalid cases.
3. Adapter tests around external effects.
4. Stable CLI exit behavior and actionable errors.
5. A maintained example or user guide.
6. Deterministic names, manifests, endpoints, and outputs.
7. A Changeset for published behavior.
8. All repository checks pass.

Use a Changeset for public package behavior:

```bash
pnpm changeset
```

Do not manually improvise package versions or release tags.

## Useful validation commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build

pnpm tsops plan --config examples/fullstack/tsops.config.ts --dry-run
pnpm tsops build --config examples/monorepo/tsops.config.ts --dry-run
pnpm tsops up preview \
  --config examples/preview-namespaces/tsops.config.ts \
  --var pr=42 \
  --include worken-front \
  --dry-run
```

Cluster-dependent behavior should be covered through fake ports where possible. Never run a real deploy merely to discover whether a pure transformation works.

## Product decision heuristic

A feature belongs when it removes duplicated application topology, improves continuity across local/preview/Kubernetes runtimes, and can be deterministic and inspectable.

A feature does not belong merely because it can be expressed in TypeScript or wrapped in an adapter.

Agent support should come from clear contracts, compiler-visible relationships, structured CLI data, tests, and this file. Do not duplicate the documentation into a large standalone AI-skill package.

## Before opening a pull request

- Review the diff for accidental generated files, credentials, and stale copied examples.
- Re-run all four required checks.
- State what changed, why it belongs inside the product boundary, and which behavior remains intentionally unsupported.
- Leave the repository simpler and more internally consistent than you found it.
