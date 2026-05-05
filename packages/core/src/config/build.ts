import type {
  AppBuildContext,
  BuildSourceKeyConfig,
  DockerBuildCacheConfig,
  DockerfileBuild
} from '../types.js'

/**
 * Fields that sensibly carry default values across many apps in the same repo.
 * `dockerfile` is intentionally excluded — each app names its own Dockerfile.
 */
export interface DockerfileBuildDefaults {
  context?: string
  platform?: string | ((ctx: AppBuildContext) => string)
  env?: Record<string, string>
  args?: Record<string, string>
  target?: string
  inputs?: readonly string[]
  sourceKey?: BuildSourceKeyConfig
  cache?: DockerBuildCacheConfig
}

/**
 * Create a reusable factory for dockerfile builds. Call it with a Dockerfile
 * path (and optional per-app overrides) to get a complete `DockerfileBuild`.
 *
 * @example
 * const dockerfile = defineDockerfileBuild({
 *   context: '.',
 *   platform: 'linux/amd64',
 *   env: { TURBO_TELEMETRY_DISABLED: '1' }
 * })
 *
 * apps: {
 *   api: { build: dockerfile('infra/images/api.dockerfile') },
 *   web: { build: dockerfile('infra/images/web.dockerfile', { target: 'production' }) }
 * }
 */
export function defineDockerfileBuild(defaults: DockerfileBuildDefaults = {}) {
  return function dockerfile(
    path: string,
    overrides: DockerfileBuildDefaults = {}
  ): DockerfileBuild {
    const mergedEnv = mergeRecord(defaults.env, overrides.env)
    const mergedArgs = mergeRecord(defaults.args, overrides.args)
    const platform = overrides.platform ?? defaults.platform
    const target = overrides.target ?? defaults.target
    const inputs = overrides.inputs ?? defaults.inputs
    const sourceKey = overrides.sourceKey ?? defaults.sourceKey
    const cache = overrides.cache ?? defaults.cache

    const result: DockerfileBuild = {
      type: 'dockerfile',
      context: overrides.context ?? defaults.context ?? '.',
      dockerfile: path
    }

    if (platform !== undefined) result.platform = platform
    if (target !== undefined) result.target = target
    if (mergedEnv) result.env = mergedEnv
    if (mergedArgs) result.args = mergedArgs
    if (inputs !== undefined) result.inputs = inputs
    if (sourceKey !== undefined) result.sourceKey = sourceKey
    if (cache !== undefined) result.cache = cache

    return result
  }
}

function mergeRecord(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!a && !b) return undefined
  return { ...(a ?? {}), ...(b ?? {}) }
}
