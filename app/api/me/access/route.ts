import { NextResponse } from 'next/server'
import { getServerUserAccess } from '@/lib/access'

/**
 * GET /api/me/access
 * Returns the signed-in user's per-product access flags.
 * Cached per-request — the client component calls this on mount and on
 * focus events to refresh after a Stripe checkout completes.
 */
export async function GET() {
  const access = await getServerUserAccess()
  return NextResponse.json(access)
}
