import { NextRequest, NextResponse } from 'next/server'
import Mux from '@mux/mux-node'
import { createServiceClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Webhook must respond quickly. All slow AI work is deferred to /api/items/reanalyse.
export const maxDuration = 60

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

function triggerReanalyse(itemId: string, baseUrl: string) {
  // Fire-and-forget. Returns immediately; the reanalyse route does the heavy lifting.
  const url = new URL('/api/items/reanalyse', baseUrl).toString()
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  }).catch(e => console.error(`[${itemId}] Failed to trigger reanalyse:`, e.message))
}

export async function POST(req: NextRequest) {
  const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID!,
    tokenSecret: process.env.MUX_TOKEN_SECRET!,
  })

  const body = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => { headers[key] = value })

  try {
    mux.webhooks.verifySignature(body, headers, process.env.MUX_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  const supabase = createServiceClient()

  if (event.type === 'video.asset.errored') {
    const itemId = event.data?.meta?.item_id
    if (itemId) await supabase.from('items').update({ mux_status: 'errored' }).eq('id', itemId)
    return NextResponse.json({ ok: true })
  }

  if (event.type !== 'video.asset.ready') return NextResponse.json({ ok: true })

  const asset = event.data
  const itemId = asset.passthrough
  if (!itemId) return NextResponse.json({ ok: true })

  const playbackId = asset.playback_ids?.[0]?.id
  const duration = asset.duration || 30

  // ── FAST PATH: Set playback_id and mark as 'ready' so video is immediately usable ──
  await supabase.from('items').update({
    mux_asset_id: asset.id,
    mux_playback_id: playbackId,
    mux_status: 'ready',
    duration_seconds: duration,
  }).eq('id', itemId)
  console.log(`[${itemId}] Video ready — playback_id set, triggering background analysis`)

  // Fetch the item to check for auto_clip flag and get workspace info
  const { data: item } = await supabase.from('items').select('workspace_id, auto_clip').eq('id', itemId).single()
  if (!item) return NextResponse.json({ ok: true })

  // ── Quick duplicate check (max 3 candidates, thumbnail-only, fast) ──
  if (playbackId) {
    try {
      let dupQuery = supabase
        .from('items')
        .select('id, title, mux_playback_id, duration_seconds')
        .eq('type', 'original')
        .neq('id', itemId)
        .neq('mux_status', 'errored')
        .neq('mux_status', 'duplicate')
        .gte('duration_seconds', duration - 1.5)
        .lte('duration_seconds', duration + 1.5)
        .limit(3)
      if (item.workspace_id) dupQuery = dupQuery.eq('workspace_id', item.workspace_id)
      const { data: candidates } = await dupQuery

      if (candidates && candidates.length > 0 && process.env.GOOGLE_AI_API_KEY) {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        const newThumbUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=320`

        for (const candidate of candidates) {
          if (!candidate.mux_playback_id) continue
          const candidateThumbUrl = `https://image.mux.com/${candidate.mux_playback_id}/thumbnail.jpg?time=0&width=320`

          try {
            const [newThumbRes, candThumbRes] = await Promise.all([
              fetchWithTimeout(newThumbUrl, {}, 8000),
              fetchWithTimeout(candidateThumbUrl, {}, 8000),
            ])
            if (!newThumbRes.ok || !candThumbRes.ok) continue

            const [newThumbBuf, candThumbBuf] = await Promise.all([
              newThumbRes.arrayBuffer(),
              candThumbRes.arrayBuffer(),
            ])
            const newThumbB64 = Buffer.from(newThumbBuf).toString('base64')
            const candThumbB64 = Buffer.from(candThumbBuf).toString('base64')

            const result = await model.generateContent([
              { inlineData: { mimeType: 'image/jpeg', data: newThumbB64 } },
              { inlineData: { mimeType: 'image/jpeg', data: candThumbB64 } },
              'Are these two video thumbnails from the same video? Answer only YES or NO.'
            ])
            const answer = result.response.text().trim().toUpperCase()
            if (answer.startsWith('YES')) {
              await supabase.from('items').update({
                mux_status: 'duplicate',
                description: `Duplicate of: ${candidate.title} (${candidate.id})`,
              }).eq('id', itemId)
              try { await mux.video.assets.delete(asset.id) } catch {}
              console.log(`[${itemId}] Blocked as duplicate of "${candidate.title}"`)
              return NextResponse.json({ ok: true, duplicate: true })
            }
          } catch (e: any) {
            console.log(`[${itemId}] Dup check failed for candidate, continuing:`, e.message)
          }
        }
      }
    } catch (dupErr: any) {
      console.log(`[${itemId}] Duplicate check error, continuing:`, dupErr.message)
    }
  }

  // ── BACKGROUND: Trigger AI analysis (transcription + clipping) asynchronously ──
  // This runs independently and can take up to 5 minutes. Video is already 'ready'
  // and usable. If this fails, user can click "Generate Clips" to retry.
  if (item.auto_clip !== false) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    // Don't await — fire and forget
    triggerReanalyse(itemId, baseUrl)
    console.log(`[${itemId}] Reanalyse triggered at ${baseUrl}`)
  }

  return NextResponse.json({ ok: true })
}
