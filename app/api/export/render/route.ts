import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_BASE = 'https://api.shotstack.io/v1'

// ── Caption helpers ────────────────────────────────────────────────────────

type CaptionStyle = 'word' | 'line' | 'karaoke'

interface CaptionSettings {
  enabled: boolean
  style: CaptionStyle
  accentColor: string
  fontSize: number
}

interface CaptionChunk {
  text: string
  start: number    // seconds from beginning of section
  duration: number // seconds
}

/**
 * Split spoken words into timed caption chunks matching the preview logic.
 * Each section's captions are offset by sectionStart within the overall timeline.
 */
function buildCaptionTimeline(
  sections: any[],
  style: CaptionStyle
): { text: string; start: number; duration: number }[] {
  const result: { text: string; start: number; duration: number }[] = []

  let cursor = 0

  for (const section of sections) {
    const words = (section.spokenWords || '').trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      // advance cursor by estimated duration even if no words
      const segs = section.clipSegments?.length ? section.clipSegments : [{ clipId: section.selectedClipId }]
      const dur = segs.reduce((acc: number, seg: any) => {
        const d = (seg.trimEnd ?? 0) - (seg.trimStart ?? 0)
        return acc + (d > 0 ? d : 3)
      }, 0)
      cursor += dur || 3
      continue
    }

    // Estimate section duration from clip segments
    const segs = section.clipSegments?.length
      ? section.clipSegments
      : [{ clipId: section.selectedClipId, trimStart: 0, trimEnd: null }]

    const sectionDur = segs.reduce((acc: number, seg: any) => {
      const d = (seg.trimEnd ?? 0) - (seg.trimStart ?? 0)
      return acc + (d > 0 ? d : 3)
    }, 0) || 3

    if (style === 'line') {
      result.push({ text: words.join(' '), start: cursor, duration: sectionDur })
    } else {
      // word-by-word or karaoke: groups of 2 words
      const groups: string[][] = []
      for (let i = 0; i < words.length; i += 2) {
        groups.push(words.slice(i, i + 2))
      }
      const chunkDur = sectionDur / groups.length
      groups.forEach((g, i) => {
        result.push({
          text: g.join(' '),
          start: cursor + i * chunkDur,
          duration: chunkDur,
        })
      })
    }

    cursor += sectionDur
  }

  return result
}

/**
 * Wrap a hex colour in Shotstack's HTML font colour tag.
 * Also bolds the text to match the preview style.
 */
function captionHtml(text: string, accentColor: string): string {
  const words = text.split(' ')
  const styled = words.map((word, idx) => {
    const clean = word.replace(/[^a-zA-Z0-9%$£€]/g, '')
    const isKey =
      /^\d/.test(clean) ||
      /%|€|\$|£/.test(word) ||
      (clean === clean.toUpperCase() && clean.length > 1) ||
      (idx + 1) % 4 === 0

    const colour = isKey ? accentColor : '#ffffff'
    return `<font color="${colour}"><b>${word}</b></font>`
  })
  return styled.join(' ')
}

// ── Shotstack timeline builders ────────────────────────────────────────────

function buildVideoClips(sections: any[], items: any[]) {
  const clips: any[] = []
  let timelinePos = 0

  for (const section of sections) {
    const segs = section.clipSegments?.length
      ? section.clipSegments
      : section.selectedClipId
      ? [{ clipId: section.selectedClipId, trimStart: null, trimEnd: null }]
      : []

    for (const seg of segs) {
      const item = items.find((i: any) => i.id === seg.clipId)
      if (!item?.mux_playback_id) continue

      const trimIn = seg.trimStart ?? item.start_seconds ?? 0
      const naturalEnd = item.end_seconds ?? (item.start_seconds ?? 0) + (item.duration_seconds ?? 3)
      const trimOut = seg.trimEnd ?? naturalEnd
      const duration = Math.max(0.5, trimOut - trimIn)

      clips.push({
        asset: {
          type: 'video',
          src: `https://stream.mux.com/${item.mux_playback_id}/capped-1080p.mp4`,
          trim: trimIn,
          volume: section.muted ? 0 : 1,
        },
        start: timelinePos,
        length: duration,
        fit: 'crop',
        scale: 1,
      })

      timelinePos += duration
    }
  }

  return { clips, totalDuration: timelinePos }
}

function buildAudioClips(
  voiceoverUrl: string | null,
  musicUrl: string | null,
  totalDuration: number
) {
  const clips: any[] = []

  if (voiceoverUrl) {
    clips.push({
      asset: { type: 'audio', src: voiceoverUrl },
      start: 0,
      length: totalDuration,
      volume: 1,
    })
  }

  if (musicUrl) {
    clips.push({
      asset: { type: 'audio', src: musicUrl },
      start: 0,
      length: totalDuration,
      volume: 0.2, // music at 20% — same as preview default
    })
  }

  return clips
}

function buildCaptionClips(
  sections: any[],
  captionSettings: CaptionSettings,
  videoWidth = 1080,
  videoHeight = 1920
) {
  if (!captionSettings?.enabled) return []

  const { style, accentColor, fontSize } = captionSettings
  const chunks = buildCaptionTimeline(sections, style)

  // Lower third position: 18% from bottom, safe above Meta CTA zone
  const yPercent = 18
  const yPx = Math.round(videoHeight * (yPercent / 100))

  return chunks.map((chunk) => ({
    asset: {
      type: 'html',
      html: `<p style="font-family:Impact,Arial Black,sans-serif;font-size:${fontSize * 2}px;font-weight:900;text-align:center;line-height:1.2;-webkit-text-stroke:2px black;paint-order:stroke fill;max-width:${videoWidth * 0.88}px;margin:0 auto">${captionHtml(chunk.text, accentColor)}</p>`,
      width: videoWidth,
      height: Math.round(videoHeight * 0.15),
      background: 'transparent',
    },
    type: 'overlay',
    start: chunk.start,
    length: chunk.duration,
    position: 'bottom',
    offset: { x: 0, y: yPercent / 100 },
  }))
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()

  try {
    const { adId } = await req.json()
    if (!adId) return NextResponse.json({ error: 'adId required' }, { status: 400 })

    // 1. Fetch the forged ad
    const { data: ad, error: adErr } = await supabase
      .from('forged_ads')
      .select('*')
      .eq('id', adId)
      .single()

    if (adErr || !ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
    }

    const sections: any[] = ad.sections || []
    if (!sections.length) {
      return NextResponse.json({ error: 'No sections in ad' }, { status: 400 })
    }

    // 2. Fetch all referenced items
    const allClipIds = sections.flatMap((s: any) => {
      const segs = s.clipSegments?.length ? s.clipSegments : [{ clipId: s.selectedClipId }]
      return segs.map((seg: any) => seg.clipId).filter(Boolean)
    })

    const { data: items } = await supabase
      .from('items')
      .select('id,mux_playback_id,start_seconds,end_seconds,duration_seconds,analysis')
      .in('id', allClipIds)

    if (!items?.length) {
      return NextResponse.json({ error: 'No valid clips found' }, { status: 400 })
    }

    // 3. Build tracks
    const { clips: videoClips, totalDuration } = buildVideoClips(sections, items)

    if (!videoClips.length) {
      return NextResponse.json({ error: 'No Mux-ready clips to render' }, { status: 400 })
    }

    const audioClips = buildAudioClips(
      ad.voiceover_url || null,
      ad.music_url || null,
      totalDuration
    )

    const captionSettings: CaptionSettings | null = ad.metadata?.captionSettings || null
    const captionClips = captionSettings?.enabled
      ? buildCaptionClips(sections, captionSettings)
      : []

    // 4. Assemble Shotstack timeline
    const tracks: any[] = [{ clips: videoClips }]

    if (captionClips.length) {
      tracks.unshift({ clips: captionClips }) // captions on top
    }

    if (audioClips.length) {
      tracks.push({ clips: audioClips })
    }

    const timeline = {
      background: '#000000',
      tracks,
    }

    const output = {
      format: 'mp4',
      resolution: 'hd',        // 1080×1920 portrait
      aspectRatio: '9:16',
      fps: 30,
      quality: 'high',
    }

    // 5. Submit to Shotstack
    const shotstackRes = await fetch(`${SHOTSTACK_BASE}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SHOTSTACK_API_KEY,
      },
      body: JSON.stringify({ timeline, output }),
    })

    const shotstackData = await shotstackRes.json()

    if (!shotstackRes.ok) {
      const errMsg = shotstackData?.response?.error || shotstackData?.message || 'Shotstack error'
      // Store error on the ad
      await supabase
        .from('forged_ads')
        .update({ render_status: 'failed', render_error: errMsg })
        .eq('id', adId)
      return NextResponse.json({ error: errMsg }, { status: 500 })
    }

    const renderId = shotstackData?.response?.id

    // 6. Store render_id and status on the ad
    await supabase
      .from('forged_ads')
      .update({
        render_id: renderId,
        render_status: 'rendering',
        render_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adId)

    return NextResponse.json({ renderId, status: 'rendering' })
  } catch (err: any) {
    console.error('Render route error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
