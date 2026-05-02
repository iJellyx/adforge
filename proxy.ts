import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Clerk auth proxy — Next.js 16 calls this `proxy.ts` (was `middleware.ts`
 * in earlier versions). Mirrors the AdSplit pattern.
 *
 * Public routes are explicit. Everything else requires sign-in.
 * Webhooks and creator brief share links must stay public so external
 * services can hit them without a Clerk session.
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

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  const path = req.nextUrl.pathname

  // Signed-in user on the marketing/landing page → bounce to dashboard.
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
