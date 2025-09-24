import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'TsOps Demo :: Frontend',
  description: 'Next.js frontend deployed via TsOps'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
