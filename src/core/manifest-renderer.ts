import type {
  EnvironmentConfig,
  GitInfo,
  KubernetesManifest,
  ServiceConfig,
  ServiceManifestContext,
  TsOpsConfig
} from '../types.js'

interface ManifestRenderInput {
  service: ServiceConfig & { name: string }
  environment: EnvironmentConfig & { name: string }
  git: GitInfo
  explicitImageTag?: string
}

interface ManifestRenderResult {
  manifests: KubernetesManifest[]
  imageTag: string
  context: ServiceManifestContext
}

export class ManifestRenderer {
  private readonly config: TsOpsConfig
  constructor(config: TsOpsConfig) {
    this.config = config
  }

  render({
    service,
    environment,
    git,
    explicitImageTag
  }: ManifestRenderInput): ManifestRenderResult {
    const imageTag =
      explicitImageTag ??
      (this.config.buildImageTag
        ? this.config.buildImageTag(service, environment, git)
        : git.shortSha)

    const context: ServiceManifestContext = {
      env: {
        name: environment.name,
        namespace: environment.namespace
      },
      image: `${service.containerImage}:${imageTag}`
    }

    const manifests = this.config.renderManifests
      ? this.config.renderManifests({
          environment,
          service,
          imageTag
        })
      : this.resolveManifests(service, context, environment.name)

    return { manifests, imageTag, context }
  }

  private resolveManifests(
    service: ServiceConfig & { name: string },
    context: ServiceManifestContext,
    environmentName: string
  ): KubernetesManifest[] {
    const override = service.envOverrides?.[environmentName]?.manifests
    return override ? override(context) : service.manifests(context)
  }
}

export type { ManifestRenderInput, ManifestRenderResult }
