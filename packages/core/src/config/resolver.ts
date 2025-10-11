import type { EnvironmentProvider } from '../environment-provider.js'
import { GlobalEnvironmentProvider } from '../environment-provider.js'
import type { TsOpsConfig } from '../types.js'
import { type AppEntry, type AppsResolver, createAppsResolver, type ResolverApp } from './apps.js'
import { createImagesResolver, type ImagesResolver } from './images.js'
import { createNamespaceResolver, type NamespaceResolver } from './namespaces.js'
import { createProjectResolver, type ProjectResolver } from './project.js'

/**
 * ConfigResolver orchestrates all sub-resolvers for configuration data.
 * Each resolver is responsible for a specific domain (project, namespaces, images, apps).
 */
export interface ConfigResolver<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> {
  project: ProjectResolver<TConfig>
  namespaces: NamespaceResolver<TConfig>
  images: ImagesResolver<TConfig>
  apps: AppsResolver<TConfig>
}

export interface ConfigResolverOptions {
  /**
   * Provider for accessing environment variables.
   * Defaults to GlobalEnvironmentProvider if not specified.
   */
  env?: EnvironmentProvider
}

/**
 * Creates a ConfigResolver with all necessary sub-resolvers.
 *
 * @param config - The tsops configuration object
 * @param options - Optional configuration for resolver creation
 * @returns Fully initialized ConfigResolver
 *
 * @example
 * const resolver = createConfigResolver(config, { env: new MockEnvironmentProvider() })
 */
export function createConfigResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(config: TConfig, options: ConfigResolverOptions = {}): ConfigResolver<TConfig> {
  const env = options.env ?? new GlobalEnvironmentProvider()
  const project = createProjectResolver(config)
  const namespaces = createNamespaceResolver(config, project, env)
  const images = createImagesResolver(config, project, env)
  const apps = createAppsResolver(config, namespaces, project)

  return {
    project,
    namespaces,
    images,
    apps
  }
}

export type {
  ProjectResolver,
  NamespaceResolver,
  ImagesResolver,
  AppsResolver,
  AppEntry,
  ResolverApp
}
export { createProjectResolver, createNamespaceResolver, createImagesResolver, createAppsResolver }
