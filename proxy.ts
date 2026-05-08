import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Clerk auth proxy — Next.js 16 calls this `proxy.ts` (was `middleware.ts`
 * in earlier versions). Mirrors the AdSplit pattern.
 *
 * Public routes are explicit. Everything else requires sign-in.
 * Webhooks and creator brief share links must stay public so external
 * services can hit them without a Clerk session.
 *
 * Host-based routing: requests on stash.adsplit.io are rewritten to /stash
 * so we can serve the standalone Stash UI from the same Next app + same
 * Vercel project. Clerk SSO works because forge.adsplit.io is already a
 * Clerk satellite of the primary adsplit.io domain — stash.adsplit.io
 * inherits the same Allowed Subdomains rule.
 */
const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/brief/(.*)',                 // public brief share links — token-protected internally
  '/api/mux/webhook(.*)',        // Mux callbacks
  '/api/items/(.*)',             // Item status polling — TODO Clerk-protect once UI passes auth header
  '/api/elevenlabs/voices(.*)',  // public voice list (no PII)
  '/api/pixabay/music(.*)',      // public music search proxy
])

const STASH_HOSTS = new Set([
  'stash.adsplit.io',
  'stash.localhost',           // local dev convenience
])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  const path = req.nextUrl.pathname
  const host = req.headers.get('host')?.split(':')[0] || ''

  // ── stash.adsplit.io rewrite ───────────────────────────────────────────
  // If we're on the Stash subdomain, rewrite the URL into the /stash route
  // group so the user sees a clean stash.adsplit.io URL but Next renders
  // /stash internally. Skip rewrite for /api, /_next, and Clerk's auth
  // endpoints — those need to resolve at the root.
  if (STASH_HOSTS.has(host)) {
    const isStashAsset = path.startsWith('/_next') || path.startsWith('/api') ||
                         path.startsWith('/sign-in') || path.startsWith('/sign-up') ||
                         path.startsWith('/__clerk') || path === '/favicon.ico'
    if (!isStashAsset && !path.startsWith('/stash')) {
      // Stash is a single-page surface — collapse any path on this host to
      // /stash so links like /dashboard or /forged that point back to Forge
      // don't 404 on the subdomain. Users who want Forge tabs cross over via
      // the Products nav.
      const url = req.nextUrl.clone()
      url.pathname = '/stash'
      return NextResponse.rewrite(url)
    }
  }

  // Signed-in user on the marketing/landing page → bounce to dashboard.
  // (On stash.adsplit.io the rewrite above already turned `/` into `/stash`,
  // so this branch only fires on forge.adsplit.io.)
  if (userId && path === '/') {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (!isPublic(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4)$).*)',
    '/(api|trpc)(.*)',
  ],
}
