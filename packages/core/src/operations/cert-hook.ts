import { createHash } from 'node:crypto'
import type { Logger } from '../logger.js'
import type { KubectlClient, SupportedManifest } from '../ports/kubectl.js'
import type { CustomJobConfig, OverlayCertStrategy } from '../types.js'

interface RunCertbotHookOptions {
  /** Resolved overlay namespace. */
  namespace: string
  /** Base (static) namespace the overlay extends — used for `wildcard-shared`. */
  baseNamespace: string
  cert: OverlayCertStrategy
  kubectl: KubectlClient
  logger: Logger
}

/**
 * Lowercase, replace invalid characters with `-`, collapse runs, trim. If
 * the result still exceeds 63 chars (the DNS-1123 label limit), keep a
 * leading prefix and append a stable short hash so distinct inputs never
 * collide on the same Job name.
 */
function toK8sName(input: string): string {
  const sanitized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  const safe = sanitized || 'tsops'
  if (safe.length <= 63) return safe
  const hash = createHash('sha1').update(input).digest('hex').slice(0, 8)
  return `${safe.slice(0, 63 - 9)}-${hash}`
}

/**
 * Pre-deploy TLS hook for overlay namespaces.
 *
 * - `wildcard-shared`: read the named TLS Secret from the base namespace
 *   and apply an identical Secret into the overlay namespace. This is the
 *   cheap, provider-agnostic path for the common case where the base
 *   namespace already holds a wildcard cert that covers the overlay
 *   subdomain (e.g. `*.stage.example.com` → `pr-123.stage.example.com`).
 *   Returns no Job to wait on.
 *
 * - `job`: apply a user-supplied Job and return its name so the caller can
 *   `waitForJob` before continuing the deploy. The Job is expected to
 *   produce the TLS Secret in the overlay namespace itself; tsops doesn't
 *   prescribe the issuer (certbot, cert-manager Certificate resource, ...).
 */
export async function runCertbotHook(
  options: RunCertbotHookOptions
): Promise<{ jobName: string } | undefined> {
  const { namespace, baseNamespace, cert, kubectl, logger } = options

  if (cert.mode === 'wildcard-shared') {
    if (cert.copyToOverlayNamespace === false) {
      return undefined
    }
    const sourceNamespace = cert.sourceNamespace ?? baseNamespace
    logger.info('Copying shared TLS secret into overlay', {
      from: sourceNamespace,
      to: namespace,
      secretName: cert.secretName
    })
    const source = await kubectl.get('Secret', cert.secretName, sourceNamespace)
    if (!source) {
      throw new Error(
        `Cert hook (wildcard-shared): TLS secret "${cert.secretName}" not found in source namespace "${sourceNamespace}".`
      )
    }
    const copy = stripServerFields(source, namespace)
    await kubectl.apply(copy, { namespace })
    return undefined
  }

  validateCustomJob(cert.job)
  const jobName = toK8sName(cert.name ?? `tsops-cert-${namespace}`)
  logger.info('Running custom certificate issuance job', { namespace, jobName })
  const job = renderCustomJob(jobName, namespace, cert.job)
  await kubectl.apply(job, { namespace })
  return { jobName }
}

/**
 * Strip server-managed metadata so a Secret read from one namespace can be
 * cleanly re-applied into another. Keeps `data` / `type` / labels.
 */
function stripServerFields(source: SupportedManifest, namespace: string): SupportedManifest {
  const meta = (source.metadata as Record<string, unknown> | undefined) ?? {}
  const cleaned: SupportedManifest = {
    ...source,
    metadata: {
      name: meta.name as string,
      namespace,
      labels: {
        ...((meta.labels as Record<string, string> | undefined) ?? {}),
        'tsops/managed': 'true',
        'tsops/copied-from': String(meta.namespace ?? '')
      }
    }
  }
  return cleaned
}

function validateCustomJob(custom: CustomJobConfig): void {
  if (!custom.image) {
    throw new Error('Cert hook job: CustomJobConfig.image is required.')
  }
  for (const ref of custom.envFrom ?? []) {
    if (!ref.secretName && !ref.configMapName) {
      throw new Error(
        'Cert hook job: envFrom entry must specify either secretName or configMapName.'
      )
    }
    if (ref.secretName && ref.configMapName) {
      throw new Error(
        'Cert hook job: envFrom entry must specify only one of secretName / configMapName.'
      )
    }
  }
}

function renderCustomJob(
  jobName: string,
  namespace: string,
  custom: CustomJobConfig
): SupportedManifest {
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace,
      labels: { 'tsops/managed': 'true', 'tsops/hook': 'cert' }
    },
    spec: {
      backoffLimit: 1,
      ttlSecondsAfterFinished: 300,
      template: {
        spec: {
          restartPolicy: 'Never',
          containers: [
            {
              name: 'cert',
              image: custom.image,
              command: custom.command,
              args: custom.args,
              env: Object.entries(custom.env ?? {}).map(([k, v]) => ({ name: k, value: v })),
              envFrom: (custom.envFrom ?? []).map((ref) =>
                ref.secretName
                  ? { secretRef: { name: ref.secretName } }
                  : { configMapRef: { name: ref.configMapName } }
              )
            }
          ]
        }
      }
    }
  }

  return job as unknown as SupportedManifest
}
