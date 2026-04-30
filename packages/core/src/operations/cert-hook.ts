import type { Logger } from '../logger.js'
import type { KubectlClient, SupportedManifest } from '../ports/kubectl.js'
import type { OverlayCertStrategy } from '../types.js'

interface RunCertbotHookOptions {
  namespace: string
  domain: string
  cert: OverlayCertStrategy
  kubectl: KubectlClient
  logger: Logger
}

/**
 * Pre-deploy TLS hook for overlay namespaces.
 *
 * - `wildcard-shared` only logs — the assumption is that the IngressRoute will
 *   reference an existing wildcard cert that already covers the overlay's
 *   subdomain. Nothing to issue, nothing to wait for.
 * - `per-namespace` schedules a certbot DNS-01 Job that writes the resulting
 *   TLS Secret into the overlay namespace. The Job runs to completion before
 *   the deployer continues.
 *
 * This is intentionally a thin wrapper. The real cert pipeline is the certbot
 * image and its DNS-provider plugin; tsops just owns the Job lifecycle.
 */
export async function runCertbotHook(options: RunCertbotHookOptions): Promise<void> {
  const { namespace, domain, cert, kubectl, logger } = options

  if (cert.mode === 'wildcard-shared') {
    logger.info('Reusing shared wildcard certificate for overlay', {
      namespace,
      secretName: cert.secretName
    })
    return
  }

  const secretName = cert.secretName ?? `${namespace}-wildcard-tls`
  const jobName = `tsops-certbot-${namespace}`

  logger.info('Issuing per-namespace certificate via certbot', {
    namespace,
    domain,
    issuer: cert.issuer.dnsProvider,
    secretName
  })

  const job: Record<string, unknown> = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace,
      labels: { 'tsops/managed': 'true', 'tsops/hook': 'certbot' }
    },
    spec: {
      backoffLimit: 2,
      ttlSecondsAfterFinished: 300,
      template: {
        spec: {
          restartPolicy: 'Never',
          serviceAccountName: 'tsops-certbot',
          containers: [
            {
              name: 'certbot',
              image: 'certbot/dns-' + cert.issuer.dnsProvider + ':latest',
              env: [
                { name: 'CERTBOT_EMAIL', value: cert.issuer.email },
                { name: 'CERTBOT_DOMAIN', value: domain },
                { name: 'CERTBOT_SECRET_NAME', value: secretName }
              ],
              envFrom: [{ secretRef: { name: cert.issuer.credentialsSecret } }],
              command: ['/bin/sh', '-c'],
              args: [
                [
                  'certbot certonly --non-interactive --agree-tos',
                  `--email "$CERTBOT_EMAIL"`,
                  `--dns-${cert.issuer.dnsProvider}`,
                  `-d "$CERTBOT_DOMAIN" -d "*.$CERTBOT_DOMAIN"`,
                  '&&',
                  `kubectl create secret tls "$CERTBOT_SECRET_NAME" --namespace ${namespace}`,
                  '--cert=/etc/letsencrypt/live/$CERTBOT_DOMAIN/fullchain.pem',
                  '--key=/etc/letsencrypt/live/$CERTBOT_DOMAIN/privkey.pem',
                  '--dry-run=client -o yaml | kubectl apply -f -'
                ].join(' ')
              ]
            }
          ]
        }
      }
    }
  }

  await kubectl.apply(job as unknown as SupportedManifest, { namespace })
}
