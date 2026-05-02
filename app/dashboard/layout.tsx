import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

/**
 * Dashboard guard — Clerk-driven.
 *
 * The middleware already protects this route, but a server-side check
 * here is a safety net (and lets us redirect to /sign-in cleanly with
 * a `redirect_url` so the user lands back on the dashboard after
 * signing in).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in?redirect_url=/dashboard')
  return <>{children}</>
}
