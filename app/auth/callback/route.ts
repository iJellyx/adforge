import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /auth/callback?code=...&next=/some/path
 *
 * Exchanges a Supabase PKCE auth code for a session, then redirects to
 * the requested next path (defaults to /dashboard).
 *
 * Used for:
 * - Sign-in with magic links
 * - Password recovery flow (`next` is /auth/reset-password)
 * - OAuth providers (Google, etc.)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next') || '/dashboard'
  // Only allow same-origin paths to prevent open-redirect abuse
  const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
    }
  }
  return NextResponse.redirect(`${origin}${next}`)
}
