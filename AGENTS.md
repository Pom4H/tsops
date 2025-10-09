# AGENTS.md — for tsops Developer Agents

## Philosophy
We use **TypeScript as a language of rules** — a foundation for building a **domain-specific DSL** on top of JavaScript (TS 5.9+).  
Types are not annotations; they are **contracts between infrastructure and code**.  
The **core** package defines the invariants — naming, networks, secrets, images — that govern the domain model.  
**tsops** is the **bridge between typed domain logic and real infrastructure**, turning declarative TypeScript into build, plan, and deploy primitives.

## Repository Architecture
This project is a **monorepo managed by Turborepo**.
```
/
├── packages/
│   ├── core          # Domain model, rules, validators
│   ├── cli           # Command-line orchestration
│   ├── k8/           # Generated K8 manifests types
│   ├── node/         # Integrations (docker, k8s, helm, kyaml, registry)
│   └── docs          # Specification and developer guides
├── examples/         # Minimal DSL usage scenarios
└── tsops.config.ts   # Root configuration used in tests and docs
```
> Data flows strictly **config → core → adapters → cli → external world**.  
> No reverse dependencies are permitted.

## Domain Invariants (core)
- Artifact names are deterministically derived from `{project, namespace, app}` — no hidden conventions.  
- `getInternalEndpoint(app)` and `getExternalEndpoint(app)` share a single resolution strategy.  
- Secrets/configs are modeled but not stored; unresolved values block `plan`/`deploy`.  
- Image tags are derived from VCS (`git-sha`) or semver; never from ad-hoc concatenation.

## Codebase Conventions
- **TypeScript 5.9+**, `strict` mode, `noUncheckedIndexedAccess`.  
- No `any`, no implicit `as` casts in `core`.  
- Public APIs follow **semantic versioning** — breaking type changes require a major bump.  
- Domain errors use **discriminated unions** with actionable messages.  
- Prefer **type inference and generics** over runtime reflection.  
- **Keep the codebase clean:** remove dead or unused code immediately.  
- **Avoid duplication:** extract shared utilities into dedicated helpers within `core` or `adapters`.  
- Turborepo pipelines (`build`, `lint`, `test`, `docs`) must always pass before merging.

## Development Lifecycle (Definition of Done)
1. **Spec** — update documentation (`packages/docs`) and include a runnable example.  
2. **Type Tests** — add compile-time assertions for valid/invalid cases.  
3. **Unit Tests** — pure for core; isolated mocks for adapters.  
4. **CLI UX** — predictable flags, stable `exitCode`, full support for `--dry-run`.  
5. **Determinism Check** — generated names, endpoints, and manifests are stable.  
6. **Changelog** — every public change recorded via `changesets`.

## Allowed Agent Tasks
- **Core:** extend type system, validation, or DSL expressiveness.  
- **Adapters:** implement build/export strategies for docker, k8s, helm/kyaml.  
- **CLI:** improve UX, add flags, maintain backward compatibility.  
- **Docs/Examples:** ensure examples compile and reflect current API.  
- **Refactoring:** remove duplication, simplify abstractions, preserve semantic parity.

**Forbidden:**  
- Committing secrets or credentials.  
- Mixing I/O logic into `core`.  
- Introducing circular dependencies.  
- Leaving dead code or unreferenced symbols.  
- Breaking public types without a version bump.

## Commands
- Install: `pnpm install`  
- Build all: `pnpm build` (Turborepo orchestrates packages)  
- Lint / Format: `pnpm lint` / `pnpm format`  
- Test: `pnpm test`  
- Docs (local dev): `pnpm docs:dev`  
- Example check:
```bash
  pnpm tsops plan -c examples/monorepo
  pnpm tsops build -c examples/fullstack

```


## Commits & Releases
	•	Conventional Commits (feat:, fix:, refactor:, etc.).
	•	Releases managed by changesets; include a .changeset entry for any public API change.

## Quick Heuristics
	•	If you wrote as inside core, revisit your type design.
	•	Any verbal rule must exist as a type or validator.
	•	Between flexibility and determinism, choose determinism — reproducibility is reliability.
	•	The agent should leave the codebase cleaner than it found it.

# Agent Startup Routine

## When initializing work:
	1.	Analyze package boundaries via Turborepo graph.
	2.	Run pnpm build && pnpm test to verify baseline health.
	3.	Inspect type exports in core for consistency and potential duplication.
	4.	Use tsops plan --dry-run on examples/ to validate changes end-to-end.
	5.	Submit PRs with clear diff summaries and regenerated docs/examples.

⸻

tsops is not just tooling — it is a living model of how typed infrastructure should behave.
Your job as an agent-developer is to evolve its DSL while preserving purity, determinism, and clarity.
