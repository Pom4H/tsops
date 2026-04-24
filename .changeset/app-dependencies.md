---
'@tsops/core': minor
'tsops': minor
---

Add explicit app dependencies via `app.needs`.

```ts
apps: {
  web:  { needs: ['api'] },
  api:  { needs: ['db'] },
  db:   { /* ... */ }
}
```

Declaring dependencies gives you three things:

1. **Validation at plan time.** Unknown apps, self-references, cycles, and dependencies excluded from the current namespace are errors — the planner throws with a summary of what's wrong.
2. **Topological ordering.** `plan.entries` comes out sorted per namespace; dependencies appear before their dependents. Independent apps keep their declaration order.
3. **Introspection.** `plan.dependencies[namespace]` exposes the resolved `graph` (nodes + edges) and the computed `order` for anyone building diagrams or custom deploy logic.

Standalone primitives are exported for reuse: `buildGraph`, `topoSort`, `validateDependencies`, and the `DependencyGraph` / `DependencyEdge` / `DependencyError` types.

This is purely declarative ordering; tsops does not currently wait for readiness between deploys.
