#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { Command } from 'commander'
import { runDev } from './dev.js'

const CONFIG_EXTENSION_ORDER = ['', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'] as const

type LoadedDevConfig = Parameters<typeof runDev>[0]

async function main(): Promise<void> {
  const program = new Command()
    .name('tsops dev')
    .description('Run local applications behind stable Portless URLs')
    .option('-n, --namespace <name>', 'target a local namespace')
    .option('--app <name>', 'run a single app')
    .option('-c, --config <path>', 'path to config file', 'tsops.config')

  program.parse(process.argv.slice(3), { from: 'user' })
  const options = program.opts<{ namespace?: string; app?: string; config: string }>()
  const config = await loadConfig(options.config)
  const code = await runDev(config, {
    namespace: options.namespace,
    app: options.app
  })
  process.exitCode = code
}

async function loadConfig(configPath: string): Promise<LoadedDevConfig> {
  const resolvedPath = resolveConfigPath(configPath)
  try {
    const module = await import(pathToFileURL(resolvedPath).href)
    const exported = module.default ?? (module as { config?: unknown }).config ?? module
    if (!exported || typeof exported !== 'object') {
      throw new Error(`Config module at ${resolvedPath} does not export a configuration object.`)
    }
    return exported as LoadedDevConfig
  } catch (error) {
    if (isTypeScriptFile(resolvedPath) && isUnsupportedExtensionError(error)) {
      throw new Error(
        'Unable to load TypeScript config without a build step. Compile it to ESM or provide a .mjs/.js config.',
        { cause: error as Error }
      )
    }
    throw error
  }
}

function resolveConfigPath(inputPath: string): string {
  const absoluteInput = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath)
  const ext = path.extname(absoluteInput)
  const hasExplicitExtension = ext !== '' && ext !== '.config'
  const candidates = hasExplicitExtension
    ? [absoluteInput]
    : CONFIG_EXTENSION_ORDER.map((extension) =>
        extension ? `${absoluteInput}${extension}` : absoluteInput
      )

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }

  const supportedExtensions = CONFIG_EXTENSION_ORDER.filter((extension) => extension !== '').join(', ')
  const triedMessage = candidates.map((candidate) => `  - ${candidate}`).join('\n')
  const hint = hasExplicitExtension
    ? 'Ensure the path is correct and points to a file.'
    : `Add an extension (${supportedExtensions}) or use --config to specify a full path.`

  throw new Error(
    `Unable to locate config file at ${absoluteInput}.\nTried:\n${triedMessage}\n${hint}`
  )
}

function isTypeScriptFile(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')
}

function isUnsupportedExtensionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return 'code' in error && (error as { code?: string }).code === 'ERR_UNKNOWN_FILE_EXTENSION'
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\n\x1b[31m\x1b[1m❌ Error:\x1b[0m \x1b[31m${message}\x1b[0m\n`)
  process.exitCode = 1
})
