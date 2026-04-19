import { NextResponse } from 'next/server'

/**
 * GET /api/shotstack-test
 * Diagnostic endpoint — tests the Shotstack API key against both known
 * URL formats and reports which (if any) accepts it. No render submission.
 *
 * This is the fastest way to diagnose 403 Forbidden errors:
 *   - If both URLs fail: the key is invalid, revoked, or missing
 *   - If one succeeds: the working URL format tells us which to use
 */
export async function GET() {
  const key = process.env.SHOTSTACK_API_KEY
  const env = process.env.SHOTSTACK_ENV || 'stage'
  const explicitBase = process.env.SHOTSTACK_BASE_URL

  if (!key) {
    return NextResponse.json({
      ok: false,
      error: 'SHOTSTACK_API_KEY env var is not set',
      env_vars_found: { SHOTSTACK_API_KEY: false, SHOTSTACK_ENV: !!process.env.SHOTSTACK_ENV },
      fix: 'Set SHOTSTACK_API_KEY in Vercel project settings → Environment Variables, then redeploy.',
    }, { status: 500 })
  }

  const keyPrefix = key.slice(0, 6)
  const keySuffix = key.slice(-4)

  // Build the candidate URLs
  const candidates = explicitBase
    ? [{ label: 'SHOTSTACK_BASE_URL', base: explicitBase }]
    : [
        // Old format: no /edit/
        { label: `legacy /${env}`, base: `https://api.shotstack.io/${env}` },
        // Current docs format: /edit/
        { label: `edit /${env}`, base: `https://api.shotstack.io/edit/${env}` },
        // If env=production or v1 typo, also try both cases
        ...(env === 'production' || env === 'prod' ? [{ label: 'edit /v1', base: 'https://api.shotstack.io/edit/v1' }] : []),
        ...(env !== 'stage' && env !== 'production' ? [{ label: 'edit /stage', base: 'https://api.shotstack.io/edit/stage' }] : []),
      ]

  const results: any[] = []
  for (const { label, base } of candidates) {
    const url = `${base}/render`
    try {
      // GET on /render usually returns 405 (method not allowed) if URL is valid and auth passes.
      // 401/403 → auth problem. 404 → wrong URL. Anything else → URL is reachable.
      const res = await fetch(url, { method: 'GET', headers: { 'x-api-key': key } })
      const body = await res.text().catch(() => '')
      results.push({
        label,
        url,
        status: res.status,
        statusText: res.statusText,
        snippet: body.slice(0, 200),
        verdict: res.status === 401 || res.status === 403
          ? 'AUTH FAILED — key rejected by this URL'
          : res.status === 404
          ? 'URL NOT FOUND — this endpoint path is wrong'
          : res.status === 405
          ? 'URL VALID & KEY ACCEPTED (GET not allowed but that is expected)'
          : `HTTP ${res.status} — url reachable`,
      })
    } catch (e: any) {
      results.push({ label, url, error: e.message })
    }
  }

  // Pick the most-likely-working URL
  const working = results.find(r => r.status === 405 || r.status === 200)

  return NextResponse.json({
    ok: !!working,
    summary: working
      ? `✅ Key is valid for URL: ${working.url}`
      : '❌ Key is rejected by every tested URL — check the key value',
    keyFingerprint: `${keyPrefix}…${keySuffix}`,
    env_vars: {
      SHOTSTACK_API_KEY: `set (${key.length} chars)`,
      SHOTSTACK_ENV: env,
      SHOTSTACK_BASE_URL: explicitBase || '(not set)',
    },
    tested: results,
    recommendation: working
      ? `Set SHOTSTACK_BASE_URL=${working.url.replace('/render', '')} in Vercel env vars to lock in this URL.`
      : 'Double-check your Shotstack API key. Is it from stage or production? Does it have render permission? Try regenerating it in the Shotstack dashboard.',
  })
}
