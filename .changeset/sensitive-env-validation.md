---
'@tsops/core': minor
'tsops': minor
---

Add sensitive-env validation hook.

Opt in via `validation.sensitiveEnv` on the root config:

```ts
validation: {
  sensitiveEnv: { mode: 'warn', allowKeys: ['NEXT_PUBLIC_SENTRY_KEY'] }
}
```

The planner now scans:

- `DockerfileBuild.env` — build-time env bakes into image layers, so any key matching `/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|KEY/i` with a plain-string value is flagged.
- Resolved runtime env — same pattern, but values backed by `secret(...)` / `configMap(...)` references are safe and skipped.

Modes: `off` (disabled), `warn` (default — findings returned on `plan.warnings`), `error` (throws an aggregated error on plan).

`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` prefixes are allow-listed by default for frontend public vars. Override with `allowPrefixes` / `allowKeys` / `pattern`.

Exports added: `scanBuildEnv`, `scanRuntimeEnv`, `enforceMode`, and the `SensitiveEnvConfig` / `SensitiveEnvFinding` types.
