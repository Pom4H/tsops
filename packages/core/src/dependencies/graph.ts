export interface DependencyEdge {
  from: string
  to: string
}

export interface DependencyGraph {
  /** All apps that appear as nodes in the graph (includes isolated apps). */
  nodes: string[]
  edges: DependencyEdge[]
}

/**
 * Build a dependency graph for a given set of apps inside one namespace.
 * Only apps that will actually deploy to the namespace are considered "present".
 * Dependencies pointing at apps that aren't present for this namespace are
 * caught by {@link validateDependencies}.
 */
export function buildGraph(
  apps: Array<{ name: string; needs: readonly string[] }>
): DependencyGraph {
  const nodes = apps.map((a) => a.name)
  const edges: DependencyEdge[] = []
  for (const { name, needs } of apps) {
    for (const target of needs) {
      edges.push({ from: name, to: target })
    }
  }
  return { nodes, edges }
}

export interface DependencyError {
  app: string
  kind: 'unknown' | 'self' | 'not-deployed-here' | 'cycle'
  message: string
  /** For cycles, the app names forming the cycle in order. */
  path?: string[]
}

/**
 * Validate a dependency graph against the set of apps that will deploy to the
 * current namespace. Returns an array of errors; empty array means valid.
 */
export function validateDependencies(
  apps: Array<{ name: string; needs: readonly string[] }>,
  knownApps: Set<string>,
  deployedApps: Set<string>,
  namespace: string
): DependencyError[] {
  const errors: DependencyError[] = []
  const appNames = new Set(apps.map((a) => a.name))

  for (const { name, needs } of apps) {
    for (const target of needs) {
      if (target === name) {
        errors.push({
          app: name,
          kind: 'self',
          message: `App "${name}" cannot depend on itself.`
        })
        continue
      }
      if (!knownApps.has(target)) {
        errors.push({
          app: name,
          kind: 'unknown',
          message: `App "${name}" depends on unknown app "${target}".`
        })
        continue
      }
      if (!deployedApps.has(target)) {
        errors.push({
          app: name,
          kind: 'not-deployed-here',
          message:
            `App "${name}" depends on "${target}", but "${target}" is not deployed ` +
            `to namespace "${namespace}". Either include "${target}" in this namespace's ` +
            `deploy selection, or remove it from "${name}".needs.`
        })
      }
    }
  }

  // Cycle detection via DFS over the subgraph of apps present in this namespace.
  const adj = new Map<string, string[]>()
  for (const { name, needs } of apps) {
    adj.set(
      name,
      needs.filter((n) => appNames.has(n))
    )
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const node of appNames) color.set(node, WHITE)

  const stack: string[] = []

  function visit(node: string): string[] | undefined {
    if (color.get(node) === GRAY) {
      const cycleStart = stack.indexOf(node)
      return [...stack.slice(cycleStart), node]
    }
    if (color.get(node) === BLACK) return undefined
    color.set(node, GRAY)
    stack.push(node)
    for (const next of adj.get(node) ?? []) {
      const cycle = visit(next)
      if (cycle) return cycle
    }
    stack.pop()
    color.set(node, BLACK)
    return undefined
  }

  for (const node of appNames) {
    if (color.get(node) !== WHITE) continue
    const cycle = visit(node)
    if (cycle) {
      errors.push({
        app: cycle[0],
        kind: 'cycle',
        message: `Dependency cycle detected: ${cycle.join(' → ')}`,
        path: cycle
      })
      break // one cycle report is enough — more would be noise
    }
  }

  return errors
}

/**
 * Topologically sort apps so dependencies come before their dependents.
 * Ignores edges pointing to apps not in the set (those are validation errors).
 * Apps with no ordering relationship keep their input order (stable sort).
 *
 * Throws if the input graph contains a cycle — call {@link validateDependencies}
 * first to surface a friendlier error.
 */
export function topoSort(apps: Array<{ name: string; needs: readonly string[] }>): string[] {
  const appNames = new Set(apps.map((a) => a.name))
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const { name } of apps) {
    indeg.set(name, 0)
    adj.set(name, [])
  }
  for (const { name, needs } of apps) {
    for (const target of needs) {
      if (!appNames.has(target)) continue
      // edge target → name (target must come first)
      adj.get(target)!.push(name)
      indeg.set(name, (indeg.get(name) ?? 0) + 1)
    }
  }

  // Kahn's algorithm; preserve input order among equally-ready nodes.
  const order: string[] = []
  const ready: string[] = apps.filter((a) => (indeg.get(a.name) ?? 0) === 0).map((a) => a.name)

  while (ready.length > 0) {
    const next = ready.shift()!
    order.push(next)
    for (const dependent of adj.get(next) ?? []) {
      const remaining = (indeg.get(dependent) ?? 0) - 1
      indeg.set(dependent, remaining)
      if (remaining === 0) ready.push(dependent)
    }
  }

  if (order.length !== apps.length) {
    throw new Error('topoSort: cycle detected in dependency graph')
  }
  return order
}
