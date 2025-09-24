import { randomUUID } from 'crypto'
import { CommandExecutor } from './command-executor.js'
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
      const fallbackId = randomUUID().replace(/-/g, '')
      const fallbackSha = (fallbackId + fallbackId).slice(0, 40)
      const fallbackShort = fallbackSha.slice(0, 7)

      this.logger?.warn(
        `Failed to detect git information; using fallback metadata (${fallbackShort}). ${
          error instanceof Error ? error.message : String(error)
        }`
      )

      return {
        branch: 'unknown',
        sha: fallbackSha,
        shortSha: fallbackShort,
        tag: undefined,
        hasUncommittedChanges: false
      }
    }
  }
}
