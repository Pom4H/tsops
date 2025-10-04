import type {
  CertificateManifest,
  ManifestBuilderContext,
  ResolvedCertificateConfig
} from '../types.js'
import { createMetadata } from '../utils.js'

export function buildCertificate(
  ctx: ManifestBuilderContext,
  baseLabels: Record<string, string>,
  config: ResolvedCertificateConfig
): CertificateManifest {
  const metadata = createMetadata(config.secretName, ctx.namespace, baseLabels)

  return {
    apiVersion: 'cert-manager.io/v1',
    kind: 'Certificate',
    metadata,
    spec: {
      secretName: config.secretName,
      issuerRef: config.issuerRef,
      dnsNames: config.dnsNames,
      commonName: config.commonName,
      duration: config.duration,
      renewBefore: config.renewBefore,
      isCA: config.isCA,
      usages: config.usages,
      privateKey: config.privateKey
    }
  }
}
