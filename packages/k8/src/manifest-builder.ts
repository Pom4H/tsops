import type { ManifestBuilderContext, ManifestSet } from './types.js'
import { buildDeployment } from './builders/deployment.js'
import { buildService } from './builders/service.js'
import { buildIngress } from './builders/ingress.js'
import { buildIngressRoute } from './builders/ingress-route.js'
import { buildCertificate } from './builders/certificate.js'

export class ManifestBuilder<TConfig extends { project: string }> {
  constructor(private readonly config: TConfig) {}

  build(appName: string, ctx: ManifestBuilderContext): ManifestSet {
    const baseLabels = buildBaseLabels(this.config.project, appName)
    const deployment = buildDeployment(appName, ctx, baseLabels)
    const service = buildService(ctx, baseLabels)

    const ingress = ctx.network?.ingress
      ? buildIngress(ctx, baseLabels, ctx.network.ingress)
      : undefined

    const ingressRoute = ctx.network?.ingressRoute
      ? buildIngressRoute(ctx, baseLabels, ctx.network.ingressRoute)
      : undefined

    const certificate = ctx.network?.certificate
      ? buildCertificate(ctx, baseLabels, ctx.network.certificate)
      : undefined

    return { deployment, service, ingress, ingressRoute, certificate }
  }
}

function buildBaseLabels(project: string, appName: string): Record<string, string> {
  return {
    'app.kubernetes.io/name': appName,
    'app.kubernetes.io/part-of': project
  }
}
