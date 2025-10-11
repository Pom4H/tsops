import { execSync } from 'node:child_process'
import type { EnvironmentProvider } from '@tsops/core'

/**
 * Git adapter that resolves metadata from the current repository.
 */
export class Git {
  private gitShaCache: string | null = null
  private gitTagCache: string | null = null

  getGitSha(): string | null {
    if (this.gitShaCache === null) {
      try {
        const fullSha = execSync('git rev-parse HEAD', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
        this.gitShaCache = fullSha.slice(0, 12)
      } catch {
        this.gitShaCache = null
      }
    }
    return this.gitShaCache
  }

  getGitTag(): string | null {
    if (this.gitTagCache === null) {
      try {
        this.gitTagCache = execSync('git describe --tags --exact-match HEAD', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
      } catch {
        try {
          this.gitTagCache = execSync('git describe --tags --abbrev=0', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim()
        } catch {
          this.gitTagCache = null
        }
      }
    }
    return this.gitTagCache
  }

  getGitBranch(): string | null {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch {
      return null
    }
  }

  isGitRepository(): boolean {
    try {
      execSync('git rev-parse --git-dir', {
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get list of changed files compared to a base reference.
   * @param base - Git reference to compare against (e.g., 'HEAD^1', 'main', 'origin/main')
   * @returns Array of changed file paths relative to repository root
   */
  getChangedFiles(base = 'HEAD^1'): string[] {
    try {
      const output = execSync(`git diff --name-only ${base}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()

      if (!output) return []

      return output.split('\n').filter((line) => line.length > 0)
    } catch {
      return []
    }
  }

  /**
   * Get list of changed files in the working directory (uncommitted changes).
   * @returns Array of changed file paths relative to repository root
   */
  getUncommittedChanges(): string[] {
    try {
      const output = execSync('git diff --name-only HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()

      if (!output) return []

      return output.split('\n').filter((line) => line.length > 0)
    } catch {
      return []
    }
  }
}

/**
 * Environment provider that augments another provider with git metadata.
 */
export class GitEnvironmentProvider implements EnvironmentProvider {
  private readonly gitAdapter: Git
  private readonly fallbackProvider: EnvironmentProvider

  constructor(fallbackProvider: EnvironmentProvider) {
    this.gitAdapter = new Git()
    this.fallbackProvider = fallbackProvider
  }

  get(key: string): string | undefined {
    switch (key) {
      case 'GIT_SHA':
        return this.gitAdapter.getGitSha() ?? this.fallbackProvider.get(key)
      case 'GIT_TAG':
        return this.gitAdapter.getGitTag() ?? this.fallbackProvider.get(key)
      case 'GIT_BRANCH':
        return this.gitAdapter.getGitBranch() ?? this.fallbackProvider.get(key)
      default:
        return this.fallbackProvider.get(key)
    }
  }

  getGitAdapter(): Git {
    return this.gitAdapter
  }
}
