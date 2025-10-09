#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { Command } from 'commander'
import {
  createNodeTsOps,
  GitEnvironmentProvider,
  ProcessEnvironmentProvider
} from '@tsops/node'

const CONFIG_EXTENSION_ORDER = ['', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'] as const

async function main(): Promise<void> {
  const program = new Command()

  program
    .name('tsops')
    .description('TypeScript-first toolkit for planning, building, and deploying to Kubernetes')
    .version('0.1.0')

  program
    .command('plan')
    .description('Validate manifests and show changes that would be applied to the cluster')
    .option('-n, --namespace <name>', 'target a single namespace')
    .option('--app <name>', 'target a single app')
    .option('-c, --config <path>', 'path to config file', 'tsops.config')
    .option('--dry-run', 'skip external commands, log actions only')
    .action(async (options) => {
      const config = await loadConfig(options.config)
      const tsops = createNodeTsOps(config, {
        dryRun: options.dryRun,
        env: new GitEnvironmentProvider(new ProcessEnvironmentProvider())
      })
      
      console.log('📋 Generating deployment plan and validating manifests...\n')
      
      const result = await tsops.planWithChanges({ 
        namespace: options.namespace, 
        app: options.app 
      })

      let hasChanges = false
      let hasErrors = false

      // Display global artifacts (namespaces, secrets, configmaps)
      console.log('🌐 Global Resources\n')
      
      // Namespaces
      const nsChanges = [...result.global.namespaces]
      const nsErrors = nsChanges.filter(c => !c.validated)
      const nsCreates = nsChanges.filter(c => c.validated && c.action === 'create')
      const nsUpdates = nsChanges.filter(c => c.validated && c.action === 'update')
      const nsUnchanged = nsChanges.filter(c => c.validated && c.action === 'unchanged')

      if (nsErrors.length > 0) {
        hasErrors = true
        console.log('   ❌ Namespace Errors:')
        for (const change of nsErrors) {
          console.log(`      • ${change.name}`)
          if (change.validationError) {
            console.log(`        ${change.validationError}`)
          }
        }
        console.log()
      }
      if (nsCreates.length > 0) {
        hasChanges = true
        console.log('   ➕ Namespaces to create:')
        for (const change of nsCreates) {
          console.log(`      • ${change.name}`)
        }
        console.log()
      }
      if (nsUpdates.length > 0) {
        hasChanges = true
        console.log('   🔄 Namespaces to update:')
        for (const change of nsUpdates) {
          console.log(`      • ${change.name}`)
        }
        console.log()
      }
      if (nsUnchanged.length > 0 && nsCreates.length === 0 && nsUpdates.length === 0 && nsErrors.length === 0) {
        console.log(`   ✅ Namespaces (${nsUnchanged.length}) - up to date`)
        console.log()
      }

      // Secrets
      const secretChanges = [...result.global.secrets]
      const secretErrors = secretChanges.filter(c => !c.validated)
      const secretCreates = secretChanges.filter(c => c.validated && c.action === 'create')
      const secretUpdates = secretChanges.filter(c => c.validated && c.action === 'update')
      const secretUnchanged = secretChanges.filter(c => c.validated && c.action === 'unchanged')

      if (secretErrors.length > 0) {
        hasErrors = true
        console.log('   ❌ Secret Errors:')
        for (const change of secretErrors) {
          console.log(`      • ${change.namespace}/${change.name}`)
          if (change.validationError) {
            console.log(`        ${change.validationError}`)
          }
        }
        console.log()
      }
      if (secretCreates.length > 0) {
        hasChanges = true
        console.log('   ➕ Secrets to create:')
        for (const change of secretCreates) {
          console.log(`      • ${change.namespace}/${change.name}`)
        }
        console.log()
      }
      if (secretUpdates.length > 0) {
        hasChanges = true
        console.log('   🔄 Secrets to update:')
        for (const change of secretUpdates) {
          console.log(`      • ${change.namespace}/${change.name}`)
        }
        console.log()
      }
      if (secretUnchanged.length > 0 && secretCreates.length === 0 && secretUpdates.length === 0 && secretErrors.length === 0) {
        console.log(`   ✅ Secrets (${secretUnchanged.length}) - up to date`)
        console.log()
      }

      // ConfigMaps
      const cmChanges = [...result.global.configMaps]
      const cmErrors = cmChanges.filter(c => !c.validated)
      const cmCreates = cmChanges.filter(c => c.validated && c.action === 'create')
      const cmUpdates = cmChanges.filter(c => c.validated && c.action === 'update')
      const cmUnchanged = cmChanges.filter(c => c.validated && c.action === 'unchanged')

      if (cmErrors.length > 0) {
        hasErrors = true
        console.log('   ❌ ConfigMap Errors:')
        for (const change of cmErrors) {
          console.log(`      • ${change.namespace}/${change.name}`)
          if (change.validationError) {
            console.log(`        ${change.validationError}`)
          }
        }
        console.log()
      }
      if (cmCreates.length > 0) {
        hasChanges = true
        console.log('   ➕ ConfigMaps to create:')
        for (const change of cmCreates) {
          console.log(`      • ${change.namespace}/${change.name}`)
        }
        console.log()
      }
      if (cmUpdates.length > 0) {
        hasChanges = true
        console.log('   🔄 ConfigMaps to update:')
        for (const change of cmUpdates) {
          console.log(`      • ${change.namespace}/${change.name}`)
        }
        console.log()
      }
      if (cmUnchanged.length > 0 && cmCreates.length === 0 && cmUpdates.length === 0 && cmErrors.length === 0) {
        console.log(`   ✅ ConfigMaps (${cmUnchanged.length}) - up to date`)
        console.log()
      }

      console.log('─'.repeat(60))
      console.log()

      // Display app-specific resources
      console.log('📦 Application Resources\n')
      
      for (const app of result.apps) {
        const hostSegment = app.host ? ` (${app.host})` : ''
        console.log(`\n   ${app.app} @ ${app.namespace}${hostSegment}`)
        console.log(`   Image: ${app.image}`)
        console.log()

        // Group changes by action
        const creates = app.changes.filter((c: any) => c.action === 'create')
        const updates = app.changes.filter((c: any) => c.action === 'update')
        const unchanged = app.changes.filter((c: any) => c.action === 'unchanged')
        const errors = app.changes.filter((c: any) => !c.validated)

        if (errors.length > 0) {
          hasErrors = true
          console.log('      ❌ Validation Errors:')
          for (const change of errors) {
            console.log(`         • ${change.kind}/${change.name}`)
            if (change.validationError) {
              console.log(`           ${change.validationError}`)
            }
          }
          console.log()
        }

        if (creates.length > 0) {
          hasChanges = true
          console.log('      ➕ Will create:')
          for (const change of creates) {
            console.log(`         • ${change.kind}/${change.name}`)
          }
          console.log()
        }

        if (updates.length > 0) {
          hasChanges = true
          console.log('      🔄 Will update:')
          for (const change of updates) {
            console.log(`         • ${change.kind}/${change.name}`)
            if (change.diff && !options.dryRun) {
              // Show diff (indent each line)
              const diffLines = change.diff.split('\n')
              for (const line of diffLines) {
                if (line.trim()) {
                  console.log(`           ${line}`)
                }
              }
            }
          }
          console.log()
        }

        if (unchanged.length > 0 && creates.length === 0 && updates.length === 0 && errors.length === 0) {
          console.log('      ✅ All resources up to date')
          console.log()
        }
      }

      // Display orphaned resources (resources in cluster but not in config)
      if (result.orphaned && result.orphaned.length > 0) {
        hasChanges = true
        console.log('\n🗑️  Orphaned Resources (will be deleted)\n')
        
        // Group by namespace
        type OrphanedResource = typeof result.orphaned[number]
        const byNamespace = new Map<string, OrphanedResource[]>()
        for (const resource of result.orphaned) {
          if (!byNamespace.has(resource.namespace)) {
            byNamespace.set(resource.namespace, [])
          }
          const nsResources = byNamespace.get(resource.namespace)
          if (nsResources) {
            nsResources.push(resource)
          }
        }
        
        for (const [namespace, resources] of byNamespace) {
          console.log(`   Namespace: ${namespace}`)
          for (const resource of resources) {
            console.log(`      🗑️  ${resource.kind}/${resource.name}`)
          }
          console.log()
        }
      }

      // Summary
      console.log('\n' + '─'.repeat(60))
      if (hasErrors) {
        console.log('❌ Validation failed. Please fix the errors above.')
        process.exit(1)
      } else if (hasChanges) {
        console.log('✅ Validation passed. Run "tsops deploy" to apply these changes.')
      } else {
        console.log('✅ All resources are up to date. No changes to apply.')
      }
    })

  program
    .command('build')
    .description('Build and push Docker images')
    .option('--app <name>', 'target a single app')
    .option('-n, --namespace <name>', 'used to determine dev/prod context')
    .option('-c, --config <path>', 'path to config file', 'tsops.config')
    .option('--dry-run', 'skip external commands, log actions only')
    .action(async (options) => {
      const config = await loadConfig(options.config)
      const tsops = createNodeTsOps(config, {
        dryRun: options.dryRun,
        env: new GitEnvironmentProvider(new ProcessEnvironmentProvider())
      })
      const result = await tsops.build({ namespace: options.namespace, app: options.app })

      for (const item of result.images) {
        console.log(`- built ${item.app}: ${item.image}`)
      }
    })

  program
    .command('deploy')
    .description('Generate and apply Kubernetes manifests')
    .option('-n, --namespace <name>', 'target a single namespace')
    .option('--app <name>', 'target a single app')
    .option('-c, --config <path>', 'path to config file', 'tsops.config')
    .option('--dry-run', 'skip external commands, log actions only')
    .action(async (options) => {
      const config = await loadConfig(options.config)
      const tsops = createNodeTsOps(config, {
        dryRun: options.dryRun,
        env: new GitEnvironmentProvider(new ProcessEnvironmentProvider())
      })
      const result = await tsops.deploy({ namespace: options.namespace, app: options.app })

      console.log('✅ Deployed applications:')
      for (const entry of result.entries) {
        console.log(`\n- ${entry.app} @ ${entry.namespace}`)
        entry.appliedManifests.forEach((manifest: string) => console.log(`  • ${manifest}`))
      }

      if (result.deletedManifests && result.deletedManifests.length > 0) {
        console.log('\n🗑️  Deleted orphaned resources:')
        result.deletedManifests.forEach((manifest: string) => console.log(`  • ${manifest}`))
      }
    })


  await program.parseAsync(process.argv)
}

async function loadConfig(configPath: string): Promise<any> {
  const resolvedPath = resolveConfigPath(configPath)
  try {
    const module = await import(pathToFileURL(resolvedPath).href)
    const exported = module.default ?? (module as { config?: unknown }).config ?? module
    if (!exported) {
      throw new Error(`Config module at ${resolvedPath} does not export a configuration object.`)
    }
    return exported
  } catch (error) {
    if (isTypeScriptFile(resolvedPath) && isUnsupportedExtensionError(error)) {
      const hint =
        'Unable to load TypeScript config without a build step. Compile it to ESM (e.g. pnpm tsx ... or tsc) or provide a .mjs/.js config.'
      throw new Error(hint, { cause: error as Error })
    }
    throw error
  }
}

function resolveConfigPath(inputPath: string): string {
  const absoluteInput = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath)

  // Treat bare names (like "tsops.config") as extension-less and try known extensions
  // If a real extension is present (e.g., .ts, .mjs), use it as-is
  const ext = path.extname(absoluteInput)
  const hasExplicitExtension = ext !== '' && ext !== '.config'
  const candidates = hasExplicitExtension
    ? [absoluteInput]
    : CONFIG_EXTENSION_ORDER.map((extension) =>
        extension ? `${absoluteInput}${extension}` : absoluteInput
      )

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }

  // Provide a helpful error that lists what we tried and which extensions are supported
  const supportedExtensions = CONFIG_EXTENSION_ORDER.filter((e) => e !== '').join(', ')
  const triedMessage = candidates.map((c) => `  - ${c}`).join('\n')
  const hint = hasExplicitExtension
    ? 'Ensure the path is correct and points to a file.'
    : `Add an extension (${supportedExtensions}) or use --config to specify a full path.`

  throw new Error(
    `Unable to locate config file at ${absoluteInput}.\n` +
    `Tried:\n${triedMessage}\n` +
    `${hint}`
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
  // Red color for errors
  const red = '\x1b[31m'
  const reset = '\x1b[0m'
  const bold = '\x1b[1m'
  
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\n${red}${bold}❌ Error:${reset} ${red}${message}${reset}\n`)
  
  process.exit(1)
})
