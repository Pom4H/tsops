import type { ServicePort } from '../types.js'

/**
 * A fully resolved port after normalization.
 *
 * tsops distinguishes three distinct numbers:
 * - `servicePort`  — port the k8s Service listens on; what other services dial.
 * - `targetPort`   — port on the Pod the Service forwards to. Can be a named
 *                    port (string) so a StatefulSet can change its listen port
 *                    without touching the Service.
 * - `containerPort` — numeric port the container process must listen on. Equal
 *                     to `targetPort` when it's a number; falls back to
 *                     `servicePort` when `targetPort` is a named port.
 *
 * `localPort` is only meaningful for `runtime: 'local'` namespaces and lets
 * several services coexist on localhost with different ports.
 */
export interface NormalizedPort {
  name: string
  servicePort: number
  targetPort: number | string
  containerPort: number
  protocol: 'TCP' | 'UDP'
  localPort?: number
}

/**
 * Normalize a single {@link ServicePort}. Accepts the docker-compose style
 * `"80:3000"` shorthand as well as the explicit `{ port, targetPort }` shape.
 */
export function normalizePort(input: ServicePort): NormalizedPort {
  let servicePort: number
  let resolvedTarget: number | string

  if (typeof input.port === 'string') {
    const parts = input.port.split(':')
    if (parts.length === 2) {
      servicePort = parseIntStrict(parts[0], input.port)
      resolvedTarget = input.targetPort ?? parseIntStrict(parts[1], input.port)
    } else {
      const parsed = parseIntStrict(input.port, input.port)
      servicePort = parsed
      resolvedTarget = input.targetPort ?? parsed
    }
  } else {
    servicePort = input.port
    resolvedTarget = input.targetPort ?? input.port
  }

  const containerPort = typeof resolvedTarget === 'number' ? resolvedTarget : servicePort

  return {
    name: input.name,
    servicePort,
    targetPort: resolvedTarget,
    containerPort,
    protocol: input.protocol ?? 'TCP',
    localPort: input.localPort
  }
}

export function normalizePorts(input?: ServicePort[] | null): NormalizedPort[] {
  if (!input || !Array.isArray(input)) return []
  return input.map(normalizePort)
}

/**
 * Select a single port from a normalized list. Without a selector, returns the
 * first entry (tsops convention for the "primary" port). With a string
 * selector, matches by name.
 */
export function pickPort(ports: NormalizedPort[], selector?: string): NormalizedPort | undefined {
  if (ports.length === 0) return undefined
  if (!selector) return ports[0]
  return ports.find((p) => p.name === selector)
}

function parseIntStrict(value: string, originalInput: string): number {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid port value "${originalInput}": expected a number or "service:container" format.`
    )
  }
  return parseInt(trimmed, 10)
}
