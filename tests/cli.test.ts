import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.TSOPS_CLI_TEST_MODE = '1'

let createProgram: typeof import('../src/bin.js').createProgram
let resetTsOpsCache: typeof import('../src/bin.js').resetTsOpsCache

beforeAll(async () => {
  const cliModule = await import('../src/bin.js')
  createProgram = cliModule.createProgram
  resetTsOpsCache = cliModule.resetTsOpsCache
})

afterEach(() => {
  resetTsOpsCache()
})

const createFixture = async () => {
  const tmpBase = path.join(tmpdir(), 'tsops-cli-test-')
  const dir = await mkdtemp(tmpBase)
  const logPath = path.join(dir, 'calls.log')
  await writeFile(logPath, '', 'utf8')

  const configPath = path.join(dir, 'tsops.config.mjs')
  const configSource = `import { appendFileSync } from 'node:fs'

const logPath = ${JSON.stringify(logPath)}

const record = (entry) => {
  appendFileSync(logPath, entry + "\\n", "utf8")
}

const makeService = (name) => ({
  containerImage: \`example/${'${'}name}\`,
  defaultEnvironment: 'local',
  manifests: () => {
    record('manifest:' + name)
    return []
  }
})

export default {
  project: {
    name: 'cli-test',
    repoUrl: 'https://example.invalid/cli.git',
    defaultBranch: 'main'
  },
  environments: {
    local: {
      cluster: { apiServer: 'https://kubernetes.invalid', context: 'test' },
      namespace: 'cli-test',
      imageTagStrategy: { type: 'gitSha', length: 7 }
    }
  },
  services: {
    api: makeService('api'),
    web: makeService('web')
  },
  pipeline: {
    build: {
      run: async ({ service }) => {
        record('build:' + service.name)
      }
    },
    test: {
      run: async () => {
        record('test')
      }
    },
    deploy: {
      run: async ({ service }) => {
        record('deploy:' + service.name)
      }
    }
  },
  secrets: { provider: { type: 'vault', connection: {} }, map: {} },
  notifications: { channels: {}, onEvents: {} }
}
`
  await writeFile(configPath, configSource, 'utf8')

  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true })
  }

  return { dir, configPath, logPath, cleanup }
}

const runCli = async (args: string[], cwd: string) => {
  const program = createProgram()
  const originalCwd = process.cwd()
  const originalExitCode = process.exitCode
  process.chdir(cwd)
  try {
    await program.parseAsync(['node', 'tsops', ...args])
  } finally {
    process.chdir(originalCwd)
    process.exitCode = originalExitCode ?? undefined
  }
}

const readLogEntries = async (logPath: string) => {
  const content = await readFile(logPath, 'utf8')
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

describe('tsops CLI workflows', () => {
  it('build command defaults to all services when service is omitted', async () => {
    const fixture = await createFixture()
    try {
      await runCli(['build', '--config', fixture.configPath], fixture.dir)
      const entries = await readLogEntries(fixture.logPath)
      expect(entries.filter((line) => line.startsWith('build:'))).toEqual([
        'build:api',
        'build:web'
      ])
    } finally {
      await fixture.cleanup()
    }
  })

  it('deploy command defaults to all services when service is omitted', async () => {
    const fixture = await createFixture()
    try {
      await runCli(['deploy', '--config', fixture.configPath], fixture.dir)
      const entries = await readLogEntries(fixture.logPath)
      expect(entries.filter((line) => line.startsWith('deploy:'))).toEqual([
        'deploy:api',
        'deploy:web'
      ])
    } finally {
      await fixture.cleanup()
    }
  })

  it('run command defaults to all services when service is omitted', async () => {
    const fixture = await createFixture()
    try {
      await runCli(['run', '--config', fixture.configPath], fixture.dir)
      const entries = await readLogEntries(fixture.logPath)
      expect(entries).toEqual([
        'build:api',
        'build:web',
        'test',
        'manifest:api',
        'deploy:api',
        'manifest:web',
        'deploy:web'
      ])
    } finally {
      await fixture.cleanup()
    }
  })

  it('run command respects skip flags for build and tests', async () => {
    const fixture = await createFixture()
    try {
      await runCli(
        ['run', '--config', fixture.configPath, '--skip-build', '--skip-tests'],
        fixture.dir
      )
      const entries = await readLogEntries(fixture.logPath)
      expect(entries).toEqual(['manifest:api', 'deploy:api', 'manifest:web', 'deploy:web'])
    } finally {
      await fixture.cleanup()
    }
  })

  it('render command writes manifests for all services when service is omitted', async () => {
    const fixture = await createFixture()
    try {
      const outputPath = path.join(fixture.dir, 'render.yaml')
      await runCli(['render', '--config', fixture.configPath, '--output', outputPath], fixture.dir)
      const entries = await readLogEntries(fixture.logPath)
      expect(entries.filter((line) => line.startsWith('manifest:'))).toEqual([
        'manifest:api',
        'manifest:web'
      ])
      const output = await readFile(outputPath, 'utf8')
      expect(output).toContain('# Service: api')
      expect(output).toContain('# Service: web')
    } finally {
      await fixture.cleanup()
    }
  })

  it('delete command defaults to all services when service is omitted', async () => {
    const fixture = await createFixture()
    try {
      await runCli(['delete', '--config', fixture.configPath], fixture.dir)
      const entries = await readLogEntries(fixture.logPath)
      expect(entries.filter((line) => line.startsWith('manifest:')).sort()).toEqual([
        'manifest:api',
        'manifest:web'
      ])
      expect(entries.some((line) => line.startsWith('deploy:'))).toBe(false)
    } finally {
      await fixture.cleanup()
    }
  })
})
