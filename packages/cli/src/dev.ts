import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { isOverlayNamespace } from '@tsops/core'

export interface DevCommand {
  command: string
  args: string[]
  cwd: string
}

export interface DevPlanEntry extends DevCommand {
  app: string
  route: string
}

export interface DevPlan {
  namespace: string
  entries: DevPlanEntry[]
}

export interface DevOptions {
  namespace?: string
  app?: string
  cwd?: string
}

type RecordLike = Record<string, unknown>

type DevConfig = {
  project: string
  namespaces: Record<string, unknown>
  apps: Record<string, RecordLike>
}

export function selectLocalNamespace(config: DevConfig, requested?: string): string {
  if (requested) {
    const definition = config.namespaces[requested]
    if (!definition) throw new Error(`Unknown namespace: ${requested}`)
    if (!isLocalNamespace(definition)) {
      throw new Error(`Namespace "${requested}" is not configured with runtime: 'local'.`)
    }
    return requested
  }

  const local = Object.entries(config.namespaces)
    .filter(([, definition]) => isLocalNamespace(definition))
    .map(([name]) => name)

  if (local.length === 0) {
    throw new Error(
      "No local namespace found. Add runtime: 'local' to a static namespace or pass --namespace."
    )
  }
  if (local.length > 1) {
    throw new Error(`Multiple local namespaces found (${local.join(', ')}). Pass --namespace.`)
  }
  return local[0]
}

export function buildRouteName(project: string, app: string): string {
  const projectLabel = sanitizeRoutePart(project)
  const appLabel = sanitizeRoutePart(app)
  if (!projectLabel || !appLabel) {
    throw new Error(`Cannot build a Portless route for project "${project}" and app "${app}".`)
  }
  return `${appLabel}.${projectLabel}`
}

export function createDevPlan(config: DevConfig, options: DevOptions = {}): DevPlan {
  const root = path.resolve(options.cwd ?? process.cwd())
  const namespace = selectLocalNamespace(config, options.namespace)
  const selected: Array<[string, RecordLike | undefined]> = options.app
    ? [[options.app, config.apps[options.app]]]
    : Object.entries(config.apps)

  if (options.app && !config.apps[options.app]) {
    throw new Error(`Unknown app: ${options.app}`)
  }

  const entries: DevPlanEntry[] = []
  const routes = new Map<string, string>()

  for (const [appName, app] of selected) {
    if (!app || !shouldRunInNamespace(app.deploy, namespace)) continue

    const command = resolveDevCommand(app, root)
    if (!command) {
      if (options.app) {
        throw new Error(
          `App "${appName}" has no local dev command. Add apps.${appName}.dev or a package.json dev script under its build context.`
        )
      }
      continue
    }

    const route = buildRouteName(config.project, appName)
    const existing = routes.get(route)
    if (existing) {
      throw new Error(`Apps "${existing}" and "${appName}" resolve to the same Portless route: ${route}`)
    }
    routes.set(route, appName)
    entries.push({ app: appName, route, ...command })
  }

  if (entries.length === 0) {
    throw new Error('No applications with local dev commands were found.')
  }

  return { namespace, entries }
}

export function resolveDevUrls(plan: DevPlan, cwd = process.cwd()): Record<string, string> {
  assertPortlessAvailable(cwd)
  const urls: Record<string, string> = {}

  for (const entry of plan.entries) {
    const result = spawnSync('portless', ['get', entry.route], {
      cwd,
      encoding: 'utf8',
      env: process.env
    })
    if (result.status !== 0) {
      const detail = (result.stderr ?? '').trim()
      throw new Error(
        `Could not resolve Portless URL for ${entry.app}.${detail ? ` ${detail}` : ''}`
      )
    }
    const url = (result.stdout ?? '').trim()
    try {
      new URL(url)
    } catch {
      throw new Error(`Portless returned an invalid URL for ${entry.app}: ${url}`)
    }
    urls[entry.app] = url
  }

  return urls
}

export async function runDev(config: DevConfig, options: DevOptions = {}): Promise<number> {
  const root = path.resolve(options.cwd ?? process.cwd())
  const plan = createDevPlan(config, { ...options, cwd: root })
  const urls = resolveDevUrls(plan, root)
  const sharedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TSOPS_NAMESPACE: plan.namespace,
    TSOPS_DEV_URLS: JSON.stringify(urls)
  }

  console.log(`\nLocal namespace: ${plan.namespace}`)
  for (const entry of plan.entries) {
    console.log(`  ${entry.app.padEnd(16)} ${urls[entry.app]}`)
  }
  console.log()

  const children = plan.entries.map((entry) =>
    spawn('portless', ['run', '--name', entry.route, '--', entry.command, ...entry.args], {
      cwd: entry.cwd,
      env: sharedEnv,
      stdio: 'inherit'
    })
  )

  return waitForChildren(children)
}

function resolveDevCommand(app: RecordLike, root: string): DevCommand | null {
  if (app.dev === false) return null

  const defaultCwd = resolveAppCwd(app, root)
  const dev = app.dev

  if (Array.isArray(dev)) {
    const parts = dev.filter((value): value is string => typeof value === 'string')
    if (parts.length !== dev.length || parts.length === 0) {
      throw new Error('App dev array must contain at least one string command element.')
    }
    return { command: parts[0], args: parts.slice(1), cwd: defaultCwd }
  }

  if (typeof dev === 'string') {
    return packageScriptCommand(defaultCwd, dev, root)
  }

  if (isRecord(dev)) {
    const cwd = typeof dev.cwd === 'string' ? path.resolve(root, dev.cwd) : defaultCwd

    if (typeof dev.command === 'string') {
      const args = Array.isArray(dev.args)
        ? dev.args.map((value) => {
            if (typeof value !== 'string') throw new Error('App dev args must be strings.')
            return value
          })
        : []
      return { command: dev.command, args, cwd }
    }

    if (typeof dev.script === 'string') {
      return packageScriptCommand(cwd, dev.script, root)
    }

    throw new Error('App dev object must define command or script.')
  }

  const packageJson = readPackageJson(defaultCwd)
  const scripts = isRecord(packageJson?.scripts) ? packageJson.scripts : undefined
  if (typeof scripts?.dev !== 'string') return null
  return packageScriptCommand(defaultCwd, 'dev', root)
}

function resolveAppCwd(app: RecordLike, root: string): string {
  const build = isRecord(app.build) ? app.build : undefined
  return typeof build?.context === 'string' ? path.resolve(root, build.context) : root
}

function packageScriptCommand(cwd: string, script: string, root: string): DevCommand {
  const manager = detectPackageManager(cwd, root)
  return { command: manager, args: ['run', script], cwd }
}

function detectPackageManager(cwd: string, root: string): 'bun' | 'pnpm' | 'yarn' | 'npm' {
  let current = path.resolve(cwd)
  const stop = path.resolve(root)

  while (true) {
    if (fs.existsSync(path.join(current, 'bun.lock')) || fs.existsSync(path.join(current, 'bun.lockb'))) {
      return 'bun'
    }
    if (fs.existsSync(path.join(current, 'pnpm-lock.yaml'))) return 'pnpm'
    if (fs.existsSync(path.join(current, 'yarn.lock'))) return 'yarn'
    if (fs.existsSync(path.join(current, 'package-lock.json'))) return 'npm'
    if (current === stop || current === path.dirname(current)) break
    current = path.dirname(current)
  }

  return 'npm'
}

function readPackageJson(cwd: string): RecordLike | undefined {
  const file = path.join(cwd, 'package.json')
  if (!fs.existsSync(file)) return undefined
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    return isRecord(parsed) ? parsed : undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read ${file}: ${message}`)
  }
}

function shouldRunInNamespace(deploy: unknown, namespace: string): boolean {
  if (deploy === undefined || deploy === 'all') return true
  if (Array.isArray(deploy)) return deploy.includes(namespace)
  if (!isRecord(deploy)) return true

  const include = Array.isArray(deploy.include) ? deploy.include : undefined
  const exclude = Array.isArray(deploy.exclude) ? deploy.exclude : undefined
  if (include && !include.includes(namespace)) return false
  if (exclude?.includes(namespace)) return false
  return true
}

function isLocalNamespace(definition: unknown): boolean {
  if (!isRecord(definition) || isOverlayNamespace(definition as never)) return false
  return definition.runtime === 'local' || definition.local === true
}

function sanitizeRoutePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

function assertPortlessAvailable(cwd: string): void {
  const result = spawnSync('portless', ['--version'], { cwd, stdio: 'ignore', env: process.env })
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
    throw new Error(
      'Portless is required for `tsops dev`. Install it with `npm install -g portless` or add it to the project devDependencies.'
    )
  }
  if (result.status !== 0) {
    throw new Error('Portless is installed but could not be executed successfully.')
  }
}

function waitForChildren(children: ChildProcess[]): Promise<number> {
  return new Promise((resolve, reject) => {
    let remaining = children.length
    let finished = false

    const cleanupListeners = () => {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
    }

    const finish = (code: number) => {
      if (finished) return
      finished = true
      cleanupListeners()
      resolve(code)
    }

    const stopAll = (signal: NodeJS.Signals) => {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill(signal)
      }
    }

    const onSigint = () => stopAll('SIGINT')
    const onSigterm = () => stopAll('SIGTERM')
    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)

    for (const child of children) {
      child.once('error', (error) => {
        cleanupListeners()
        stopAll('SIGTERM')
        reject(error)
      })
      child.once('exit', (code, signal) => {
        remaining -= 1
        if (!finished && code !== null && code !== 0) {
          stopAll('SIGTERM')
          finish(code)
          return
        }
        if (remaining === 0) finish(signal ? 0 : (code ?? 0))
      })
    }
  })
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
