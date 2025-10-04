/**
 * Runtime configuration loader using @tsops/runtime
 * 
 * This demonstrates how to use the same tsops.config.ts
 * that's used for deployment to load configuration at runtime.
 * 
 * Benefits:
 * - Single source of truth
 * - Type-safe configuration
 * - Works in both K8s and local development
 * - Automatic secret loading
 */

import { getEnv } from '@tsops/runtime'
import config from '../../tsops.production.config.v3.js'

/**
 * Application configuration interface
 * This is derived from the secrets defined in tsops config
 */
export interface AppConfig {
  // Application
  NODE_ENV: string
  PORT: string
  NAMESPACE: string
  CLUSTER: string
  
  // Security
  JWT_SECRET: string
  API_KEY: string
  
  // Database
  DB_PASSWORD: string
  DB_HOST: string
  DB_PORT: string
  DB_NAME: string
  
  // Redis
  REDIS_URL: string
  
  // OpenTelemetry
  OTEL_SERVICE_NAME: string
  OTEL_EXPORTER_OTLP_ENDPOINT: string
  OTEL_EXPORTER_OTLP_PROTOCOL: string
}

/**
 * Load configuration from tsops config
 * 
 * @example
 * ```ts
 * const config = await loadConfig()
 * console.log(config.JWT_SECRET)
 * console.log(config.DB_HOST)
 * ```
 */
export async function loadConfig(): Promise<AppConfig> {
  const namespace = process.env.NAMESPACE || process.env.K8S_NAMESPACE || 'worken-dev'
  
  // ✨ Load env from tsops config
  // In production: reads from K8s secret mounted at /var/run/secrets/api-secrets/
  // In development: uses static values from config
  const env = await getEnv(config, 'api', namespace, {
    source: process.env.NODE_ENV === 'production' ? 'kubernetes' : 'process'
  })
  
  return env as AppConfig
}

/**
 * Get database connection string
 */
export async function getDatabaseUrl(): Promise<string> {
  const config = await loadConfig()
  
  return `postgresql://api:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`
}

/**
 * Get Redis connection
 */
export async function getRedisUrl(): Promise<string> {
  const config = await loadConfig()
  
  return config.REDIS_URL
}

/**
 * Check if running in production
 */
export async function isProduction(): Promise<boolean> {
  const config = await loadConfig()
  
  return config.NODE_ENV === 'production'
}

// ═══════════════════════════════════════════════════════════════
// Usage Examples
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Express server setup
 */
export async function setupServer() {
  const config = await loadConfig()
  
  const express = (await import('express')).default
  const app = express()
  
  // Use config values
  app.listen(parseInt(config.PORT), () => {
    console.log(`Server running on port ${config.PORT}`)
    console.log(`Environment: ${config.NODE_ENV}`)
    console.log(`Namespace: ${config.NAMESPACE}`)
    console.log(`Database: ${config.DB_HOST}:${config.DB_PORT}`)
  })
  
  return app
}

/**
 * Example: Database connection
 */
export async function connectDatabase() {
  const dbUrl = await getDatabaseUrl()
  
  // Example with pg
  const { Pool } = await import('pg')
  const pool = new Pool({
    connectionString: dbUrl
  })
  
  return pool
}

/**
 * Example: Redis connection
 */
export async function connectRedis() {
  const redisUrl = await getRedisUrl()
  
  // Example with ioredis
  const Redis = (await import('ioredis')).default
  const redis = new Redis(redisUrl)
  
  return redis
}

/**
 * Example: JWT verification
 */
export async function verifyToken(token: string) {
  const config = await loadConfig()
  
  const jwt = await import('jsonwebtoken')
  
  return jwt.verify(token, config.JWT_SECRET)
}

// ═══════════════════════════════════════════════════════════════
// Development vs Production
// ═══════════════════════════════════════════════════════════════

/**
 * In development:
 * - Reads static values from tsops config
 * - No K8s secrets needed
 * - Fast startup
 * 
 * In production:
 * - Reads from K8s secret mounted at /var/run/secrets/api-secrets/
 * - All env vars loaded from secret
 * - Secure and validated
 */

// ═══════════════════════════════════════════════════════════════
// Testing
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Testing with custom config
 */
export async function loadTestConfig(): Promise<AppConfig> {
  // For tests, use development config
  const env = await getEnv(config, 'api', 'worken-dev', {
    source: 'process',
    envPrefix: 'TEST_'
  })
  
  return env as AppConfig
}

// ═══════════════════════════════════════════════════════════════
// Export singleton
// ═══════════════════════════════════════════════════════════════

let cachedConfig: AppConfig | null = null

/**
 * Get cached configuration (loads once, then reuses)
 */
export async function getConfig(): Promise<AppConfig> {
  if (!cachedConfig) {
    cachedConfig = await loadConfig()
  }
  
  return cachedConfig
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null
}


