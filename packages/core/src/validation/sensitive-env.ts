import type { PlanEntry } from '../operations/types.js'
import type { DockerfileBuild, SensitiveEnvConfig } from '../types.js'
import { isConfigMapRef, isSecretRef } from '../types.js'

/** Key pattern for anything that looks secret-ish. */
const DEFAULT_PATTERN = /TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|KEY/i
/** `NEXT_PUBLIC_*` / `VITE_*` / `PUBLIC_*` are frontend conventions for non-secret public values. */
const DEFAULT_ALLOW_PREFIXES = ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_']

// `SensitiveEnvConfig` is declared in types.ts (so ValidationConfig can
// reference it without importing this module). Don't re-export it from here —
// `packages/core/src/index.ts` already re-exports types.ts via `export *`.

export interface SensitiveEnvFinding {
  app: string
  /** Namespace for runtime findings; `undefined` for build-env findings. */
  namespace?: string
  source: 'build' | 'runtime'
  key: string
  message: string
}

interface NormalizedConfig {
  mode: 'off' | 'warn' | 'error'
  scanBuildEnv: boolean
  scanRuntimeEnv: boolean
  pattern: RegExp
  allowPrefixes: string[]
  allowKeys: Set<string>
}

function normalize(config: SensitiveEnvConfig | undefined): NormalizedConfig {
  return {
    mode: config?.mode ?? 'warn',
    scanBuildEnv: config?.scanBuildEnv ?? true,
    scanRuntimeEnv: config?.scanRuntimeEnv ?? true,
    pattern: config?.pattern ?? DEFAULT_PATTERN,
    allowPrefixes: config?.allowPrefixes ?? DEFAULT_ALLOW_PREFIXES,
    allowKeys: new Set(config?.allowKeys ?? [])
  }
}

function isAllowed(key: string, cfg: NormalizedConfig): boolean {
  if (cfg.allowKeys.has(key)) return true
  return cfg.allowPrefixes.some((prefix) => key.startsWith(prefix))
}

/**
 * Scan a single build-env record and return findings for any suspicious keys
 * whose values are non-empty plain strings.
 */
export function scanBuildEnv(
  appName: string,
  build: DockerfileBuild | undefined,
  config: SensitiveEnvConfig | undefined
): SensitiveEnvFinding[] {
  const cfg = normalize(config)
  if (cfg.mode === 'off' || !cfg.scanBuildEnv) return []
  if (!build || build.type !== 'dockerfile' || !build.env) return []

  const findings: SensitiveEnvFinding[] = []
  for (const [key, value] of Object.entries(build.env)) {
    if (isAllowed(key, cfg)) continue
    if (!cfg.pattern.test(key)) continue
    if (typeof value !== 'string' || value.length === 0) continue

    findings.push({
      app: appName,
      source: 'build',
      key,
      message:
        `Sensitive-looking build env "${key}" on app "${appName}" is defined as a plain string. ` +
        `Build-time env bakes into image layers — prefer a build arg injected from CI secrets, ` +
        `or add "${key}" to validation.sensitiveEnv.allowKeys if intentional.`
    })
  }
  return findings
}

/**
 * Scan resolved runtime env for one PlanEntry.
 * Values backed by `SecretRef` / `ConfigMapRef` are safe — only plain strings
 * trip this check.
 */
export function scanRuntimeEnv(
  entry: PlanEntry,
  config: SensitiveEnvConfig | undefined
): SensitiveEnvFinding[] {
  const cfg = normalize(config)
  if (cfg.mode === 'off' || !cfg.scanRuntimeEnv) return []

  const findings: SensitiveEnvFinding[] = []
  for (const [key, value] of Object.entries(entry.env)) {
    if (isAllowed(key, cfg)) continue
    if (!cfg.pattern.test(key)) continue
    if (isSecretRef(value) || isConfigMapRef(value)) continue
    if (typeof value !== 'string' || value.length === 0) continue

    findings.push({
      app: entry.app,
      namespace: entry.namespace,
      source: 'runtime',
      key,
      message:
        `Sensitive-looking runtime env "${key}" on app "${entry.app}" @ namespace "${entry.namespace}" ` +
        `is a plain string. Prefer a secret reference (e.g. secret('app-secrets', '${key}')) or add ` +
        `"${key}" to validation.sensitiveEnv.allowKeys.`
    })
  }
  return findings
}

/**
 * Apply the configured `mode` to a set of findings.
 * - `off` / `warn`: returns the list (caller decides how to log)
 * - `error`: throws an aggregated error
 */
export function enforceMode(
  findings: SensitiveEnvFinding[],
  config: SensitiveEnvConfig | undefined
): SensitiveEnvFinding[] {
  const cfg = normalize(config)
  if (findings.length === 0 || cfg.mode !== 'error') return findings

  const summary = findings.map((f) => `  - ${f.message}`).join('\n')
  throw new Error(
    `Found ${findings.length} sensitive-env issue${findings.length === 1 ? '' : 's'}:\n${summary}`
  )
}
