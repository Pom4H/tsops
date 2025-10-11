import type { EnvironmentProvider } from '../environment-provider.js'
import type { TsOpsConfig } from '../types.js'
import type { ProjectResolver } from './project.js'

/**
 * Resolver for Docker image references.
 * Handles repository naming and tag resolution based on configured strategy.
 */
export interface ImagesResolver<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  /**
   * Builds a complete Docker image reference (repository:tag) for an app.
   * @param appName - The application name
   * @returns Full image reference (e.g., "ghcr.io/org/app:abc123")
   */
  buildRef(appName: string): string
}

export function createImagesResolver<TConfig extends TsOpsConfig<any, any, any, any, any, any>>(
  config: TConfig,
  project: ProjectResolver<TConfig>,
  env: EnvironmentProvider
): ImagesResolver<TConfig> {
  function resolveRepository(appName: string): string {
    const { images } = config
    const base = images.repository ?? images.registry
    const slug = images.includeProjectInName ? `${project.name}-${appName}` : appName
    return `${trimTrailingSlash(base)}/${slug}`
  }

  /**
   * Resolves the Docker image tag based on the configured strategy.
   *
   * Supports:
   * - 'git-sha': Automatically uses git SHA (first 12 chars), falls back to env var GIT_SHA, then 'dev'
   *   - Appends '-dirty' suffix if working directory has uncommitted changes
   * - 'git-tag': Automatically uses git tag, falls back to env var GIT_TAG, then 'latest'
   *   - Appends '-dirty' suffix if working directory has uncommitted changes
   * - 'timestamp': Generates ISO timestamp (YYYYMMDDHHmmss)
   * - Custom string: Used as-is
   * - Custom object: Uses object.value or generates dynamic tag
   */
  function resolveTag(): string {
    const isDirty = env.get('GIT_DIRTY') === 'true'

    const strategy = config.images.tagStrategy
    if (typeof strategy === 'string') {
      let baseTag: string
      switch (strategy) {
        case 'git-sha':
          baseTag = env.get('GIT_SHA')?.slice(0, 12) ?? 'dev'
          return isDirty ? `${baseTag}-dirty` : baseTag
        case 'git-tag':
          baseTag = env.get('GIT_TAG') ?? 'latest'
          return isDirty ? `${baseTag}-dirty` : baseTag
        case 'timestamp':
          return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
        default:
          return strategy
      }
    }

    if (typeof strategy === 'object' && strategy.kind) {
      const value = 'value' in strategy ? strategy.value : undefined
      if (typeof value === 'string') return value
      return `${strategy.kind}-${Date.now()}`
    }

    return 'latest'
  }

  function buildRef(appName: string): string {
    const base = resolveRepository(appName)
    const tag = resolveTag()
    return `${base}:${tag}`
  }

  return {
    buildRef
  }
}

function trimTrailingSlash(input: string): string {
  return input.endsWith('/') ? input.slice(0, -1) : input
}
