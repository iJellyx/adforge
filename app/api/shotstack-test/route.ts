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

  // Minimal valid render payload for POST test
  const minimalPayload = {
    timeline: {
      tracks: [{
        clips: [{
          asset: { type: 'title', text: 'Test', style: 'minimal' },
          start: 0,
          length: 2,
        }],
      }],
    },
    output: { format: 'mp4', resolution: 'sd', aspectRatio: '16:9', fps: 25 },
  }

  const results: any[] = []
  for (const { label, base } of candidates) {
    const url = `${base}/render`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(minimalPayload),
      })
      const body = await res.text().catch(() => '')
      let parsed: any = null
      try { parsed = JSON.parse(body) } catch {}

      const shotstackMessage = parsed?.message || parsed?.response?.message || ''
      const shotstackDetail = parsed?.response?.error || parsed?.error || ''

      let verdict = ''
      if (res.status === 200 || res.status === 201) {
        verdict = '✅ SUCCESS — URL + key work end-to-end'
        // Cancel the test render immediately so it doesn't consume credits
        if (parsed?.response?.id) {
          verdict += ` (test render id: ${parsed.response.id}, safe to ignore — <2s cost)`
        }
      } else if (res.status === 401) {
        verdict = '❌ 401 Unauthorized — API key is wrong/missing/revoked for this URL'
      } else if (res.status === 403) {
        verdict = `❌ 403 Forbidden — key recognised but not allowed to render. Reason: ${shotstackMessage || shotstackDetail || 'unknown'}. Common causes: free tier lacking render, quota exhausted, wrong environment (stage key on prod URL).`
      } else if (res.status === 404) {
        verdict = '❌ 404 — wrong URL path'
      } else if (res.status === 400) {
        verdict = `⚠️ 400 Bad Request — URL + key work but payload rejected: ${shotstackMessage || shotstackDetail}. (This diagnostic payload is minimal, so a 400 probably still means your key is fine.)`
      } else {
        verdict = `HTTP ${res.status}: ${shotstackMessage || shotstackDetail || body.slice(0, 200)}`
      }

      results.push({
        label,
        url,
        status: res.status,
        statusText: res.statusText,
        body: body.slice(0, 500),
        verdict,
      })
    } catch (e: any) {
      results.push({ label, url, error: e.message })
    }
  }

  // Pick the most-likely-working URL (success or payload-rejected 400 both imply key works)
  const working = results.find(r => r.status === 200 || r.status === 201 || r.status === 400)

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
