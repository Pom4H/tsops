export interface EnvironmentProvider {
  /**
   * Retrieves the value of an environment variable.
   * @param key - The environment variable name
   * @returns The value of the variable, or undefined if not set
   */
  get(key: string): string | undefined
}

/**
 * Environment provider that always returns undefined.
 * Useful in environments where process-like globals are not available.
 */
export class NullEnvironmentProvider implements EnvironmentProvider {
  get(): string | undefined {
    return undefined
  }
}

/**
 * Environment provider that inspects the global scope for a process-like object.
 * Works in Node (via global.process) and degrades gracefully elsewhere.
 */
export class GlobalEnvironmentProvider implements EnvironmentProvider {
  get(key: string): string | undefined {
    return getEnvironmentVariable(key)
  }
}

/**
 * @deprecated Use GlobalEnvironmentProvider instead.
 * Retained for backwards compatibility with existing imports.
 */
export class ProcessEnvironmentProvider extends GlobalEnvironmentProvider {}

/**
 * Returns the value of an environment variable from the global scope if available.
 */
export function getEnvironmentVariable(key: string): string | undefined {
  const env = getGlobalEnv()
  return env ? env[key] : undefined
}

function getGlobalEnv(): Record<string, string | undefined> | undefined {
  if (typeof globalThis !== 'object' || globalThis === null) {
    return undefined
  }

  const candidate = (globalThis as { process?: unknown }).process
  if (!candidate || typeof candidate !== 'object') {
    return undefined
  }

  const env = (candidate as { env?: Record<string, string | undefined> }).env
  return typeof env === 'object' && env !== null ? env : undefined
}
