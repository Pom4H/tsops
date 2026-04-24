import { describe, expect, it } from 'vitest'
import { defineDockerfileBuild } from 'tsops'

describe('defineDockerfileBuild', () => {
  it('produces a full DockerfileBuild for a given path', () => {
    const dockerfile = defineDockerfileBuild({
      context: '.',
      platform: 'linux/amd64',
      env: { TURBO_TELEMETRY_DISABLED: '1' }
    })

    expect(dockerfile('infra/images/api.dockerfile')).toEqual({
      type: 'dockerfile',
      context: '.',
      dockerfile: 'infra/images/api.dockerfile',
      platform: 'linux/amd64',
      env: { TURBO_TELEMETRY_DISABLED: '1' }
    })
  })

  it('allows per-app overrides', () => {
    const dockerfile = defineDockerfileBuild({ context: '.', platform: 'linux/amd64' })
    const build = dockerfile('Dockerfile', { target: 'production', platform: 'linux/arm64' })
    expect(build).toMatchObject({ target: 'production', platform: 'linux/arm64', context: '.' })
  })

  it('shallow-merges env and args across defaults and overrides', () => {
    const dockerfile = defineDockerfileBuild({
      env: { A: '1', B: '2' },
      args: { NODE_VERSION: '20' }
    })
    const build = dockerfile('Dockerfile', {
      env: { B: 'override', C: '3' },
      args: { EXTRA: 'yes' }
    })
    expect(build.env).toEqual({ A: '1', B: 'override', C: '3' })
    expect(build.args).toEqual({ NODE_VERSION: '20', EXTRA: 'yes' })
  })

  it('defaults context to "." when neither defaults nor overrides set it', () => {
    const dockerfile = defineDockerfileBuild()
    expect(dockerfile('Dockerfile').context).toBe('.')
  })

  it('omits optional fields when unused', () => {
    const dockerfile = defineDockerfileBuild()
    const build = dockerfile('Dockerfile')
    expect(build).not.toHaveProperty('platform')
    expect(build).not.toHaveProperty('env')
    expect(build).not.toHaveProperty('args')
    expect(build).not.toHaveProperty('target')
  })
})
