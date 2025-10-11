export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string | Error, meta?: Record<string, unknown>): void
  debug(message: string, meta?: Record<string, unknown>): void
}

import { getEnvironmentVariable } from './environment-provider.js'

export class ConsoleLogger implements Logger {
  info(message: string, meta: Record<string, unknown> = {}): void {
    console.log(format('info', message, meta))
  }

  warn(message: string, meta: Record<string, unknown> = {}): void {
    console.warn(format('warn', message, meta))
  }

  error(message: string | Error, meta: Record<string, unknown> = {}): void {
    const text = message instanceof Error ? (message.stack ?? message.message) : message
    console.error(format('error', text, meta))
  }

  debug(message: string, meta: Record<string, unknown> = {}): void {
    const debugFlag = getEnvironmentVariable('DEBUG')
    if (debugFlag?.includes('tsops')) {
      console.debug(format('debug', message, meta))
    }
  }
}

function format(level: string, message: string, meta: Record<string, unknown>): string {
  const metaKeys = Object.keys(meta)
  if (metaKeys.length === 0) return `[${level}] ${message}`
  const serialized = metaKeys
    .map((key) => {
      const value = meta[key]
      if (value === undefined) return undefined
      if (typeof value === 'object') return `${key}=${JSON.stringify(value)}`
      return `${key}=${String(value)}`
    })
    .filter(Boolean)
    .join(' ')
  return `[${level}] ${message}${serialized ? ` ${serialized}` : ''}`
}
