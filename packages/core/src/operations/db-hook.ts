import { createHash, randomBytes } from 'node:crypto'
import { buildSecret } from '@tsops/k8'
import type { Logger } from '../logger.js'
import type { KubectlClient, SupportedManifest } from '../ports/kubectl.js'
import type {
  CustomJobConfig,
  OverlayDatabase,
  OverlaySecretKeyRef,
  OverlayVars
} from '../types.js'

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

function assertValidIdentifier(kind: string, value: string): void {
  if (!POSTGRES_IDENT.test(value)) {
    throw new Error(
      `Invalid PostgreSQL ${kind} "${value}". ` +
        `${kind} must match ${POSTGRES_IDENT.source} (letters, digits, underscores; 1–63 chars).`
    )
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
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
): Promise<{ jobName: string; timeoutSeconds?: number }> {
  const { namespace, baseNamespace, vars, database, kubectl, logger } = options
  const schema = database.schema(vars)
  assertValidSchema(schema)
  const slug = toK8sName(schema)
  const lifecycleSecret = getLifecycleUrlSecret(database, vars)

  // The Job runs in the overlay namespace and reads `DATABASE_URL` via
  // `secretKeyRef` from a Secret in *that* namespace. The user declares the
  // Secret in the base (static) namespace, so we materialise a copy into the
  // overlay before the Job is applied. Idempotent: re-applying overwrites.
  await ensureUrlSecretInOverlay({
    namespace,
    baseNamespace,
    database,
    lifecycleSecret,
    kubectl,
    logger
  })
  await ensureRuntimeSecretInOverlay({
    namespace,
    vars,
    database,
    lifecycleSecret,
    schema,
    kubectl,
    logger
  })

  if (typeof database.preDeploy === 'object') {
    validateCustomJob(database.preDeploy)
    const jobName = database.preDeploy.name
      ? toK8sName(resolveTemplate(database.preDeploy.name, vars))
      : toK8sName(`tsops-db-custom-${slug}`)
    const job = renderCustomJob(
      jobName,
      namespace,
      schema,
      lifecycleSecret,
      database,
      database.preDeploy,
      vars
    )
    logger.info('Running custom database pre-deploy job', { namespace, schema, jobName })
    await kubectl.apply(job, { namespace })
    return { jobName, timeoutSeconds: database.preDeploy.timeoutSeconds }
  }

  const jobName = toK8sName(`tsops-db-create-${slug}`)
  logger.info('Creating overlay schema', { namespace, schema, jobName })
  const createJob = renderPsqlJob({
    namespace,
    name: jobName,
    database,
    lifecycleSecret,
    vars,
    schema,
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
 * `'drop-schema'`, which tears down the overlay schema through the lifecycle
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
  const lifecycleSecret = getLifecycleUrlSecret(database, vars)

  // Same reason as in runDatabasePreDeploy: the drop Job needs the connection
  // Secret available locally. If the namespace was created by `up` we'd
  // already have it, but `down` has to be safe to call standalone too.
  await ensureUrlSecretInOverlay({
    namespace,
    baseNamespace,
    database,
    lifecycleSecret,
    kubectl,
    logger
  })

  logger.info('Dropping overlay schema', { namespace, schema, jobName })
  const job = renderPsqlJob({
    namespace,
    name: jobName,
    database,
    lifecycleSecret,
    vars,
    schema,
    sqlSteps: buildDropSchemaSqlSteps(database, vars, schema)
  })
  await kubectl.apply(job, { namespace })
  return { jobName }
}

function buildDropSchemaSqlSteps(
  database: OverlayDatabase,
  vars: OverlayVars,
  schema: string
): string[] {
  const quotedSchema = quoteIdentifier(schema)
  const runtimeRole = database.runtimeRole ? resolveTemplate(database.runtimeRole, vars) : undefined

  if (runtimeRole) {
    assertValidIdentifier('runtime role', runtimeRole)
  }

  const steps = [buildExternalDependencyGuard(schema)]
  if (runtimeRole) {
    const quotedRole = quoteIdentifier(runtimeRole)
    steps.push(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} REVOKE ALL ON TABLES FROM ${quotedRole}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} REVOKE ALL ON SEQUENCES FROM ${quotedRole}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} REVOKE ALL ON FUNCTIONS FROM ${quotedRole}`,
      `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${quotedSchema} FROM ${quotedRole}`,
      `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${quotedSchema} FROM ${quotedRole}`,
      `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ${quotedSchema} FROM ${quotedRole}`,
      `REVOKE ALL PRIVILEGES ON SCHEMA ${quotedSchema} FROM ${quotedRole}`
    )
  }

  steps.push(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`)
  if (runtimeRole) {
    steps.push(`DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`)
  }
  return steps
}

function buildExternalDependencyGuard(schema: string): string {
  const literalSchema = sqlLiteral(schema)
  return `
DO $tsops$
BEGIN
  IF EXISTS (
    WITH referenced_objects AS (
      SELECT c.oid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${literalSchema}
    ),
    external_dependencies AS (
      SELECT COALESCE(class_ns.nspname, rewrite_ns.nspname, constraint_ns.nspname) AS dependent_schema
      FROM pg_depend d
      JOIN referenced_objects ref ON ref.oid = d.refobjid
      LEFT JOIN pg_class class_dep
        ON d.classid = 'pg_class'::regclass AND class_dep.oid = d.objid
      LEFT JOIN pg_namespace class_ns ON class_ns.oid = class_dep.relnamespace
      LEFT JOIN pg_rewrite rewrite_dep
        ON d.classid = 'pg_rewrite'::regclass AND rewrite_dep.oid = d.objid
      LEFT JOIN pg_class rewrite_class ON rewrite_class.oid = rewrite_dep.ev_class
      LEFT JOIN pg_namespace rewrite_ns ON rewrite_ns.oid = rewrite_class.relnamespace
      LEFT JOIN pg_constraint constraint_dep
        ON d.classid = 'pg_constraint'::regclass AND constraint_dep.oid = d.objid
      LEFT JOIN pg_class constraint_class ON constraint_class.oid = constraint_dep.conrelid
      LEFT JOIN pg_namespace constraint_ns ON constraint_ns.oid = constraint_class.relnamespace
    )
    SELECT 1
    FROM external_dependencies
    WHERE dependent_schema IS NOT NULL
      AND dependent_schema <> ${literalSchema}
      AND dependent_schema <> 'information_schema'
      AND dependent_schema NOT LIKE 'pg\\_%' ESCAPE '\\'
  ) THEN
    RAISE EXCEPTION 'Refusing to drop schema ${schema}: cross-schema dependencies exist';
  END IF;
END
$tsops$`.trim()
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
  lifecycleSecret: ResolvedSecretKeyRef
  kubectl: KubectlClient
  logger: Logger
}): Promise<void> {
  const { namespace, baseNamespace, lifecycleSecret, kubectl, logger } = input
  const sourceNamespace = lifecycleSecret.sourceNamespace ?? baseNamespace
  if (namespace === sourceNamespace) return
  const source = await kubectl.get('Secret', lifecycleSecret.name, sourceNamespace)
  if (!source) {
    throw new Error(
      `Database hook: Secret "${lifecycleSecret.name}" not found in source namespace "${sourceNamespace}". ` +
        `The overlay's database connection Secret must exist in the base namespace so it can be copied into "${namespace}".`
    )
  }
  const sourceData = (source as unknown as { data?: Record<string, string> }).data ?? {}
  if (!(lifecycleSecret.key in sourceData)) {
    throw new Error(
      `Database hook: Secret "${lifecycleSecret.name}" in namespace "${sourceNamespace}" ` +
        `does not contain key "${lifecycleSecret.key}".`
    )
  }
  const sourceMeta = ((source as unknown as { metadata?: Record<string, unknown> }).metadata ??
    {}) as Record<string, unknown>
  const labels = (sourceMeta.labels as Record<string, string> | undefined) ?? {}
  const copy = {
    apiVersion: 'v1',
    kind: 'Secret',
    type: (source as unknown as { type?: string }).type ?? 'Opaque',
    metadata: {
      name: lifecycleSecret.name,
      namespace,
      labels: {
        ...labels,
        'tsops/managed': 'true',
        'tsops/copied-from': sourceNamespace,
        'tsops/hook': 'database'
      }
    },
    data: sourceData
  } as unknown as SupportedManifest
  logger.info('Copying database urlSecret into overlay', {
    from: sourceNamespace,
    to: namespace,
    secretName: lifecycleSecret.name
  })
  await kubectl.apply(copy, { namespace })
}

async function ensureRuntimeSecretInOverlay(input: {
  namespace: string
  vars: OverlayVars
  database: OverlayDatabase
  lifecycleSecret: ResolvedSecretKeyRef
  schema: string
  kubectl: KubectlClient
  logger: Logger
}): Promise<void> {
  const { namespace, vars, database, lifecycleSecret, schema, kubectl, logger } = input
  const runtimeSecret = database.runtimeSecret
  if (runtimeSecret?.mode !== 'generated-per-overlay') return
  if (!database.runtimeRole) {
    throw new Error(
      'Database hook: database.runtimeRole is required when runtimeSecret.mode is "generated-per-overlay".'
    )
  }

  const secretName = resolveTemplate(runtimeSecret.name, vars)
  const runtimeRole = resolveTemplate(database.runtimeRole, vars)
  assertValidIdentifier('runtime role', runtimeRole)

  const existing = await kubectl.getSecretData(secretName, namespace)
  if (
    existing?.[runtimeSecret.key] &&
    existing.DATABASE_PASSWORD &&
    existing.DATABASE_SCHEMA === schema &&
    existing.DATABASE_RUNTIME_ROLE === runtimeRole
  ) {
    logger.info('Using existing generated runtime database Secret', {
      namespace,
      secretName,
      schema
    })
    return
  }

  const lifecycleData = await kubectl.getSecretData(lifecycleSecret.name, namespace)
  const lifecycleUrl = lifecycleData?.[lifecycleSecret.key]
  if (!lifecycleUrl) {
    throw new Error(
      `Database hook: Secret "${lifecycleSecret.name}" in namespace "${namespace}" ` +
        `does not contain decoded key "${lifecycleSecret.key}" required to generate runtime credentials.`
    )
  }

  const password = randomBytes(32).toString('base64url')
  const runtimeUrl = buildRuntimeDatabaseUrl(lifecycleUrl, runtimeRole, password)
  const manifest = buildSecret(
    secretName,
    namespace,
    {
      [runtimeSecret.key]: runtimeUrl,
      DATABASE_PASSWORD: password,
      DATABASE_SCHEMA: schema,
      DATABASE_RUNTIME_ROLE: runtimeRole
    },
    {
      'tsops/managed': 'true',
      'tsops/hook': 'database',
      'tsops/secret-purpose': 'preview-runtime-database'
    }
  )

  logger.info('Creating generated runtime database Secret', {
    namespace,
    secretName,
    schema,
    runtimeRole
  })
  await kubectl.apply(manifest as unknown as SupportedManifest, { namespace })
}

function buildRuntimeDatabaseUrl(lifecycleUrl: string, runtimeRole: string, password: string) {
  let url: URL
  try {
    url = new URL(lifecycleUrl)
  } catch {
    throw new Error('Database hook: lifecycle DATABASE_URL must be a valid PostgreSQL URL.')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      `Database hook: lifecycle DATABASE_URL must use postgres/postgresql protocol, got "${url.protocol}".`
    )
  }

  url.username = runtimeRole
  url.password = password
  url.searchParams.delete('schema')
  return url.toString()
}

function renderPsqlJob(input: {
  namespace: string
  name: string
  database: OverlayDatabase
  lifecycleSecret: ResolvedSecretKeyRef
  vars: OverlayVars
  schema: string
  sqlSteps: string[]
}): SupportedManifest {
  const { namespace, name, database, lifecycleSecret, vars, schema, sqlSteps } = input
  const sql = shellDoubleQuoted(sqlSteps.join('; '))

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
                      name: lifecycleSecret.name,
                      key: lifecycleSecret.key
                    }
                  }
                },
                ...renderDatabaseMetadataEnv(database, vars, schema),
                ...renderRuntimeSecretEnv(database, vars)
              ]
            }
          ]
        }
      }
    }
  }

  return job as unknown as SupportedManifest
}

function shellDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
}

function renderCustomJob(
  jobName: string,
  namespace: string,
  schema: string,
  lifecycleSecret: ResolvedSecretKeyRef,
  database: OverlayDatabase,
  custom: CustomJobConfig,
  vars: OverlayVars
): SupportedManifest {
  const command = custom.command ? resolveTemplate(custom.command, vars) : undefined
  const args = custom.args ? resolveTemplate(custom.args, vars) : undefined
  const customEnv = typeof custom.env === 'function' ? custom.env(vars) : (custom.env ?? {})
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
              command,
              args,
              env: [
                {
                  name: 'DATABASE_URL',
                  valueFrom: {
                    secretKeyRef: {
                      name: lifecycleSecret.name,
                      key: lifecycleSecret.key
                    }
                  }
                },
                { name: 'TSOPS_OVERLAY_SCHEMA', value: schema },
                ...renderDatabaseMetadataEnv(database, vars, schema),
                ...renderRuntimeSecretEnv(database, vars),
                ...Object.entries(customEnv).map(([k, v]) => ({ name: k, value: v }))
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

interface ResolvedSecretKeyRef {
  name: string
  key: string
  sourceNamespace?: string
}

function getLifecycleUrlSecret(database: OverlayDatabase, vars: OverlayVars): ResolvedSecretKeyRef {
  const configured = database.lifecycleUrlSecret ?? database.urlSecret
  if (!configured) {
    throw new Error(
      'Database hook requires database.lifecycleUrlSecret (or legacy database.urlSecret).'
    )
  }
  return {
    name: resolveTemplate((configured as OverlaySecretKeyRef).name, vars),
    key: configured.key,
    sourceNamespace: configured.sourceNamespace
  }
}

function resolveTemplate<T>(value: T | ((vars: OverlayVars) => T), vars: OverlayVars): T {
  return typeof value === 'function' ? (value as (vars: OverlayVars) => T)(vars) : value
}

function renderDatabaseMetadataEnv(
  database: OverlayDatabase,
  vars: OverlayVars,
  schema: string | undefined
): Array<{ name: string; value: string }> {
  const env: Array<{ name: string; value: string }> = []
  const runtimeSecret = database.runtimeSecret
  if (runtimeSecret?.mode === 'generated-per-overlay') {
    env.push(
      {
        name: 'DATABASE_RUNTIME_SECRET_NAME',
        value: resolveTemplate(runtimeSecret.name, vars)
      },
      { name: 'DATABASE_RUNTIME_SECRET_KEY', value: runtimeSecret.key }
    )
  }
  if (database.runtimeRole) {
    env.push({
      name: 'DATABASE_RUNTIME_ROLE',
      value: resolveTemplate(database.runtimeRole, vars)
    })
  }
  if (schema) {
    env.push({ name: 'DATABASE_SCHEMA', value: schema })
  }
  return dedupeEnv(env)
}

function renderRuntimeSecretEnv(
  database: OverlayDatabase,
  vars: OverlayVars
): Array<{ name: string; valueFrom: { secretKeyRef: { name: string; key: string } } }> {
  const runtimeSecret = database.runtimeSecret
  if (runtimeSecret?.mode !== 'generated-per-overlay') return []
  const secretName = resolveTemplate(runtimeSecret.name, vars)
  return [
    {
      name: 'DATABASE_RUNTIME_URL',
      valueFrom: {
        secretKeyRef: {
          name: secretName,
          key: runtimeSecret.key
        }
      }
    },
    {
      name: 'DATABASE_RUNTIME_PASSWORD',
      valueFrom: {
        secretKeyRef: {
          name: secretName,
          key: 'DATABASE_PASSWORD'
        }
      }
    }
  ]
}

function dedupeEnv(
  env: Array<{ name: string; value: string }>
): Array<{ name: string; value: string }> {
  const seen = new Set<string>()
  return env.filter((item) => {
    if (seen.has(item.name)) return false
    seen.add(item.name)
    return true
  })
}
