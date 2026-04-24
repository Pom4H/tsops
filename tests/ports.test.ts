import { describe, expect, it } from 'vitest'
import { normalizePort, normalizePorts, pickPort } from 'tsops'

describe('normalizePort', () => {
  it('splits servicePort and targetPort', () => {
    expect(normalizePort({ name: 'http', port: 80, targetPort: 3000 })).toEqual({
      name: 'http',
      servicePort: 80,
      targetPort: 3000,
      containerPort: 3000,
      protocol: 'TCP',
      localPort: undefined
    })
  })

  it('defaults targetPort to port when absent', () => {
    expect(normalizePort({ name: 'http', port: 80 })).toMatchObject({
      servicePort: 80,
      targetPort: 80,
      containerPort: 80
    })
  })

  it('parses docker-style "service:container" shorthand', () => {
    expect(normalizePort({ name: 'http', port: '80:3000' })).toMatchObject({
      servicePort: 80,
      targetPort: 3000,
      containerPort: 3000
    })
  })

  it('explicit targetPort wins over shorthand second field', () => {
    expect(normalizePort({ name: 'http', port: '80:3000', targetPort: 4000 })).toMatchObject({
      servicePort: 80,
      targetPort: 4000,
      containerPort: 4000
    })
  })

  it('falls back containerPort to servicePort when targetPort is a named port', () => {
    expect(normalizePort({ name: 'http', port: 80, targetPort: 'http' })).toMatchObject({
      servicePort: 80,
      targetPort: 'http',
      containerPort: 80
    })
  })

  it('preserves localPort', () => {
    expect(
      normalizePort({ name: 'http', port: 80, targetPort: 3000, localPort: 3050 })
    ).toMatchObject({ localPort: 3050 })
  })

  it('throws on invalid string ports', () => {
    expect(() => normalizePort({ name: 'http', port: 'abc' })).toThrow(/Invalid port/)
  })
})

describe('pickPort', () => {
  const ports = normalizePorts([
    { name: 'http', port: 80, targetPort: 3000 },
    { name: 'metrics', port: 9090, targetPort: 9090 }
  ])

  it('returns the first port without a selector', () => {
    expect(pickPort(ports)?.name).toBe('http')
  })

  it('matches by name', () => {
    expect(pickPort(ports, 'metrics')?.servicePort).toBe(9090)
  })

  it('returns undefined when name is missing', () => {
    expect(pickPort(ports, 'grpc')).toBeUndefined()
  })
})
