import type { ConfigResolver } from '../config/resolver.js'
import type { Logger } from '../logger.js'
import type { DockerClient } from '../ports/docker.js'
import type { BuildDefinition, DockerfileBuild, TsOpsConfig } from '../types.js'
import type { BuildResult } from './types.js'

interface BuilderDependencies<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  docker: DockerClient
  logger: Logger
  dryRun: boolean
  resolver: ConfigResolver<TConfig>
  config: TConfig
}

export class Builder<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  private readonly docker: DockerClient
  private readonly logger: Logger
  private readonly dryRun: boolean
  private readonly resolver: ConfigResolver<TConfig>
  private readonly config: TConfig

  constructor(dependencies: BuilderDependencies<TConfig>) {
    this.docker = dependencies.docker
    this.logger = dependencies.logger
    this.dryRun = dependencies.dryRun
    this.resolver = dependencies.resolver
    this.config = dependencies.config
  }

  async build(
    options: { app?: string; namespace?: string; force?: boolean; changedFiles?: string[] } = {}
  ): Promise<BuildResult> {
    // Login to Docker registry before building (reads from env vars)
    await this.docker.login()

    // Determine which apps to build
    let apps: ReturnType<typeof this.resolver.apps.select>

    if (options.changedFiles && options.changedFiles.length > 0) {
      // Filter by changed files (incremental build)
      apps = this.resolver.apps.selectByChangedFiles(options.changedFiles)

      if (apps.length === 0) {
        this.logger.info('No apps affected by changed files. Skipping build.')
        return { images: [] }
      }

      this.logger.info(
        `Building ${apps.length} affected app(s): ${apps.map(([name]) => name).join(', ')}`
      )
    } else if (options.app) {
      // Filter by specific app name
      apps = this.resolver.apps.select(options.app)
    } else {
      // Build all apps
      apps = this.resolver.apps.select()
    }

    const results: BuildResult['images'] = []

    for (const [appName, app] of apps) {
      const build = app.build

      if (!build) {
        this.logger.warn('No build configuration found. Skipping.', { app: appName })
        continue
      }

      const imageRef = this.resolver.images.buildRef(appName)
      if (!isDockerfileBuild(build)) {
        this.logger.warn('Skipping unsupported build configuration. Expected type "dockerfile".', {
          app: appName
        })
        continue
      }

      // Check if image already exists in registry (unless force rebuild is requested)
      if (!options.force) {
        const exists = await this.docker.imageExists(imageRef)
        if (exists) {
          this.logger.info('Image already exists in registry. Skipping build.', {
            app: appName,
            image: imageRef
          })
          results.push({ app: appName, image: imageRef })
          continue
        }
      } else {
        this.logger.info('Force rebuild requested. Building image.', {
          app: appName,
          image: imageRef
        })
      }

      // Build context can be extended with namespace variables if needed
      const cacheConfig = this.config.images.cache
      await this.docker.build(imageRef, build, {}, cacheConfig)
      if (!this.dryRun) {
        await this.docker.push(imageRef)
      }
      results.push({ app: appName, image: imageRef })
    }

    return { images: results }
  }
}

function isDockerfileBuild(build: BuildDefinition): build is DockerfileBuild {
  if (typeof build !== 'object' || build === null) return false

  const candidate = build as Partial<DockerfileBuild>
  return (
    candidate.type === 'dockerfile' &&
    typeof candidate.context === 'string' &&
    typeof candidate.dockerfile === 'string'
  )
}
