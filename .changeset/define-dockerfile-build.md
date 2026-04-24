---
'@tsops/core': minor
'tsops': minor
---

Add `defineDockerfileBuild(defaults)` helper: a factory that removes the boilerplate of repeating `context` / `platform` / `env` / `args` across every app's `build` block. Each app only supplies its Dockerfile path (and optional per-app overrides, which shallow-merge into the defaults).
