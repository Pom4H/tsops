'use client'

import { useEffect, useRef, useState } from 'react'

export default function Page() {
  const [messages, setMessages] = useState<string[]>([])
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol =
      typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = typeof window !== 'undefined' ? window.location.host : ''
    const explicit = process.env.NEXT_PUBLIC_WS_URL
    const url = explicit || `${protocol}://${host}/ws`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws
      ws.addEventListener('open', () => setStatus('open'))
      ws.addEventListener('close', () => setStatus('closed'))
      ws.addEventListener('error', () => setStatus('error'))
      ws.addEventListener('message', (event) => setMessages((prev) => [...prev, event.data]))
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'hello', at: Date.now() }))
      })
    } catch {
      setStatus('error')
    }

    return () => {
      wsRef.current?.close()
    }
  }, [])

  const sendPing = () => {
    wsRef.current?.send(JSON.stringify({ type: 'ping', at: Date.now() }))
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>WebSocket Demo</h1>
      <p>Status: {status}</p>
      <button onClick={sendPing} disabled={status !== 'open'}>
        Send ping
      </button>
      <h2>Messages</h2>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{m}</pre>
          </li>
        ))}
      </ul>
    </main>
  )
}
