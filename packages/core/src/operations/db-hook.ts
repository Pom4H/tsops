import { createHash } from 'node:crypto'
import type { Logger } from '../logger.js'
import type { KubectlClient, SupportedManifest } from '../ports/kubectl.js'
import type { CustomJobConfig, OverlayDatabase, OverlayVars } from '../types.js'

interface DbHookCommonOptions {
  namespace: string
  /** Base (static) namespace the overlay extends — source of `urlSecret`. */
  baseNamespace: string
  vars: OverlayVars
  database: OverlayDatabase
  kubectl: KubectlClient
  logger: Logger
}

const POSTGRES_IMAGE = 'postgres:16-alpine'

/**
 * PostgreSQL identifier rule (a relaxed but conservative subset): an ASCII
 * letter or underscore, followed by letters, digits or underscores, up to 63
 * bytes — Postgres' NAMEDATALEN-1.
 *
 * Schema name comes from runtime `--vars` and is interpolated into DDL, so a
 * permissive sanitizer would be a SQL injection vector. We refuse anything
 * that doesn't match this pattern outright.
 */
const POSTGRES_IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

/**
 * Convert an arbitrary token into a valid DNS-1123 label suitable for a k8s
 * resource name. Lowercases, replaces invalid chars with `-`, collapses
 * runs of `-`, trims leading/trailing `-`, and clips to 63 chars.
 *
 * Schema names like `pr_123` would otherwise produce illegal Job names.
 */
/**
 * Lowercase, replace invalid characters with `-`, collapse runs, trim.
 * If the result still exceeds 63 chars (the DNS-1123 label limit), keep a
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
  // Keep the prefix readable while leaving room for `-<hash>`.
  return `${safe.slice(0, 63 - 9)}-${hash}`
}

function assertValidSchema(schema: string): void {
  if (!POSTGRES_IDENT.test(schema)) {
    throw new Error(
      `Invalid PostgreSQL schema name "${schema}". ` +
        `Schema must match ${POSTGRES_IDENT.source} (letters, digits, underscores; 1–63 chars).`
    )
  }
}

/**
 * Pre-deploy database hook for overlay namespaces.
 *
 * `preDeploy` is one of:
 *  - `'create-schema'` — runs `CREATE SCHEMA IF NOT EXISTS <s>` and stops.
 *  - `CustomJobConfig`  — runs the user-supplied migrate image. tsops
 *    intentionally does not bundle a migration runner because every
 *    framework (Prisma, Drizzle, golang-migrate, Flyway, ...) has its own
 *    contract; you point at the same image you already use in CI.
 *
 * The Job lives inside the overlay namespace so it disappears with `down`.
 * Returns the Job name so the caller can `waitForJob` on it before
 * continuing the deploy (otherwise apps would race ahead of the schema).
 */
export async function runDatabasePreDeploy(
  options: DbHookCommonOptions
): Promise<{ jobName: string }> {
  const { namespace, baseNamespace, vars, database, kubectl, logger } = options
  const schema = database.schema(vars)
  assertValidSchema(schema)
  const slug = toK8sName(schema)

  // The Job runs in the overlay namespace and reads `DATABASE_URL` via
  // `secretKeyRef` from a Secret in *that* namespace. The user declares the
  // Secret in the base (static) namespace, so we materialise a copy into the
  // overlay before the Job is applied. Idempotent: re-applying overwrites.
  await ensureUrlSecretInOverlay({ namespace, baseNamespace, database, kubectl, logger })

  if (typeof database.preDeploy === 'object') {
    validateCustomJob(database.preDeploy)
    const jobName = toK8sName(`tsops-db-custom-${slug}`)
    const job = renderCustomJob(jobName, namespace, schema, database, database.preDeploy)
    logger.info('Running custom database pre-deploy job', { namespace, schema, jobName })
    await kubectl.apply(job, { namespace })
    return { jobName }
  }

  const jobName = toK8sName(`tsops-db-create-${slug}`)
  logger.info('Creating overlay schema', { namespace, schema, jobName })
  const createJob = renderPsqlJob({
    namespace,
    name: jobName,
    database,
    sqlSteps: [`CREATE SCHEMA IF NOT EXISTS "${schema}"`]
  })
  await kubectl.apply(createJob, { namespace })
  return { jobName }
}

function validateCustomJob(custom: CustomJobConfig): void {
  if (!custom.image) {
    throw new Error('CustomJobConfig.image is required.')
  }
  for (const ref of custom.envFrom ?? []) {
    if (!ref.secretName && !ref.configMapName) {
      throw new Error(
        'CustomJobConfig.envFrom entry must specify either secretName or configMapName.'
      )
    }
    if (ref.secretName && ref.configMapName) {
      throw new Error(
        'CustomJobConfig.envFrom entry must specify only one of secretName / configMapName.'
      )
    }
  }
}

/**
 * Post-destroy hook for overlay namespaces. Currently only supports
 * `'drop-schema'`, which runs `DROP SCHEMA <s> CASCADE` against the same
 * connection. This intentionally runs *before* the namespace is deleted so
 * the Job can finish and report status.
 */
export async function runDatabasePostDestroy(
  options: DbHookCommonOptions
): Promise<{ jobName: string }> {
  const { namespace, baseNamespace, vars, database, kubectl, logger } = options
  const schema = database.schema(vars)
  assertValidSchema(schema)
  const slug = toK8sName(schema)
  const jobName = toK8sName(`tsops-db-drop-${slug}`)

  // Same reason as in runDatabasePreDeploy: the drop Job needs the connection
  // Secret available locally. If the namespace was created by `up` we'd
  // already have it, but `down` has to be safe to call standalone too.
  await ensureUrlSecretInOverlay({ namespace, baseNamespace, database, kubectl, logger })

  logger.info('Dropping overlay schema', { namespace, schema, jobName })
  const job = renderPsqlJob({
    namespace,
    name: jobName,
    database,
    sqlSteps: [`DROP SCHEMA IF EXISTS "${schema}" CASCADE`]
  })
  await kubectl.apply(job, { namespace })
  return { jobName }
}

/**
 * Read `database.urlSecret` from the base namespace and apply a copy into
 * the overlay namespace. Without this the DB Job's `secretKeyRef` would
 * resolve against an empty namespace and the pod would never start.
 */
async function ensureUrlSecretInOverlay(input: {
  namespace: string
  baseNamespace: string
  database: OverlayDatabase
  kubectl: KubectlClient
  logger: Logger
}): Promise<void> {
  const { namespace, baseNamespace, database, kubectl, logger } = input
  if (namespace === baseNamespace) return
  const source = await kubectl.get('Secret', database.urlSecret.name, baseNamespace)
  if (!source) {
    throw new Error(
      `Database hook: Secret "${database.urlSecret.name}" not found in base namespace "${baseNamespace}". ` +
        `The overlay's database connection Secret must exist in the base namespace so it can be copied into "${namespace}".`
    )
  }
  const sourceData = (source as unknown as { data?: Record<string, string> }).data ?? {}
  if (!(database.urlSecret.key in sourceData)) {
    throw new Error(
      `Database hook: Secret "${database.urlSecret.name}" in namespace "${baseNamespace}" ` +
        `does not contain key "${database.urlSecret.key}".`
    )
  }
  const sourceMeta =
    ((source as unknown as { metadata?: Record<string, unknown> }).metadata ??
      {}) as Record<string, unknown>
  const labels = (sourceMeta.labels as Record<string, string> | undefined) ?? {}
  const copy = {
    apiVersion: 'v1',
    kind: 'Secret',
    type: (source as unknown as { type?: string }).type ?? 'Opaque',
    metadata: {
      name: database.urlSecret.name,
      namespace,
      labels: {
        ...labels,
        'tsops/managed': 'true',
        'tsops/copied-from': baseNamespace,
        'tsops/hook': 'database'
      }
    },
    data: sourceData
  } as unknown as SupportedManifest
  logger.info('Copying database urlSecret into overlay', {
    from: baseNamespace,
    to: namespace,
    secretName: database.urlSecret.name
  })
  await kubectl.apply(copy, { namespace })
}

function renderPsqlJob(input: {
  namespace: string
  name: string
  database: OverlayDatabase
  sqlSteps: string[]
}): SupportedManifest {
  const { namespace, name, database, sqlSteps } = input
  const sql = sqlSteps.map((s) => s.replace(/"/g, '\\"')).join('; ')

  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name,
      namespace,
      labels: { 'tsops/managed': 'true', 'tsops/hook': 'database' }
    },
    spec: {
      backoffLimit: 1,
      ttlSecondsAfterFinished: 300,
      template: {
        spec: {
          restartPolicy: 'Never',
          containers: [
            {
              name: 'psql',
              image: POSTGRES_IMAGE,
              command: ['/bin/sh', '-c'],
              args: [`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "${sql}"`],
              env: [
                {
                  name: 'DATABASE_URL',
                  valueFrom: {
                    secretKeyRef: {
                      name: database.urlSecret.name,
                      key: database.urlSecret.key
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    }
  }

  return job as unknown as SupportedManifest
}

function renderCustomJob(
  jobName: string,
  namespace: string,
  schema: string,
  database: OverlayDatabase,
  custom: CustomJobConfig
): SupportedManifest {
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace,
      labels: { 'tsops/managed': 'true', 'tsops/hook': 'database' }
    },
    spec: {
      backoffLimit: 1,
      ttlSecondsAfterFinished: 300,
      template: {
        spec: {
          restartPolicy: 'Never',
          containers: [
            {
              name: 'migrate',
              image: custom.image,
              command: custom.command,
              args: custom.args,
              env: [
                {
                  name: 'DATABASE_URL',
                  valueFrom: {
                    secretKeyRef: {
                      name: database.urlSecret.name,
                      key: database.urlSecret.key
                    }
                  }
                },
                { name: 'TSOPS_OVERLAY_SCHEMA', value: schema },
                ...Object.entries(custom.env ?? {}).map(([k, v]) => ({ name: k, value: v }))
              ],
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
