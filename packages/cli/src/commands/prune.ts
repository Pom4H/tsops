/**
 * Prune command implementation
 * Generates runtime configuration for a specific service and its dependencies
 */

import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'

export interface PruneOptions {
  service: string
  output?: string
  namespace?: string
  format?: 'typescript' | 'javascript' | 'json'
  minimal?: boolean
  includeTransitive?: boolean
}

export function createPruneCommand(): Command {
  return new Command('prune')
    .description('Generate runtime configuration for a specific service and its dependencies')
    .argument('<service>', 'Service name to prune')
    .option('-o, --output <path>', 'Output file path', 'tsops.runtime.ts')
    .option('-n, --namespace <name>', 'Target namespace', 'default')
    .option('-f, --format <format>', 'Output format', 'typescript')
    .option('--minimal', 'Generate minimal configuration (only direct dependencies)')
    .option('--include-transitive', 'Include transitive dependencies')
    .action(async (service: string, options: PruneOptions) => {
      try {
        await pruneService(service, options)
      } catch (error) {
        console.error(`❌ Error pruning service '${service}':`, error)
        process.exit(1)
      }
    })
}

async function pruneService(service: string, options: PruneOptions): Promise<void> {
  console.log(`🔍 Pruning service: ${service}`)
  console.log(`📦 Output: ${options.output}`)
  console.log(`🏷️  Namespace: ${options.namespace}`)
  console.log(`📄 Format: ${options.format}`)
  
  // Load configuration
  const config = await loadConfig('tsops.config')
  
  if (!config.services) {
    throw new Error('Configuration does not contain services. Make sure you are using defineConfigV2.')
  }
  
  // Find the service
  const serviceConfig = config.services[service]
  if (!serviceConfig) {
    throw new Error(`Service '${service}' not found in configuration`)
  }
  
  // Generate pruned configuration
  const prunedConfig = generatePrunedConfig(config, service, options)
  
  // Write to file
  await writePrunedConfig(prunedConfig, options)
  
  console.log(`✅ Generated pruned configuration for service: ${service}`)
  console.log(`📁 File: ${options.output}`)
  
  if (prunedConfig.dependencies.length > 0) {
    console.log(`🔗 Dependencies: ${prunedConfig.dependencies.map(d => d.service).join(', ')}`)
  }
}

async function loadConfig(configPath: string): Promise<any> {
  const resolvedPath = resolveConfigPath(configPath)
  try {
    const module = await import(resolvedPath)
    return module.default || module
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error}`)
  }
}

function resolveConfigPath(inputPath: string): string {
  const extensions = ['', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']
  
  for (const ext of extensions) {
    const candidate = `${inputPath}${ext}`
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  
  throw new Error(`Configuration file not found: ${inputPath}`)
}

function generatePrunedConfig(config: any, serviceName: string, options: PruneOptions): any {
  const service = config.services[serviceName]
  if (!service) {
    throw new Error(`Service '${serviceName}' not found`)
  }
  
  // Get dependencies
  const dependencies = service.needs || []
  
  // If includeTransitive is true, get all transitive dependencies
  let allDependencies = dependencies
  if (options.includeTransitive) {
    allDependencies = getTransitiveDependencies(config.services, serviceName)
  }
  
  // Build dependency info
  const dependencyInfo = allDependencies.map((dep: any) => {
    const depService = config.services[dep.service]
    if (!depService) {
      throw new Error(`Dependency service '${dep.service}' not found`)
    }
    
    const protocol = dep.protocol || depService.listen?.protocol || 'http'
    const port = dep.port
    const path = depService.listen?.path || ''
    
    return {
      service: dep.service,
      url: `${protocol}://${config.project}-${dep.service}.${options.namespace}.svc.cluster.local:${port}${path}`,
      port,
      protocol,
      description: dep.description
    }
  })
  
  // Build service info
  const serviceInfo = {
    name: serviceName,
    kind: service.kind,
    image: service.image || `${config.project}-${serviceName}:latest`,
    internalUrl: `${service.listen?.protocol || 'http'}://${config.project}-${serviceName}.${options.namespace}.svc.cluster.local:${service.listen?.port || 8080}${service.listen?.path || ''}`,
    externalUrl: service.public ? `${service.public.protocol}://${service.public.host}${service.public.path || ''}` : undefined,
    port: service.listen?.port || 8080,
    resources: service.resources || { cpu: '100m', memory: '128Mi' }
  }
  
  // Build environment references
  const environment: Record<string, any> = {
    NODE_ENV: { type: 'static', value: 'production' },
    PORT: { type: 'static', value: String(serviceInfo.port) }
  }
  
  // Add service URLs
  dependencyInfo.forEach(dep => {
    environment[`${dep.service.toUpperCase()}_URL`] = {
      type: 'static',
      value: dep.url
    }
  })
  
  return {
    project: config.project,
    namespace: options.namespace,
    service: serviceInfo,
    dependencies: dependencyInfo,
    environment
  }
}

function getTransitiveDependencies(services: Record<string, any>, serviceName: string): any[] {
  const visited = new Set<string>()
  const result: any[] = []
  
  function collectDeps(name: string) {
    if (visited.has(name)) return
    visited.add(name)
    
    const service = services[name]
    if (!service?.needs) return
    
    for (const dep of service.needs) {
      result.push(dep)
      collectDeps(dep.service)
    }
  }
  
  collectDeps(serviceName)
  return result
}

async function writePrunedConfig(prunedConfig: any, options: PruneOptions): Promise<void> {
  const content = generateFileContent(prunedConfig, options)
  
  // Ensure output directory exists
  const outputDir = path.dirname(options.output)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  
  // Write file
  fs.writeFileSync(options.output, content, 'utf8')
}

function generateFileContent(prunedConfig: any, options: PruneOptions): string {
  const { service, dependencies, environment, project, namespace } = prunedConfig
  
  switch (options.format) {
    case 'json':
      return JSON.stringify(prunedConfig, null, 2)
      
    case 'javascript':
      return generateJavaScriptContent(prunedConfig)
      
    case 'typescript':
    default:
      return generateTypeScriptContent(prunedConfig)
  }
}

function generateTypeScriptContent(prunedConfig: any): string {
  const { service, dependencies } = prunedConfig
  
  return `/**
 * Auto-generated runtime configuration for service: ${service.name}
 * Generated by: tsops prune ${service.name}
 * Dependencies: ${dependencies.map((d: any) => d.service).join(', ')}
 * 
 * This file contains only the configuration needed for the '${service.name}' service
 * and its direct dependencies. It's optimized for runtime performance.
 */

import { useConfig } from 'tsops'

export default useConfig(${JSON.stringify(prunedConfig, null, 2)})

// Example usage:
// const apiUrl = config.dependencyUrl('api')
// const authUrl = config.dependencyUrl('auth')
// const port = config.env('PORT')
// const jwtSecretRef = config.secretRef('JWT_SECRET')
`
}

function generateJavaScriptContent(prunedConfig: any): string {
  return `/**
 * Auto-generated runtime configuration for service: ${prunedConfig.service.name}
 * Generated by: tsops prune ${prunedConfig.service.name}
 */

import { useConfig } from 'tsops'

export default useConfig(${JSON.stringify(prunedConfig, null, 2)})

// Example usage:
// const apiUrl = config.dependencyUrl('api')
// const port = config.env('PORT')
`
}