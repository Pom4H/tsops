import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('tsops CLI version', () => {
  it('reports the package version instead of a stale hardcoded value', async () => {
    const root = path.resolve(import.meta.dirname, '..')
    const pkg = JSON.parse(
      await readFile(path.join(root, 'packages/cli/package.json'), 'utf8')
    ) as { version: string }

    const { stdout } = await execFileAsync('node', [
      path.join(root, 'packages/cli/bin/tsops.js'),
      '--version'
    ])

    expect(stdout.trim()).toBe(pkg.version)
  })
})
