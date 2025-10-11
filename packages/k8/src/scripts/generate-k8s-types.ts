import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { Command, Option } from 'commander'
import openapiTS, { astToString, type OpenAPI3 } from 'openapi-typescript'

const execFileAsync = promisify(execFile)

interface GeneratorOptions {
  outputPath: string
  specUrl?: string
  specFile?: string
  useKubectl: boolean
  kubectlPath: string
  kubectlArgs: string[]
}

interface RawCLIOptions {
  output?: string
  url?: string
  file?: string
  kubectl?: string | boolean
  kubectlArg?: string[]
}

function parseArgs(argv: string[]): GeneratorOptions {
  const envSpecUrl = process.env.K8S_OPENAPI_URL
  const envSpecFile = process.env.K8S_OPENAPI_FILE
  const envKubectlPath = process.env.KUBECTL ?? process.env.KUBECTL_BIN ?? 'kubectl'
  const envKubectlArgs = parseArgList(process.env.KUBECTL_ARGS)

  const program = new Command()
    .name('generate-k8s-types')
    .description('Generate TypeScript definitions from the Kubernetes OpenAPI schema.')
    .allowExcessArguments(false)
    .showHelpAfterError()

  program
    .option(
      '-o, --output <path>',
      'Output file path (default: src/kubernetes/generated/k8s-openapi.d.ts)'
    )
    .option('-u, --url <url>', 'URL to load OpenAPI spec')
    .option('-f, --file <path>', 'Local file path for OpenAPI spec JSON')
    .addOption(
      new Option(
        '-k, --kubectl [path]',
        'Use kubectl discovery (optionally provide kubectl binary path)'
      )
    )
    .addOption(
      new Option(
        '--kubectl-arg <value>',
        'Pass through an additional argument to kubectl (repeatable)'
      ).argParser((value: string, previous: string[] | undefined) =>
        previous ? [...previous, value] : [value]
      )
    )
    .addHelpText(
      'after',
      `\nEnvironment overrides:\n` +
        `  K8S_OPENAPI_URL       Same as --url\n` +
        `  K8S_OPENAPI_FILE      Same as --file\n` +
        `  KUBECTL, KUBECTL_BIN  Path to kubectl binary\n` +
        `  KUBECTL_ARGS          Extra kubectl args (quoted string, whitespace separated)\n`
    )

  const parsed = program.parse(argv, { from: 'user' })
  const cliOptions = parsed.opts<RawCLIOptions>()

  const preference = determinePreference(argv)

  const outputPath = path.resolve(
    process.cwd(),
    cliOptions.output ?? 'src/kubernetes/generated/k8s-openapi.d.ts'
  )

  const cliSpecFile = cliOptions.file ? path.resolve(process.cwd(), cliOptions.file) : undefined
  const envSpecFileResolved = envSpecFile ? path.resolve(process.cwd(), envSpecFile) : undefined

  let specUrl = cliOptions.url ?? envSpecUrl
  let specFile = cliSpecFile ?? envSpecFileResolved

  const kubectlArgs = [...envKubectlArgs]
  if (cliOptions.kubectlArg) {
    kubectlArgs.push(...cliOptions.kubectlArg)
  }

  let kubectlPath = envKubectlPath
  if (typeof cliOptions.kubectl === 'string' && cliOptions.kubectl.length > 0) {
    kubectlPath = cliOptions.kubectl
  }

  let useKubectl: boolean

  switch (preference) {
    case 'kubectl':
      useKubectl = true
      specUrl = undefined
      specFile = undefined
      break
    case 'url':
      useKubectl = false
      specUrl = cliOptions.url ?? specUrl
      specFile = undefined
      break
    case 'file':
      useKubectl = false
      specFile = cliSpecFile ?? specFile
      specUrl = undefined
      break
    default:
      useKubectl = !specUrl && !specFile
      break
  }

  if (specUrl && specFile) {
    throw new Error('Provide either --url or --file (or matching env vars), not both')
  }

  if (useKubectl) {
    specUrl = undefined
    specFile = undefined
  }

  return {
    outputPath,
    specUrl,
    specFile,
    useKubectl,
    kubectlPath,
    kubectlArgs
  }
}

type OpenAPI = OpenAPI3

type DiscoveryEntry = { serverRelativeURL?: string | undefined; [key: string]: unknown } | string

interface DiscoveryResponse {
  paths?: Record<string, DiscoveryEntry>
}

async function loadFromUrl(url: string): Promise<OpenAPI> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download OpenAPI spec from ${url}: ${response.status} ${response.statusText}`
    )
  }
  return (await response.json()) as OpenAPI
}

async function loadFromFile(filePath: string): Promise<OpenAPI> {
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content) as OpenAPI
}

async function loadFromKubectl(
  options: Pick<GeneratorOptions, 'kubectlArgs' | 'kubectlPath'>
): Promise<OpenAPI> {
  const discoveryRaw = await kubectlRaw('/openapi/v3', options)
  let discovery: DiscoveryResponse

  try {
    discovery = JSON.parse(discoveryRaw) as DiscoveryResponse
  } catch (error) {
    throw new Error(`Failed to parse kubectl discovery response: ${(error as Error).message}`)
  }

  const paths = discovery.paths
  if (!isPlainObject(paths)) {
    throw new Error('kubectl discovery response did not contain a parsable paths object')
  }

  const serverRelativeUrls = new Set<string>()
  for (const entry of Object.values(paths)) {
    if (typeof entry === 'string') {
      if (entry) serverRelativeUrls.add(normalizeServerRelativeUrl(entry))
      continue
    }

    const url = entry?.serverRelativeURL
    if (typeof url === 'string' && url.length > 0) {
      serverRelativeUrls.add(normalizeServerRelativeUrl(url))
    }
  }

  if (serverRelativeUrls.size === 0) {
    throw new Error('kubectl discovery did not return any serverRelativeURL entries to fetch')
  }

  const orderedUrls = Array.from(serverRelativeUrls).sort()
  const specs: OpenAPI[] = []

  for (const url of orderedUrls) {
    const attempted = [url]
    if (url.includes('?')) {
      const withoutQuery = url.split('?')[0]!
      if (withoutQuery.length > 0) attempted.push(withoutQuery)
    }

    let fragmentRaw: string | undefined
    let lastError: unknown

    for (const candidate of attempted) {
      try {
        fragmentRaw = await kubectlRaw(candidate, options)
        break
      } catch (error) {
        lastError = error
      }
    }

    if (!fragmentRaw) {
      const message = lastError instanceof Error ? lastError.message : String(lastError)
      console.warn(`Skipping OpenAPI fragment ${url}: ${message}`)
      continue
    }

    try {
      specs.push(JSON.parse(fragmentRaw) as OpenAPI)
    } catch (error) {
      throw new Error(`Failed to parse OpenAPI fragment from ${url}: ${(error as Error).message}`)
    }
  }

  return mergeOpenAPISpecs(specs)
}

async function kubectlRaw(
  pathname: string,
  options: Pick<GeneratorOptions, 'kubectlArgs' | 'kubectlPath'>
): Promise<string> {
  const args = [...options.kubectlArgs, 'get', '--raw', pathname]

  try {
    const { stdout } = await execFileAsync(options.kubectlPath, args, {
      maxBuffer: 1024 * 1024 * 50
    })
    return stdout
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string }
    if (err.code === 'ENOENT') {
      throw new Error(`kubectl executable not found (looked for ${options.kubectlPath})`)
    }
    const stderr = typeof err.stderr === 'string' && err.stderr.length > 0 ? `\n${err.stderr}` : ''
    throw new Error(`kubectl get --raw ${pathname} failed: ${err.message}${stderr}`)
  }
}

function mergeOpenAPISpecs(specs: OpenAPI[]): OpenAPI {
  if (specs.length === 0) {
    throw new Error('No OpenAPI fragments were produced by kubectl discovery')
  }

  const primary = specs[0]
  const openapiVersion = typeof primary.openapi === 'string' ? primary.openapi : '3.0.0'
  const fallbackInfo: OpenAPI['info'] = {
    title: 'Kubernetes API',
    version: 'unknown'
  }
  const info = primary.info ?? fallbackInfo

  const pathsAggregate: Record<string, unknown> = {}
  const componentAggregate: Record<string, unknown> = {}
  const serverEntries: unknown[] = []
  const securityEntries: unknown[] = []
  const tagEntries: unknown[] = []
  let externalDocs: OpenAPI['externalDocs']

  for (const spec of specs) {
    mergePathItems(pathsAggregate, spec.paths)
    mergeComponents(componentAggregate, spec.components)

    if (Array.isArray(spec.servers)) {
      serverEntries.push(...spec.servers)
    }
    if (Array.isArray(spec.security)) {
      securityEntries.push(...spec.security)
    }
    if (Array.isArray(spec.tags)) {
      tagEntries.push(...spec.tags)
    }
    if (!externalDocs && spec.externalDocs) {
      externalDocs = spec.externalDocs
    }
  }

  if (Object.keys(pathsAggregate).length === 0) {
    throw new Error('Merged OpenAPI spec did not contain any paths')
  }

  const aggregate: OpenAPI = {
    openapi: openapiVersion,
    info,
    paths: pathsAggregate as OpenAPI['paths']
  }

  if (Object.keys(componentAggregate).length > 0) {
    aggregate.components = componentAggregate as OpenAPI['components']
  }

  const servers = dedupeArray(serverEntries)
  if (servers.length > 0) {
    aggregate.servers = servers as OpenAPI['servers']
  }

  const security = dedupeArray(securityEntries)
  if (security.length > 0) {
    aggregate.security = security as OpenAPI['security']
  }

  const tags = dedupeArray(tagEntries)
  if (tags.length > 0) {
    aggregate.tags = tags as OpenAPI['tags']
  }

  if (externalDocs) {
    aggregate.externalDocs = externalDocs
  }

  return aggregate
}

function mergePathItems(
  target: Record<string, unknown>,
  source: OpenAPI['paths'] | undefined
): void {
  if (!isPlainObject(source)) return

  for (const [pathKey, pathValue] of Object.entries(source)) {
    if (!isPlainObject(pathValue)) {
      target[pathKey] = pathValue
      continue
    }

    const existing = target[pathKey]
    if (!isPlainObject(existing)) {
      target[pathKey] = { ...pathValue }
      continue
    }

    for (const [method, operation] of Object.entries(pathValue)) {
      if (!(method in existing)) {
        existing[method] = operation
        continue
      }

      if (!deepEqual(existing[method], operation)) {
        console.warn(`Skipping conflicting definition for ${method.toUpperCase()} ${pathKey}`)
      }
    }
  }
}

function mergeComponents(
  target: Record<string, unknown>,
  source: OpenAPI['components'] | undefined
): void {
  if (!isPlainObject(source)) return

  for (const [componentType, componentValue] of Object.entries(source)) {
    if (!isPlainObject(componentValue)) {
      target[componentType] = componentValue
      continue
    }

    const bucket = target[componentType]
    if (!isPlainObject(bucket)) {
      target[componentType] = { ...componentValue }
      continue
    }

    for (const [componentName, definition] of Object.entries(componentValue)) {
      if (!(componentName in bucket)) {
        bucket[componentName] = definition
        continue
      }

      if (!deepEqual(bucket[componentName], definition)) {
        console.warn(`Skipping conflicting component ${componentType}.${componentName}`)
      }
    }
  }
}

function dedupeArray(values: unknown[]): unknown[] {
  const seen = new Set<string>()
  const result: unknown[] = []

  for (const value of values) {
    const key = safeStableStringify(value)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(value)
    }
  }

  return result
}

function safeStableStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeServerRelativeUrl(url: string): string {
  return url.startsWith('/') ? url : `/${url}`
}

type SourcePreference = 'kubectl' | 'url' | 'file' | undefined

function determinePreference(argv: string[]): SourcePreference {
  let preference: SourcePreference

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--kubectl' || arg === '-k') {
      preference = 'kubectl'
      const next = argv[index + 1]
      if (next && !next.startsWith('-')) {
        index += 1
      }
      continue
    }

    if (arg.startsWith('--kubectl=')) {
      preference = 'kubectl'
      continue
    }

    if (arg === '--url' || arg === '-u') {
      preference = 'url'
      index += 1
      continue
    }

    if (arg.startsWith('--url=')) {
      preference = 'url'
      continue
    }

    if (arg === '--file' || arg === '-f') {
      preference = 'file'
      index += 1
      continue
    }

    if (arg.startsWith('--file=')) {
      preference = 'file'
    }
  }

  return preference
}

function parseArgList(value: string | undefined): string[] {
  if (!value) return []
  const tokens = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
  if (!tokens) return []
  return tokens.map(stripMatchingQuotes)
}

function stripMatchingQuotes(token: string): string {
  if (token.length >= 2) {
    const first = token[0]
    const last = token[token.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1)
    }
  }
  return token
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(left: unknown, right: unknown): boolean {
  return safeStableStringify(left) === safeStableStringify(right)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const specSource = options.useKubectl
    ? `${[options.kubectlPath, ...options.kubectlArgs].join(' ')} get --raw /openapi/v3`
    : (options.specFile ?? options.specUrl!)
  console.log(`Loading OpenAPI spec from ${specSource}`)

  const specAst = options.useKubectl
    ? await loadFromKubectl(options)
    : options.specFile
      ? await loadFromFile(options.specFile)
      : await loadFromUrl(options.specUrl!)

  console.log('Generating TypeScript definitions...')
  const ast = await openapiTS(specAst, {
    alphabetize: true
  })
  const output = astToString(ast)

  const header = `// Generated by scripts/generate-k8s-types.ts on ${new Date().toISOString()}\n// Source: ${specSource}\n\n`
  const fileContents = header + output

  await mkdir(path.dirname(options.outputPath), { recursive: true })
  await writeFile(options.outputPath, fileContents, 'utf8')

  console.log(`Types written to ${options.outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
