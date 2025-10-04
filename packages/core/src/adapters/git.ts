import { execSync } from 'child_process'
import { EnvironmentProvider } from '../environment-provider.js'

/**
 * GitAdapter provides automatic git metadata resolution.
 * It can automatically detect git SHA, tags, and other git information.
 */
export class Git {
  private gitShaCache: string | null = null
  private gitTagCache: string | null = null

  /**
   * Gets the current git SHA (first 12 characters)
   */
  getGitSha(): string | null {
    if (this.gitShaCache === null) {
      try {
        const fullSha = execSync('git rev-parse HEAD', { 
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
        this.gitShaCache = fullSha.slice(0, 12)
      } catch (error) {
        // Git command failed, likely not in a git repository
        this.gitShaCache = null
      }
    }
    return this.gitShaCache
  }

  /**
   * Gets the current git tag
   */
  getGitTag(): string | null {
    if (this.gitTagCache === null) {
      try {
        this.gitTagCache = execSync('git describe --tags --exact-match HEAD', { 
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
      } catch (error) {
        // No exact tag match
        try {
          // Try to get the latest tag
          this.gitTagCache = execSync('git describe --tags --abbrev=0', { 
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim()
        } catch (error2) {
          this.gitTagCache = null
        }
      }
    }
    return this.gitTagCache
  }

  /**
   * Gets git branch name
   */
  getGitBranch(): string | null {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch (error) {
      return null
    }
  }

  /**
   * Checks if we're in a git repository
   */
  isGitRepository(): boolean {
    try {
      execSync('git rev-parse --git-dir', { 
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return true
    } catch (error) {
      return false
    }
  }
}

/**
 * Enhanced EnvironmentProvider that automatically provides git metadata.
 * Falls back to environment variables if git is not available.
 */
export class GitEnvironmentProvider implements EnvironmentProvider {
  private gitAdapter: Git
  private fallbackProvider: EnvironmentProvider

  constructor(fallbackProvider: EnvironmentProvider) {
    this.gitAdapter = new Git()
    this.fallbackProvider = fallbackProvider
  }

  get(key: string): string | undefined {
    // Handle git-specific keys
    switch (key) {
      case 'GIT_SHA':
        // First try git adapter, then fallback to env var
        return this.gitAdapter.getGitSha() ?? this.fallbackProvider.get(key)
      
      case 'GIT_TAG':
        // First try git adapter, then fallback to env var
        return this.gitAdapter.getGitTag() ?? this.fallbackProvider.get(key)
      
      case 'GIT_BRANCH':
        // First try git adapter, then fallback to env var
        return this.gitAdapter.getGitBranch() ?? this.fallbackProvider.get(key)
      
      default:
        // For all other keys, use fallback provider
        return this.fallbackProvider.get(key)
    }
  }

  /**
   * Gets git adapter instance for direct access to git methods
   */
  getGitAdapter(): Git {
    return this.gitAdapter
  }
}
