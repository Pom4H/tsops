import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  createConfigResolver,
  defineConfig,
  Planner,
  topoSort,
  validateDependencies
} from 'tsops'

describe('dependency graph primitives', () => {
  it('topoSort orders dependencies before dependents', () => {
    const apps = [
      { name: 'web', needs: ['api'] },
      { name: 'api', needs: ['db'] },
      { name: 'db', needs: [] }
    ]
    expect(topoSort(apps)).toEqual(['db', 'api', 'web'])
  })

  it('topoSort preserves input order for independent apps', () => {
    const apps = [
      { name: 'a', needs: [] },
      { name: 'b', needs: [] },
      { name: 'c', needs: [] }
    ]
    expect(topoSort(apps)).toEqual(['a', 'b', 'c'])
  })

  it('topoSort throws on a cycle', () => {
    const apps = [
      { name: 'a', needs: ['b'] },
      { name: 'b', needs: ['a'] }
    ]
    expect(() => topoSort(apps)).toThrow(/cycle/)
  })

  it('validateDependencies flags unknown, self, and not-deployed-here', () => {
    const apps = [
      { name: 'api', needs: ['web', 'missing', 'api'] },
      { name: 'web', needs: [] }
    ]
    const known = new Set(['api', 'web', 'other'])
    const deployed = new Set(['api']) // web excluded from this namespace
    const errors = validateDependencies(apps, known, deployed, 'prod')
    const kinds = errors.map((e) => e.kind).sort()
    expect(kinds).toContain('unknown')
    expect(kinds).toContain('self')
    expect(kinds).toContain('not-deployed-here')
  })

  it('validateDependencies reports cycles', () => {
    const apps = [
      { name: 'a', needs: ['b'] },
      { name: 'b', needs: ['a'] }
    ]
    const errors = validateDependencies(
      apps,
      new Set(['a', 'b']),
      new Set(['a', 'b']),
      'prod'
    )
    const cycle = errors.find((e) => e.kind === 'cycle')
    expect(cycle).toBeDefined()
    expect(cycle!.path).toEqual(['a', 'b', 'a'])
  })

  it('buildGraph captures nodes and edges', () => {
    const graph = buildGraph([
      { name: 'api', needs: ['db'] },
      { name: 'db', needs: [] }
    ])
    expect(graph.nodes).toEqual(['api', 'db'])
    expect(graph.edges).toEqual([{ from: 'api', to: 'db' }])
  })
})

describe('planner + needs', () => {
  function makeConfig(apps: Record<string, any>, namespaces: Record<string, any> = { prod: {} }) {
    return defineConfig({
      project: 'demo',
      namespaces,
      clusters: {
        prod: {
          apiServer: 'https://p:6443',
          context: 'p',
          namespaces: Object.keys(namespaces) as any
        }
      },
      images: { registry: 'ghcr.io/acme', tagStrategy: 'git-tag' as const },
      apps
    })
  }

  it('orders plan entries topologically per namespace', async () => {
    const cfg = makeConfig({
      web: { needs: ['api'], ports: [{ name: 'http', port: 80, targetPort: 3000 }] },
      api: { needs: ['db'], ports: [{ name: 'http', port: 80, targetPort: 3000 }] },
      db: { ports: [{ name: 'http', port: 80, targetPort: 5432 }] }
    })
    const resolver = createConfigResolver(cfg)
    const planner = new Planner({ resolver, config: cfg })
    const plan = await planner.plan({ namespace: 'prod' })
    expect(plan.entries.map((e) => e.app)).toEqual(['db', 'api', 'web'])
    expect(plan.dependencies?.prod.order).toEqual(['db', 'api', 'web'])
  })

  it('throws on unknown dependency', async () => {
    const cfg = makeConfig({
      api: { needs: ['missing'], ports: [{ name: 'http', port: 80, targetPort: 3000 }] }
    })
    const planner = new Planner({ resolver: createConfigResolver(cfg), config: cfg })
    await expect(planner.plan()).rejects.toThrow(/unknown app "missing"/)
  })

  it('throws on cycle', async () => {
    const cfg = makeConfig({
      a: { needs: ['b'], ports: [{ name: 'http', port: 80, targetPort: 3000 }] },
      b: { needs: ['a'], ports: [{ name: 'http', port: 80, targetPort: 3000 }] }
    })
    const planner = new Planner({ resolver: createConfigResolver(cfg), config: cfg })
    await expect(planner.plan()).rejects.toThrow(/cycle/i)
  })

  it('throws when dep is excluded from the current namespace', async () => {
    const cfg = makeConfig(
      {
        api: {
          needs: ['db'],
          ports: [{ name: 'http', port: 80, targetPort: 3000 }]
        },
        db: {
          deploy: { exclude: ['prod'] },
          ports: [{ name: 'http', port: 80, targetPort: 5432 }]
        }
      },
      { prod: {}, stage: {} }
    )
    const planner = new Planner({ resolver: createConfigResolver(cfg), config: cfg })
    await expect(planner.plan({ namespace: 'prod' })).rejects.toThrow(/not deployed to namespace "prod"/)
  })

  it('omits dependencies field when no app declares needs', async () => {
    const cfg = makeConfig({
      api: { ports: [{ name: 'http', port: 80, targetPort: 3000 }] }
    })
    const plan = await new Planner({
      resolver: createConfigResolver(cfg),
      config: cfg
    }).plan()
    expect(plan.dependencies).toBeUndefined()
  })

  it('plan({ app }) validates against full namespace, not just the selected app', async () => {
    const cfg = makeConfig({
      api: { needs: ['db'], ports: [{ name: 'http', port: 80, targetPort: 3000 }] },
      db: { ports: [{ name: 'http', port: 80, targetPort: 5432 }] }
    })
    const planner = new Planner({ resolver: createConfigResolver(cfg), config: cfg })
    // Narrowing to `api` must not misreport db as not-deployed-here.
    const plan = await planner.plan({ namespace: 'prod', app: 'api' })
    expect(plan.entries.map((e) => e.app)).toEqual(['api'])
    // dependencies.order reflects the full namespace graph.
    expect(plan.dependencies?.prod.order).toEqual(['db', 'api'])
  })
})
