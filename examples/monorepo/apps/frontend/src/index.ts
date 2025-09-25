import {
  OutgoingHttpHeaders,
  createServer,
  IncomingMessage,
  ServerResponse,
  request as httpRequest
} from 'node:http'

const port = Number(process.env.PORT ?? 3000)
const backendInternalUrl =
  process.env.BACKEND_INTERNAL_URL ?? 'http://backend.tsops-monorepo.svc.cluster.local:4000'
const backendPublicUrl = process.env.BACKEND_PUBLIC_URL ?? '/api'
const pageTitle = process.env.PAGE_TITLE ?? 'Turbo Frontend'

const htmlTemplate = (body: string): string => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    <style>
      :root { font-family: system-ui, sans-serif; color: #1f2933; background: #f8fafc; }
      body { margin: 0; padding: 2.5rem; }
      h1 { font-size: 2rem; margin-bottom: 1rem; }
      pre { background: #0f172a; color: #f8fafc; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
      footer { margin-top: 2rem; color: #64748b; font-size: 0.9rem; }
      .error { color: #dc2626; }
    </style>
  </head>
  <body>
    ${body}
    <footer>Backend URL: ${backendPublicUrl}</footer>
    <script>
      async function loadBackend() {
        const resultElement = document.getElementById('backend-result')
        try {
          const response = await fetch(new URL('${backendPublicUrl}', window.location.origin))
          const payload = await response.json()
          resultElement.textContent = JSON.stringify(payload, null, 2)
        } catch (error) {
          resultElement.textContent = String(error)
          resultElement.classList.add('error')
        }
      }
      loadBackend()
    </script>
  </body>
</html>`

const renderBody = (): string => `
  <main>
    <h1>${pageTitle}</h1>
    <p>This page is served from the frontend app inside the Turbo monorepo example.</p>
    <p>The backend response is rendered below:</p>
    <pre id="backend-result">Loading...</pre>
  </main>
`

const proxyApiRequest = (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
  const url = req.url ?? '/'
  if (!url.startsWith('/api')) {
    return Promise.resolve(false)
  }

  const targetPath = url.slice('/api'.length) || '/'
  const targetUrl = new URL(targetPath, backendInternalUrl)

  return new Promise((resolve) => {
    const proxyReq = httpRequest(
      targetUrl,
      {
        method: req.method ?? 'GET',
        headers: {
          ...req.headers,
          host: targetUrl.host
        }
      },
      (proxyRes) => {
        const headers = { ...proxyRes.headers } as OutgoingHttpHeaders
        res.writeHead(proxyRes.statusCode ?? 502, headers)
        proxyRes.pipe(res, { end: true })
        proxyRes.on('end', () => resolve(true))
      }
    )

    proxyReq.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'Bad gateway', details: String(error) }))
      resolve(true)
    })

    req.pipe(proxyReq, { end: true })
  })
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (await proxyApiRequest(req, res)) {
    return
  }

  const html = htmlTemplate(renderBody())
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})

server.listen(port, () => {
  console.log(`Frontend listening on port ${port}`)
})
