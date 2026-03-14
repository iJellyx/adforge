import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AdForge',
  description: 'AI-powered ad creation platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}