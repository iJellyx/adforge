import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/lib/theme-context'
import { ClerkProvider } from '@clerk/nextjs'

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
    // Clerk wraps everything so we get sign-in state in both server + client trees.
    // Same Clerk app as AdSplit (one identity, two products) — driven by the
    // shared NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY env vars.
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com"/>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
        </head>
        <body>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
