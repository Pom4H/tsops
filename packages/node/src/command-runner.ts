import { spawn } from 'node:child_process'
import { once } from 'node:events'

export interface CommandRunnerOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
  inheritStdio?: boolean
  captureOutput?: boolean
  allowNonZeroExit?: boolean
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
}

export interface CommandResult {
  command: string
  args: readonly string[]
  exitCode: number
  stdout?: string
}

export interface CommandRunner {
  run(
    command: string,
    args: string[],
    options: CommandRunnerOptions & { captureOutput: true }
  ): Promise<string>
  run(command: string, args: string[], options?: CommandRunnerOptions): Promise<CommandResult>
}

export class DefaultCommandRunner implements CommandRunner {
  async run(
    command: string,
    args: string[],
    options: CommandRunnerOptions & { captureOutput: true }
  ): Promise<string>
  async run(command: string, args: string[], options?: CommandRunnerOptions): Promise<CommandResult>
  async run(
    command: string,
    args: string[],
    options: CommandRunnerOptions = {}
  ): Promise<string | CommandResult> {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: buildStdio(options)
    })

    const errorPromise = once(child, 'error').then(([error]) => {
      throw error
    })

    if (options.input) {
      child.stdin?.write(options.input)
      child.stdin?.end()
    }

    // Capture stdout if requested and/or pipe to callback
    let stdout = ''
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        const data = chunk.toString()
        if (options.captureOutput) {
          stdout += data
        }
        options.onStdout?.(data)
      })
    }

    // Capture stderr (always, for error reporting) and pipe to callback if provided
    let stderr = ''
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        const data = chunk.toString()
        stderr += data
        options.onStderr?.(data)
      })
    }

    const exitPromise = once(child, 'exit') as Promise<[number | null]>
    const [code] = await Promise.race([exitPromise, errorPromise])
    const exitCode = code ?? 0

    if (exitCode !== 0 && !options.allowNonZeroExit) {
      // Include stderr in error message for better debugging
      const stderrMsg = stderr.trim() ? `\n${stderr.trim()}` : ''
      const error: Error & { exitCode?: number; stderr?: string } = new Error(
        `Command failed: ${command} ${args.join(' ')} (exit code: ${exitCode})${stderrMsg}`
      )
      error.exitCode = exitCode
      error.stderr = stderr.trim()
      throw error
    }

    // Return just stdout string if captureOutput is true
    if (options.captureOutput) {
      return stdout.trim()
    }

    return { command, args, exitCode }
  }
}

function buildStdio(
  options: CommandRunnerOptions
): ['pipe', 'pipe' | 'inherit', 'pipe' | 'inherit'] {
  if (options.inheritStdio === false) {
    return ['pipe', 'pipe', 'pipe']
  }
  return ['pipe', 'inherit', 'inherit']
}
