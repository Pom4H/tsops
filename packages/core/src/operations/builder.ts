import type { DockerClient } from '../ports/docker.js'
import type { Logger } from '../logger.js'
import type { BuildDefinition, DockerfileBuild, TsOpsConfig } from '../types.js'
import type { ConfigResolver } from '../config/resolver.js'
import type { BuildResult } from './types.js'

interface BuilderDependencies<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  docker: DockerClient
  logger: Logger
  dryRun: boolean
  resolver: ConfigResolver<TConfig>
}

export class Builder<
  TConfig extends TsOpsConfig<any, any, any, any, any, any>
> {
  private readonly docker: DockerClient
  private readonly logger: Logger
  private readonly dryRun: boolean
  private readonly resolver: ConfigResolver<TConfig>

  constructor(dependencies: BuilderDependencies<TConfig>) {
    this.docker = dependencies.docker
    this.logger = dependencies.logger
    this.dryRun = dependencies.dryRun
    this.resolver = dependencies.resolver
  }

  async build(options: { app?: string; namespace?: string } = {}): Promise<BuildResult> {
    // Login to Docker registry before building (reads from env vars)
    await this.docker.login()

    const apps = this.resolver.apps.select(options.app)
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

      // Build context can be extended with namespace variables if needed
      await this.docker.build(imageRef, build, {})
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
