---
"@tsops/core": patch
"tsops": patch
---

Fix return typing of `defineConfig` and expose `TsOpsConfigWithRuntime` so consumer configs no longer reference the internal `.pnpm` path.
