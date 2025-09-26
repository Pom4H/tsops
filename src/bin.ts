#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { Command } from 'commander'
import { TsOps } from './core.js'
import { serializeManifests } from './core/kubectl-client.js'
import type {
  TsOpsConfig,
  BuildOptions,
  PushOptions,
  DeployOptions,
  RunOptions,
  RenderOptions,
  DeleteOptions,
  RenderedService
} from './types.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version?: string }

const DEFAULT_CONFIG_BASENAME = 'tsops.config'
const tsOpsCache = new Map<string, TsOps>()

type RenderFormat = 'yaml' | 'json'

type GlobalOptions = { config: string }

type BuildCommandOptions = { environment?: string; env?: string[]; push?: boolean }

type PushCommandOptions = {
  environment?: string
  skipBuild?: boolean
  env?: string[]
}

type RunCommandOptions = {
  environment?: string
  skipBuild?: boolean
  skipTests?: boolean
  diff?: boolean
  diffOnly?: boolean
  skipHooks?: boolean
  notify?: boolean
  imageTag?: string
  env?: string[]
}

type DeployCommandOptions = {
  environment?: string
  diff?: boolean
  diffOnly?: boolean
  skipHooks?: boolean
  notify?: boolean
  imageTag?: string
}

type RenderCommandOptions = {
  environment?: string
  imageTag?: string
  format?: string
  output?: string
}

type DeleteCommandOptions = {
  environment?: string
  imageTag?: string
  ignoreNotFound?: boolean
  gracePeriod?: string
}

type SecretSetCommandOptions = {
  environment?: string
  data?: string[]
  type?: string
  label?: string[]
  annotation?: string[]
}

type SecretGetCommandOptions = {
  environment?: string
}

type SecretDeleteCommandOptions = {
  environment?: string
  ignoreNotFound?: boolean
}

function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.error(`[tsops] ${error.message}`)
  } else {
    console.error('[tsops] Unknown error', error)
  }
  process.exitCode = 1
}

const collectKeyValue = (value: string, previous?: string[]): string[] => {
  const list = previous ? [...previous] : []
  list.push(value)
  return list
}

const parseKeyValuePairs = (pairs: string[] | undefined): Record<string, string> => {
  if (!pairs || pairs.length === 0) {
    return {}
  }

  return pairs.reduce<Record<string, string>>((acc, entry) => {
    const index = entry.indexOf('=')
    if (index === -1) {
      throw new Error(`Invalid env var specification "${entry}". Use KEY=VALUE format.`)
    }

    const key = entry.slice(0, index).trim()
    const value = entry.slice(index + 1)
    if (!key) {
      throw new Error(`Invalid env var specification "${entry}". Key is required.`)
    }

    acc[key] = value
    return acc
  }, {})
}

const resolveConfigPath = (inputPath: string): string => {
  const absoluteInput = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath)

  const candidates = [
    absoluteInput,
    `${absoluteInput}.ts`,
    `${absoluteInput}.mts`,
    `${absoluteInput}.cts`,
    `${absoluteInput}.js`,
    `${absoluteInput}.cjs`,
    `${absoluteInput}.mjs`
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Unable to locate config file at ${absoluteInput}`)
}

const importConfigModule = async (configPath: string): Promise<TsOpsConfig> => {
  const imported = await import(configPath)

  const resolved =
    typeof imported === 'object' && imported !== null && 'default' in imported
      ? (imported as { default: TsOpsConfig }).default
      : imported

  const config = resolved as TsOpsConfig | undefined
  if (!config) {
    throw new Error(`Config module at ${configPath} does not export a configuration object.`)
  }

  return config
}

const getTsOps = async (configPathInput: string): Promise<TsOps> => {
  const resolvedPath = resolveConfigPath(configPathInput)
  const cached = tsOpsCache.get(resolvedPath)
  if (cached) {
    return cached
  }

  const config = await importConfigModule(resolvedPath)
  const instance = new TsOps(config, { cwd: process.cwd() })
  tsOpsCache.set(resolvedPath, instance)
  return instance
}

const ensureRenderFormat = (value: string | undefined): RenderFormat => {
  if (!value) {
    return 'yaml'
  }

  const normalized = value.toLowerCase()
  if (normalized === 'yaml' || normalized === 'json') {
    return normalized as RenderFormat
  }

  throw new Error(`Unsupported render format "${value}". Use "yaml" or "json".`)
}

const renderServicesToYaml = (services: RenderedService[]): string => {
  const sections: string[] = []
  for (const { service, manifests } of services) {
    if (manifests.length === 0) {
      sections.push(`# Service: ${service}\n# (no manifests)`)
      continue
    }

    const payload = serializeManifests(manifests)
    sections.push(`# Service: ${service}\n${payload}`)
  }

  return sections.join('\n')
}

const renderServicesToJson = (services: RenderedService[]): string =>
  JSON.stringify(
    services.map(({ service, manifests, imageTag, context }) => ({
      service,
      imageTag,
      context,
      manifests
    })),
    null,
    2
  )

const writeOutput = async (content: string, outputPath?: string): Promise<void> => {
  const normalized = content.endsWith('\n') ? content : `${content}\n`
  if (!outputPath) {
    process.stdout.write(normalized)
    return
  }

  const targetPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath)
  await fs.promises.writeFile(targetPath, normalized, 'utf-8')
}

export const createProgram = (): Command => {
  const program = new Command()
  program
    .name('tsops')
    .description('Stateless operations CLI powered by TsOps configuration')
    .version(packageJson.version ?? '0.0.0')
    .option('-c, --config <path>', 'Path to tsops config file', `${DEFAULT_CONFIG_BASENAME}.ts`)

  program
    .command('build [service]')
    .description('Run the build pipeline for a service (or all services when omitted)')
    .option('-e, --environment <env>', 'Target environment for the build pipeline')
    .option('--push', 'Push built images to registry')
    .option(
      '--env <key=value>',
      'Inject environment variable (can be repeated)',
      collectKeyValue,
      []
    )
    .action(async (service: string | undefined, commandOptions: BuildCommandOptions) => {
      try {
        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)

        const envVars = parseKeyValuePairs(commandOptions.env)
        const buildOptions: BuildOptions = {
          environment: commandOptions.environment,
          env: envVars,
          push: commandOptions.push
        }

        if (service) {
          await tsops.build(service, buildOptions)
        } else {
          await tsops.buildAll(commandOptions.environment, buildOptions)
        }
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('push [service]')
    .description(
      'Build and push Docker images to registry for a service (or all services when omitted)'
    )
    .option('-e, --environment <env>', 'Target environment for the push pipeline')
    .option('--skip-build', 'Skip the build phase and only push existing images')
    .option(
      '--env <key=value>',
      'Inject environment variable (can be repeated)',
      collectKeyValue,
      []
    )
    .action(async (service: string | undefined, commandOptions: PushCommandOptions) => {
      try {
        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)

        const envVars = parseKeyValuePairs(commandOptions.env)
        const pushOptions: PushOptions = {
          environment: commandOptions.environment,
          env: envVars,
          skipBuild: commandOptions.skipBuild
        }

        if (service) {
          await tsops.push(service, pushOptions)
        } else {
          await tsops.pushAll(commandOptions.environment, pushOptions)
        }
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('test')
    .description('Run the configured test pipeline')
    .action(async () => {
      try {
        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)
        await tsops.test()
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('run [service]')
    .description('Build, test, and deploy in one pass (skaffold run)')
    .option('-e, --environment <env>', 'Target environment name')
    .option('--skip-build', 'Skip the build phase')
    .option('--skip-tests', 'Skip the test phase')
    .option('--diff', 'Run diff before deployment')
    .option('--diff-only', 'Run diff and skip deployment')
    .option('--skip-hooks', 'Skip before/after deploy hooks')
    .option('--no-notify', 'Disable notifications for this run')
    .option('--image-tag <tag>', 'Override the image tag used for manifest rendering')
    .option(
      '--env <key=value>',
      'Inject environment variable for the build phase (repeatable)',
      collectKeyValue,
      []
    )
    .action(async (service: string | undefined, commandOptions: RunCommandOptions) => {
      try {
        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)

        const envVars = parseKeyValuePairs(commandOptions.env)
        const runOptions: RunOptions = {
          environment: commandOptions.environment,
          skipBuild: Boolean(commandOptions.skipBuild),
          skipTests: Boolean(commandOptions.skipTests),
          diff: commandOptions.diff || commandOptions.diffOnly,
          diffOnly: commandOptions.diffOnly,
          skipHooks: commandOptions.skipHooks,
          notify: commandOptions.notify,
          imageTag: commandOptions.imageTag,
          env: envVars
        }

        if (service) {
          await tsops.run(service, commandOptions.environment, runOptions)
        } else {
          await tsops.runAll(commandOptions.environment, runOptions)
        }
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('render [service]')
    .description('Render manifests without deploying (skaffold render)')
    .option('-e, --environment <env>', 'Target environment name')
    .option('--image-tag <tag>', 'Override the image tag used for manifest rendering')
    .option('-f, --format <format>', 'Output format: yaml or json', 'yaml')
    .option('-o, --output <path>', 'Write rendered output to a file instead of stdout')
    .action(async (service: string | undefined, commandOptions: RenderCommandOptions) => {
      try {
        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)
        const format = ensureRenderFormat(commandOptions.format)

        const renderOptions: RenderOptions = {
          environment: commandOptions.environment,
          imageTag: commandOptions.imageTag
        }

        let rendered: RenderedService[]
        if (service) {
          const result = await tsops.render(service, commandOptions.environment, renderOptions)
          rendered = [{ service, ...result }]
        } else {
          rendered = await tsops.renderAll(commandOptions.environment, renderOptions)
          if (rendered.length === 0) {
            return
          }
        }

        const output =
          format === 'json' ? renderServicesToJson(rendered) : renderServicesToYaml(rendered)

        await writeOutput(output, commandOptions.output)
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('deploy [service]')
    .description('Run the deploy pipeline for a service (or all services when omitted)')
    .option('-e, --environment <env>', 'Target environment name')
    .option('--diff', 'Run diff before deployment')
    .option('--diff-only', 'Run diff and skip deployment')
    .option('--skip-hooks', 'Skip before/after deploy hooks')
    .option('--no-notify', 'Disable notifications for this run')
    .option('--image-tag <tag>', 'Override the image tag used for manifest rendering')
    .action(async (service: string | undefined, commandOptions: DeployCommandOptions) => {
      try {
        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)

        const deployOptions: DeployOptions = {
          environment: commandOptions.environment,
          diff: commandOptions.diff || commandOptions.diffOnly,
          diffOnly: commandOptions.diffOnly,
          skipHooks: commandOptions.skipHooks,
          notify: commandOptions.notify,
          imageTag: commandOptions.imageTag
        }

        if (service) {
          await tsops.deploy(service, undefined, deployOptions)
        } else {
          await tsops.deployAll(commandOptions.environment, deployOptions)
        }
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('delete [service]')
    .description('Delete previously applied manifests (skaffold delete)')
    .option('-e, --environment <env>', 'Target environment name')
    .option('--image-tag <tag>', 'Override the image tag used for manifest rendering')
    .option('--ignore-not-found', 'Suppress errors for missing resources')
    .option('--grace-period <seconds>', 'Override kubectl delete grace period in seconds')
    .action(async (service: string | undefined, commandOptions: DeleteCommandOptions) => {
      try {
        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)

        let gracePeriodSeconds: number | undefined
        if (commandOptions.gracePeriod !== undefined) {
          const parsed = Number(commandOptions.gracePeriod)
          if (Number.isNaN(parsed)) {
            throw new Error(`Invalid grace period: ${commandOptions.gracePeriod}`)
          }
          gracePeriodSeconds = parsed
        }

        const deleteOptions: DeleteOptions = {
          environment: commandOptions.environment,
          imageTag: commandOptions.imageTag,
          ignoreNotFound: Boolean(commandOptions.ignoreNotFound),
          gracePeriodSeconds
        }

        if (service) {
          await tsops.delete(service, commandOptions.environment, deleteOptions)
        } else {
          await tsops.deleteAll(commandOptions.environment, deleteOptions)
        }
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('secret:set <name>')
    .description('Create or update a Kubernetes Secret in the target environment')
    .option('-e, --environment <env>', 'Target environment name')
    .option('--type <type>', 'Secret type (defaults to Opaque)')
    .option('--data <key=value>', 'Secret data entry (repeatable)', collectKeyValue, [])
    .option('--label <key=value>', 'Label to apply to the Secret (repeatable)', collectKeyValue, [])
    .option(
      '--annotation <key=value>',
      'Annotation to apply to the Secret (repeatable)',
      collectKeyValue,
      []
    )
    .action(async (name: string, commandOptions: SecretSetCommandOptions) => {
      try {
        const environment = commandOptions.environment
        if (!environment) {
          throw new Error('Environment is required. Pass --environment <env>.')
        }

        const data = parseKeyValuePairs(commandOptions.data)
        if (Object.keys(data).length === 0) {
          throw new Error('At least one --data KEY=VALUE pair is required.')
        }

        const labels = parseKeyValuePairs(commandOptions.label)
        const annotations = parseKeyValuePairs(commandOptions.annotation)

        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)

        await tsops.upsertSecret(environment, name, data, {
          type: commandOptions.type,
          labels: Object.keys(labels).length > 0 ? labels : undefined,
          annotations: Object.keys(annotations).length > 0 ? annotations : undefined
        })
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('secret:get <name>')
    .description('Read a Kubernetes Secret and print the decoded data')
    .option('-e, --environment <env>', 'Target environment name')
    .action(async (name: string, commandOptions: SecretGetCommandOptions) => {
      try {
        const environment = commandOptions.environment
        if (!environment) {
          throw new Error('Environment is required. Pass --environment <env>.')
        }

        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)
        const secret = await tsops.readSecret(environment, name)

        const output = JSON.stringify(secret, null, 2)
        process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  program
    .command('secret:delete <name>')
    .description('Delete a Kubernetes Secret from the target environment')
    .option('-e, --environment <env>', 'Target environment name')
    .option('--ignore-not-found', 'Do not fail if the Secret does not exist')
    .action(async (name: string, commandOptions: SecretDeleteCommandOptions) => {
      try {
        const environment = commandOptions.environment
        if (!environment) {
          throw new Error('Environment is required. Pass --environment <env>.')
        }

        const globalOptions = program.opts<GlobalOptions>()
        const tsops = await getTsOps(globalOptions.config)

        await tsops.deleteSecret(environment, name, {
          ignoreNotFound: Boolean(commandOptions.ignoreNotFound)
        })
      } catch (error) {
        handleError(error)
      }
    })

  return program
}

export const resetTsOpsCache = (): void => {
  tsOpsCache.clear()
}

if (process.env.TSOPS_CLI_TEST_MODE !== '1') {
  createProgram()
    .parseAsync(process.argv)
    .catch((error) => {
      handleError(error)
    })
}
