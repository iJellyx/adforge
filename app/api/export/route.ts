import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
// URL format matches whatever the user's API key was configured for.
// Preserves the original working convention: api.shotstack.io/{SHOTSTACK_ENV}
// where SHOTSTACK_ENV is typically 'stage' or 'v1'. If SHOTSTACK_BASE_URL is
// set explicitly that overrides everything.
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'
const SHOTSTACK_BASE = process.env.SHOTSTACK_BASE_URL || `https://api.shotstack.io/${SHOTSTACK_ENV}`

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Resolve trim values with segment → section → item defaults.
 * Keeps the render in sync with what the preview shows.
 */
function resolveTrim(seg: any, section: any, item: any) {
  const rawStart = seg?.trimStart ?? section?.trimStart ?? item?.start_seconds ?? 0
  const rawEnd = seg?.trimEnd ?? section?.trimEnd ?? item?.end_seconds ?? ((item?.start_seconds ?? 0) + (item?.duration_seconds ?? 5))
  const start = Math.max(0, Number(rawStart) || 0)
  const end = Math.max(start + 0.5, Number(rawEnd) || start + 3)
  return { start, end, duration: end - start }
}

export async function POST(req: NextRequest) {
  try {
    if (!SHOTSTACK_API_KEY) {
      return NextResponse.json({ error: 'SHOTSTACK_API_KEY not configured' }, { status: 500 })
    }
    const { sections, itemIds, voiceoverUrl, musicUrl, aspectRatio } = await req.json()
    const supabase = createServiceClient()

    // Fetch items from DB
    const { data: items, error: itemsErr } = await supabase
      .from('items')
      .select('id, mux_playback_id, start_seconds, end_seconds, duration_seconds, title')
      .in('id', itemIds)

    if (itemsErr) {
      console.error('[export] items fetch error:', itemsErr)
      return NextResponse.json({ error: 'DB error: ' + itemsErr.message }, { status: 500 })
    }
    if (!items || !items.length) {
      return NextResponse.json({ error: 'No items found for provided itemIds' }, { status: 400 })
    }

    // Build ordered clips from sections, respecting trim values.
    // One clip per section (matches the new pipeline). If a section has
    // clipSegments, we use them; otherwise fall back to selectedClipId.
    type BuiltClip = { item: any; start: number; duration: number; label: string; muted?: boolean; sectionIdx: number }
    const built: BuiltClip[] = []
    sections.forEach((s: any, sectionIdx: number) => {
      const segs = s.clipSegments?.length
        ? s.clipSegments
        : (s.selectedClipId ? [{ clipId: s.selectedClipId }] : [])
      for (const seg of segs) {
        const item = items.find((i: any) => i.id === seg.clipId)
        if (!item?.mux_playback_id) continue
        const { start, duration } = resolveTrim(seg, s, item)
        built.push({
          item,
          start,
          duration,
          label: s.type || s.label || '',
          muted: s.muted || !!voiceoverUrl,
          sectionIdx,
        })
      }
    })

    if (!built.length) {
      return NextResponse.json({ error: 'No clips assigned to sections' }, { status: 400 })
    }

    const totalDuration = built.reduce((acc, c) => acc + c.duration, 0)

    // Build Shotstack timeline tracks
    let timelinePos = 0
    const videoClips = built.map(clip => {
      const entry = {
        asset: {
          type: 'video',
          src: `https://stream.mux.com/${clip.item.mux_playback_id}/capped-1080p.mp4`,
          trim: clip.start,          // seek into source at trimStart
          volume: clip.muted ? 0 : 1,
        },
        start: timelinePos,
        length: clip.duration,
        fit: 'crop',
        scale: 1,
      }
      timelinePos += clip.duration
      return entry
    })

    const tracks: any[] = [{ clips: videoClips }]

    if (voiceoverUrl) {
      tracks.push({
        clips: [{
          asset: { type: 'audio', src: voiceoverUrl, volume: 1 },
          start: 0,
          length: totalDuration,
        }]
      })
    }

    if (musicUrl) {
      tracks.push({
        clips: [{
          asset: { type: 'audio', src: musicUrl, volume: voiceoverUrl ? 0.08 : 0.3 },
          start: 0,
          length: totalDuration,
        }]
      })
    }

    // Aspect ratio passthrough (9:16 default for vertical ads).
    // Use explicit `size` so we get full 1080p — `resolution` and `size`
    // can't coexist in Shotstack output config.
    const validRatios = ['9:16', '16:9', '1:1', '4:5']
    const ar = validRatios.includes(aspectRatio) ? aspectRatio : '9:16'
    const SIZE_FOR: Record<string, { width: number; height: number }> = {
      '9:16': { width: 1080, height: 1920 },
      '1:1':  { width: 1080, height: 1080 },
      '4:5':  { width: 1080, height: 1350 },
      '16:9': { width: 1920, height: 1080 },
    }
    const size = SIZE_FOR[ar]

    const payload = {
      timeline: { tracks },
      output: {
        format: 'mp4',
        size,
        fps: 30,
        quality: 'high',
      },
    }

    console.log(`[export] submitting to ${SHOTSTACK_BASE}/render: ${built.length} clips, total ${totalDuration.toFixed(1)}s, ${ar}`)

    const renderRes = await fetch(`${SHOTSTACK_BASE}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SHOTSTACK_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    const rawBody = await renderRes.text()
    let renderData: any
    try { renderData = JSON.parse(rawBody) } catch { renderData = { raw: rawBody } }

    if (!renderRes.ok || !renderData.response?.id) {
      console.error('[export] Shotstack submit failed:', renderRes.status, renderData)
      const hint = renderRes.status === 403 || renderRes.status === 401
        ? ` — check SHOTSTACK_API_KEY matches SHOTSTACK_ENV (${SHOTSTACK_ENV}). URL used: ${SHOTSTACK_BASE}/render`
        : ''
      return NextResponse.json({
        error: (renderData.response?.message || renderData.message || `Shotstack error ${renderRes.status}`) + hint,
        status: renderRes.status,
        url: `${SHOTSTACK_BASE}/render`,
        details: renderData,
      }, { status: 500 })
    }

    const renderId = renderData.response.id
    console.log(`[export] render queued: ${renderId}`)

    // Poll for completion (max ~55 seconds to stay inside Vercel maxDuration)
    const start = Date.now()
    while (Date.now() - start < 55000) {
      await new Promise(r => setTimeout(r, 3000))
      const statusRes = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
        headers: { 'x-api-key': SHOTSTACK_API_KEY },
      })
      const statusData = await statusRes.json()
      const status = statusData.response?.status
      if (status === 'done') {
        return NextResponse.json({ renderId, url: statusData.response.url })
      }
      if (status === 'failed') {
        console.error('[export] render failed:', statusData.response)
        return NextResponse.json({
          error: statusData.response?.error || 'Render failed on Shotstack',
          details: statusData.response,
        }, { status: 500 })
      }
    }

    // Hit the timeout — client will continue polling
    return NextResponse.json({ renderId, polling: true })

  } catch (e: any) {
    console.error('[export] unhandled error:', e)
    return NextResponse.json({ error: e.message || 'Unknown export error' }, { status: 500 })
  }
}
