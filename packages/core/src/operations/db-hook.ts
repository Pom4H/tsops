import type { Logger } from '../logger.js'
import type { KubectlClient, SupportedManifest } from '../ports/kubectl.js'
import type { CustomJobConfig, OverlayDatabase, OverlayVars } from '../types.js'

interface DbHookCommonOptions {
  namespace: string
  vars: OverlayVars
  database: OverlayDatabase
  kubectl: KubectlClient
  logger: Logger
}

const POSTGRES_IMAGE = 'postgres:16-alpine'

/**
 * Pre-deploy database hook for overlay namespaces.
 *
 * `preDeploy` controls how aggressive we get:
 *  - `'create-schema'` runs `CREATE SCHEMA IF NOT EXISTS <s>` and stops.
 *  - `'create-and-migrate'` creates the schema and then runs whatever
 *    migration command the project standardised on (the user is expected to
 *    point `DATABASE_URL` at the new schema via `appEnvOverride`).
 *  - A `CustomJobConfig` lets the user supply their own migrate image.
 *
 * The Job lives inside the overlay namespace so it disappears with `down`.
 */
export async function runDatabasePreDeploy(options: DbHookCommonOptions): Promise<void> {
  const { namespace, vars, database, kubectl, logger } = options
  const schema = database.schema(vars)

  if (typeof database.preDeploy === 'object') {
    const job = renderCustomJob(namespace, schema, database, database.preDeploy)
    logger.info('Running custom database pre-deploy job', { namespace, schema })
    await kubectl.apply(job, { namespace })
    return
  }

  const wantMigrate = database.preDeploy === 'create-and-migrate'
  const sqlSteps = [`CREATE SCHEMA IF NOT EXISTS "${schema}"`]

  logger.info('Creating overlay schema', { namespace, schema, migrate: wantMigrate })
  const createJob = renderPsqlJob({
    namespace,
    name: `tsops-db-create-${schema}`,
    database,
    sqlSteps
  })
  await kubectl.apply(createJob, { namespace })

  if (wantMigrate) {
    logger.warn(
      'create-and-migrate selected but tsops does not bundle a migration runner. ' +
        "Provide a CustomJobConfig with your project's migrate image to actually apply migrations.",
      { namespace, schema }
    )
  }
}

/**
 * Post-destroy hook for overlay namespaces. Currently only supports
 * `'drop-schema'`, which runs `DROP SCHEMA <s> CASCADE` against the same
 * connection. This intentionally runs *before* the namespace is deleted so
 * the Job can finish and report status.
 */
export async function runDatabasePostDestroy(options: DbHookCommonOptions): Promise<void> {
  const { namespace, vars, database, kubectl, logger } = options
  const schema = database.schema(vars)

  logger.info('Dropping overlay schema', { namespace, schema })
  const job = renderPsqlJob({
    namespace,
    name: `tsops-db-drop-${schema}`,
    database,
    sqlSteps: [`DROP SCHEMA IF EXISTS "${schema}" CASCADE`]
  })
  await kubectl.apply(job, { namespace })
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
  namespace: string,
  schema: string,
  database: OverlayDatabase,
  custom: CustomJobConfig
): SupportedManifest {
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: `tsops-db-custom-${schema}`,
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
