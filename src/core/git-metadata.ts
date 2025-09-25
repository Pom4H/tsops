import { randomUUID } from 'node:crypto'
import type { CommandExecutor } from './command-executor.js'
import type { GitInfo } from '../types.js'

interface LoggerLike {
  warn(message: string): void
  debug?(message: string): void
}

interface GitMetadataProviderOptions {
  executor: CommandExecutor
  logger?: LoggerLike
}

export class GitMetadataProvider {
  private readonly executor: CommandExecutor
  private readonly logger?: LoggerLike

  constructor(options: GitMetadataProviderOptions) {
    this.executor = options.executor
    this.logger = options.logger
  }

  async getGitInfo(): Promise<GitInfo> {
    try {
      const branch = (await this.executor.capture('git rev-parse --abbrev-ref HEAD')).stdout.trim()
      const sha = (await this.executor.capture('git rev-parse HEAD')).stdout.trim()
      const shortSha = (await this.executor.capture('git rev-parse --short HEAD')).stdout.trim()

      let tag: string | undefined
      try {
        const result = await this.executor.capture('git describe --tags --abbrev=0')
        tag = result.stdout.trim() || undefined
      } catch (error) {
        this.logger?.debug?.(`git describe failed while detecting git info: ${String(error)}`)
      }

      const status = (await this.executor.capture('git status --porcelain')).stdout.trim()

      return {
        branch,
        sha,
        shortSha,
        tag,
        hasUncommittedChanges: status.length > 0
      }
    } catch (error) {
      return this.createFallbackGitInfo(error)
    }
  }

  private createFallbackGitInfo(error: unknown): GitInfo {
    const fallbackId = randomUUID().replace(/-/g, '')
    const fallbackSha = (fallbackId + fallbackId).slice(0, 40)
    const fallbackShort = fallbackSha.slice(0, 7)

    const reason = this.detectFailureReason(error)

    if (reason === 'outside-repository') {
      this.logger?.debug?.('Skipping git metadata detection; not inside a git repository.')
    } else if (reason === 'git-missing') {
      this.logger?.warn(
        `Git CLI not found; using fallback metadata (${fallbackShort}). ${this.formatErrorMessage(error)}`
      )
    } else {
      this.logger?.warn(
        `Failed to detect git information; using fallback metadata (${fallbackShort}). ${this.formatErrorMessage(
          error
        )}`
      )
    }

    return {
      branch: 'unknown',
      sha: fallbackSha,
      shortSha: fallbackShort,
      tag: undefined,
      hasUncommittedChanges: false
    }
  }

  private detectFailureReason(error: unknown): 'outside-repository' | 'git-missing' | 'unknown' {
    if (this.errorContains(error, 'not a git repository')) {
      return 'outside-repository'
    }

    if (
      this.errorContains(error, 'command not found') ||
      this.errorContains(error, 'is not recognized as an internal or external command')
    ) {
      return 'git-missing'
    }

    return 'unknown'
  }

  private errorContains(error: unknown, text: string): boolean {
    if (!text) {
      return false
    }

    const candidate = text.toLowerCase()

    if (typeof error === 'string') {
      return error.toLowerCase().includes(candidate)
    }

    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: string }).message
      const stderr = (error as { stderr?: string }).stderr
      const stdout = (error as { stdout?: string }).stdout

      return [message, stderr, stdout]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(candidate))
    }

    return false
  }

  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === 'string') {
      return error
    }

    return String(error)
  }
}
