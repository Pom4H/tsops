/**
 * Provides access to environment variables.
 * This abstraction makes the code testable and eliminates direct dependencies on process.env.
 */
export interface EnvironmentProvider {
  /**
   * Retrieves the value of an environment variable.
   * @param key - The environment variable name
   * @returns The value of the variable, or undefined if not set
   */
  get(key: string): string | undefined
}

/**
 * Default implementation that reads from process.env
 */
export class ProcessEnvironmentProvider implements EnvironmentProvider {
  get(key: string): string | undefined {
    return process.env[key]
  }
}
