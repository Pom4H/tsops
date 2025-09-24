async function fetchBackendMessage() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080'
  const target = `${baseUrl.replace(/\/$/, '')}/api/message`

  try {
    const response = await fetch(target, { cache: 'no-store' })

    if (!response.ok) {
      return {
        ok: false,
        message: `Backend returned ${response.status}`
      }
    }

    const payload = await response.json()
    return {
      ok: true,
      message: payload.message ?? 'No message field in response'
    }
  } catch (error) {
    return {
      ok: false,
      message: `Failed to reach backend: ${error instanceof Error ? error.message : 'unknown error'}`
    }
  }
}

export default async function Page() {
  const result = await fetchBackendMessage()
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080'

  return (
    <main>
      <h1>TsOps Fullstack Demo</h1>
      <p>Frontend built with Next.js and shipped through TsOps.</p>
      <p>
        Target backend:&nbsp;
        <code>{apiBase}</code>
      </p>
      <p>
        Backend status:&nbsp;
        <strong>{result.ok ? 'online' : 'offline'}</strong>
      </p>
      <p>
        Message:&nbsp;
        <code>{result.message}</code>
      </p>
      <footer>Fetch runs on the server each render – handy for smoke tests post-deploy.</footer>
    </main>
  )
}
