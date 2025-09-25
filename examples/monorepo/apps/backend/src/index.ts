import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

const port = Number(process.env.PORT ?? 4000)
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'
const apiToken = process.env.API_TOKEN ?? 'not-set'
const releaseId = process.env.RELEASE ?? 'local'
const nodeEnv = process.env.NODE_ENV ?? 'development'

const requestIdHeader = 'x-request-id'

const mask = (value: string, visible = 4): string => {
  if (value.length <= visible) {
    return value
  }
  const hidden = value.length - visible
  return `${'*'.repeat(hidden)}${value.slice(-visible)}`
}

const sendJson = (res: ServerResponse, body: Record<string, unknown>, status = 200): void => {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  })
  res.end(payload)
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'
  const requestId = req.headers[requestIdHeader] ?? randomUUID()

  if (url === '/healthz') {
    sendJson(res, { status: 'ok' })
    return
  }

  if (url === '/config') {
    sendJson(res, {
      service: 'backend',
      release: releaseId,
      environment: nodeEnv,
      frontendUrl
    })
    return
  }

  if (url === '/secret') {
    sendJson(res, {
      tokenPreview: mask(apiToken),
      available: apiToken !== 'not-set'
    })
    return
  }

  if (url === '/echo' && method === 'POST') {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      sendJson(res, {
        service: 'backend',
        received: body,
        requestId
      })
    })
    return
  }

  sendJson(res, {
    service: 'backend',
    message: 'Hello from the Turbo monorepo backend!',
    requestId,
    release: releaseId,
    secretPreview: mask(apiToken)
  })
})

server.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
})
