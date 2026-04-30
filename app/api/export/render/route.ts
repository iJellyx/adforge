import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
// Mirror /api/export so both endpoints use the same URL format.
// SHOTSTACK_BASE_URL overrides; otherwise default to api.shotstack.io/{SHOTSTACK_ENV}.
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'
const SHOTSTACK_BASE = process.env.SHOTSTACK_BASE_URL || `https://api.shotstack.io/${SHOTSTACK_ENV}`

// ── Caption helpers ────────────────────────────────────────────────────────

type CaptionStyle = 'word' | 'line' | 'karaoke'

interface CaptionSettings {
  enabled: boolean
  style: CaptionStyle
  accentColor: string
  fontSize: number
}

/**
 * Build caption timeline using Deepgram word-level timestamps when available,
 * falling back to estimated timing from clip durations.
 *
 * Each section may have `word_timestamps: { word, start, end }[]` from Deepgram.
 * These are section-relative (start=0 is the beginning of that section's voiceover).
 * We add the section's timeline offset to get absolute positions on the Shotstack timeline.
 */
function buildCaptionTimeline(
  sections: any[],
  style: CaptionStyle,
  sectionTimings: { start: number; duration: number }[]
): { text: string; start: number; duration: number }[] {
  const result: { text: string; start: number; duration: number }[] = []

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]
    const wordTimestamps: { word: string; start: number; end: number }[] = section.word_timestamps || []
    const hasTimestamps = wordTimestamps.length > 0

    const words = hasTimestamps
      ? wordTimestamps.map(w => w.word)
      : (section.spokenWords || '').trim().split(/\s+/).filter(Boolean)
    if (!words.length) continue

    const timing = sectionTimings[si]
    if (!timing) continue

    const sectionStart = timing.start
    const sectionDur = timing.duration

    if (style === 'line') {
      result.push({ text: words.join(' '), start: sectionStart, duration: sectionDur })
    } else if (hasTimestamps) {
      // Real word timestamps — groups of 2 words with precise timing
      for (let i = 0; i < wordTimestamps.length; i += 2) {
        const group = wordTimestamps.slice(i, i + 2)
        const text = group.map(w => w.word).join(' ')
        const chunkStart = sectionStart + group[0].start
        const chunkEnd = sectionStart + group[group.length - 1].end
        result.push({
          text,
          start: chunkStart,
          duration: Math.max(0.15, chunkEnd - chunkStart),
        })
      }
    } else {
      // Fallback: evenly distributed timing
      const groups: string[][] = []
      for (let i = 0; i < words.length; i += 2) {
        groups.push(words.slice(i, i + 2))
      }
      const chunkDur = sectionDur / groups.length
      groups.forEach((g, i) => {
        result.push({
          text: g.join(' '),
          start: sectionStart + i * chunkDur,
          duration: chunkDur,
        })
      })
    }
  }

  return result
}

/**
 * Wrap a hex colour in Shotstack's HTML font colour tag.
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

/**
 * Build video clips on the Shotstack timeline.
 *
 * Smart clip chaining: when a section's assigned clips are shorter than the
 * target duration (voiceover length), instead of scaling/slow-mo, we chain
 * additional b-roll clips from the library to fill the gap naturally.
 *
 * Priority: manual targetDuration > voiceover timing > natural clip length.
 */
function buildVideoClips(
  sections: any[],
  items: any[],
  hasVoiceover: boolean,
  allLibraryItems?: any[]
) {
  const clips: any[] = []
  let timelinePos = 0
  const sectionTimings: { start: number; duration: number }[] = []
  const usedClipIds = new Set<string>()

  // Track which clip IDs are already assigned to sections
  for (const section of sections) {
    const segs = section.clipSegments?.length
      ? section.clipSegments
      : section.selectedClipId
      ? [{ clipId: section.selectedClipId }]
      : []
    for (const seg of segs) {
      if (seg.clipId) usedClipIds.add(seg.clipId)
    }
  }

  // Build pool of available b-roll clips for gap filling
  const brollPool = (allLibraryItems || items).filter((item: any) => {
    if (!item.mux_playback_id) return false
    if (usedClipIds.has(item.id)) return false
    // Prefer items flagged as b-roll, or clips (sub-items)
    const analysis = item.analysis || {}
    return analysis.is_broll === true || item.type === 'Clip' || item.parent_id
  })

  // Fallback: any unused item with a playback ID
  const anyUnusedPool = (allLibraryItems || items).filter((item: any) =>
    item.mux_playback_id && !usedClipIds.has(item.id)
  )

  let brollIdx = 0 // Round-robin through b-roll pool

  for (const section of sections) {
    const sectionStart = timelinePos
    const segs = section.clipSegments?.length
      ? section.clipSegments
      : section.selectedClipId
      ? [{ clipId: section.selectedClipId, trimStart: null, trimEnd: null }]
      : []

    // Calculate target duration: manual override > voiceover timing > natural clip length
    const manualDuration = section.targetDuration && section.targetDuration > 0
      ? section.targetDuration
      : null
    const voSectionDuration = manualDuration || (section.vo_duration && section.vo_duration > 0
      ? section.vo_duration
      : null)

    // Calculate total natural clip duration for this section
    let totalNaturalDur = 0
    const segDurations: number[] = []

    for (const seg of segs) {
      const item = items.find((i: any) => i.id === seg.clipId)
      if (!item?.mux_playback_id) { segDurations.push(0); continue }
      const trimIn = seg.trimStart ?? item.start_seconds ?? 0
      const naturalEnd = item.end_seconds ?? (item.start_seconds ?? 0) + (item.duration_seconds ?? 3)
      const trimOut = seg.trimEnd ?? naturalEnd
      const dur = Math.max(0.5, trimOut - trimIn)
      segDurations.push(dur)
      totalNaturalDur += dur
    }

    const targetDuration = voSectionDuration || totalNaturalDur || 3
    const shouldMute = section.muted || hasVoiceover

    // ── Smart clip chaining ─────────────────────────────────────────────
    // If clips are shorter than target, play them at natural speed then
    // chain additional b-roll to fill the remaining time.
    const gap = targetDuration - totalNaturalDur
    const shouldChain = gap > 0.5 && voSectionDuration && totalNaturalDur > 0

    if (shouldChain) {
      // Play existing clips at their natural duration (no scaling)
      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si]
        const item = items.find((i: any) => i.id === seg.clipId)
        if (!item?.mux_playback_id) continue

        const trimIn = seg.trimStart ?? item.start_seconds ?? 0
        const naturalEnd = item.end_seconds ?? (item.start_seconds ?? 0) + (item.duration_seconds ?? 3)
        const trimOut = seg.trimEnd ?? naturalEnd
        const naturalDur = Math.max(0.5, trimOut - trimIn)

        clips.push({
          asset: {
            type: 'video',
            src: `https://stream.mux.com/${item.mux_playback_id}/capped-1080p.mp4`,
            trim: trimIn,
            volume: shouldMute ? 0 : 1,
          },
          start: timelinePos,
          length: naturalDur,
          fit: 'crop',
          scale: 1,
        })
        timelinePos += naturalDur
      }

      // Fill the remaining gap with b-roll clips
      let remainingGap = targetDuration - (timelinePos - sectionStart)
      const pool = brollPool.length > 0 ? brollPool : anyUnusedPool
      let attempts = 0
      const maxAttempts = 10

      while (remainingGap > 0.3 && pool.length > 0 && attempts < maxAttempts) {
        const fillItem = pool[brollIdx % pool.length]
        brollIdx++
        attempts++

        const fillStart = fillItem.start_seconds ?? 0
        const fillEnd = fillItem.end_seconds ?? (fillStart + (fillItem.duration_seconds ?? 3))
        const fillNatural = Math.max(0.5, fillEnd - fillStart)
        const fillDur = Math.min(fillNatural, remainingGap)

        clips.push({
          asset: {
            type: 'video',
            src: `https://stream.mux.com/${fillItem.mux_playback_id}/capped-1080p.mp4`,
            trim: fillStart,
            volume: 0, // always mute fill clips
          },
          start: timelinePos,
          length: Math.max(0.5, fillDur),
          fit: 'crop',
          scale: 1,
        })

        timelinePos += Math.max(0.5, fillDur)
        remainingGap = targetDuration - (timelinePos - sectionStart)
      }
    } else {
      // No gap or no voiceover: use original scaling behaviour
      const scaleFactor = totalNaturalDur > 0 ? targetDuration / totalNaturalDur : 1

      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si]
        const item = items.find((i: any) => i.id === seg.clipId)
        if (!item?.mux_playback_id) continue

        const trimIn = seg.trimStart ?? item.start_seconds ?? 0
        const naturalEnd = item.end_seconds ?? (item.start_seconds ?? 0) + (item.duration_seconds ?? 3)
        const trimOut = seg.trimEnd ?? naturalEnd
        const naturalDur = Math.max(0.5, trimOut - trimIn)
        const duration = voSectionDuration ? naturalDur * scaleFactor : naturalDur

        clips.push({
          asset: {
            type: 'video',
            src: `https://stream.mux.com/${item.mux_playback_id}/capped-1080p.mp4`,
            trim: trimIn,
            volume: shouldMute ? 0 : 1,
          },
          start: timelinePos,
          length: Math.max(0.5, duration),
          fit: 'crop',
          scale: 1,
        })

        timelinePos += Math.max(0.5, duration)
      }
    }

    // If no clips were added for this section, still advance timeline
    const actualSectionDur = timelinePos - sectionStart
    if (actualSectionDur < 0.1) {
      // Empty section — add a black frame placeholder
      const placeholderDur = voSectionDuration || 3
      clips.push({
        asset: {
          type: 'title',
          text: ' ',
          style: 'minimal',
          color: '#000000',
          background: '#000000',
        },
        start: timelinePos,
        length: placeholderDur,
      })
      timelinePos += placeholderDur
    }

    sectionTimings.push({
      start: sectionStart,
      duration: timelinePos - sectionStart,
    })
  }

  return { clips, totalDuration: timelinePos, sectionTimings }
}

function buildAudioClips(
  voiceoverUrl: string | null,
  musicUrl: string | null,
  totalDuration: number
) {
  const clips: any[] = []

  if (voiceoverUrl) {
    clips.push({
      asset: { type: 'audio', src: voiceoverUrl, volume: 1 },
      start: 0,
      length: totalDuration,
    })
  }

  if (musicUrl) {
    // Music volume: lower when voiceover present, with fade in/out
    const musicVol = voiceoverUrl ? 0.12 : 0.3
    const fadeIn = Math.min(1.5, totalDuration * 0.1)
    const fadeOut = Math.min(2.5, totalDuration * 0.15)

    clips.push({
      asset: { type: 'audio', src: musicUrl, volume: musicVol },
      start: 0,
      length: totalDuration,
      transition: {
        in: 'fade',
        out: 'fade',
      },
      effect: 'fadeInFadeOut',
    })
  }

  return clips
}

function buildCaptionClips(
  sections: any[],
  captionSettings: CaptionSettings,
  sectionTimings: { start: number; duration: number }[]
) {
  if (!captionSettings?.enabled) return []

  const { style, accentColor, fontSize } = captionSettings
  const chunks = buildCaptionTimeline(sections, style, sectionTimings)

  // Map fontSize numbers to Shotstack size strings
  const sizeMap: Record<number, string> = { 18: 'small', 22: 'medium', 28: 'large', 34: 'x-large' }
  const ssSize = sizeMap[fontSize] || 'medium'

  return chunks.map((chunk) => {
    return {
      asset: {
        type: 'title',
        text: chunk.text,
        style: 'minimal',
        color: accentColor,
        size: ssSize,
        background: 'transparent',
        position: 'bottom',
      },
      start: chunk.start,
      length: chunk.duration,
      position: 'bottom',
      offset: { x: 0, y: 0.18 },
    }
  })
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
      .select('id,mux_playback_id,start_seconds,end_seconds,duration_seconds,analysis,parent_id,type')
      .in('id', allClipIds)

    if (!items?.length) {
      return NextResponse.json({ error: 'No valid clips found' }, { status: 400 })
    }

    // Fetch all library items in this workspace for b-roll chaining pool
    const { data: allLibraryItems } = await supabase
      .from('items')
      .select('id,mux_playback_id,start_seconds,end_seconds,duration_seconds,analysis,parent_id,type')
      .eq('workspace_id', ad.workspace_id)
      .not('mux_playback_id', 'is', null)
      .limit(200)

    // 3. Build tracks — video clips now return section timings for caption sync
    const { clips: videoClips, totalDuration, sectionTimings } = buildVideoClips(
      sections, items, !!ad.voiceover_url, allLibraryItems || items
    )

    if (!videoClips.length) {
      return NextResponse.json({ error: 'No Mux-ready clips to render' }, { status: 400 })
    }

    // Validate: check for gaps between clips
    const sortedClips = [...videoClips].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sortedClips.length; i++) {
      const prevEnd = sortedClips[i - 1].start + sortedClips[i - 1].length
      const gap = sortedClips[i].start - prevEnd
      if (gap > 0.1) {
        console.warn(`Gap detected at ${prevEnd.toFixed(2)}s — ${gap.toFixed(2)}s gap before next clip`)
      }
    }

    const audioClips = buildAudioClips(
      ad.voiceover_url || null,
      ad.music_url || null,
      totalDuration
    )

    // Captions now use section timings derived from actual video/voiceover durations
    const captionSettings: CaptionSettings | null = ad.metadata?.captionSettings || null
    const captionClips = captionSettings?.enabled
      ? buildCaptionClips(sections, captionSettings, sectionTimings)
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

    // Output size — full 1080p across all aspect ratios.
    // NOTE: Shotstack rejects `resolution` and `size` together — pick one.
    // We pick `size` so we get explicit 1080p dimensions.
    const aspectRatio = ad.metadata?.aspectRatio || '9:16'
    const SIZE_FOR: Record<string, { width: number; height: number }> = {
      '9:16': { width: 1080, height: 1920 },
      '1:1':  { width: 1080, height: 1080 },
      '4:5':  { width: 1080, height: 1350 },
      '16:9': { width: 1920, height: 1080 },
    }
    const outputSize = SIZE_FOR[aspectRatio] || SIZE_FOR['9:16']

    const output = {
      format: 'mp4',
      size: outputSize,
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
      console.error('Shotstack rejected render:', JSON.stringify(shotstackData))
      const errMsg =
        shotstackData?.response?.error ||
        shotstackData?.message ||
        shotstackData?.error ||
        (typeof shotstackData === 'string' ? shotstackData : JSON.stringify(shotstackData))
      await supabase
        .from('forged_ads')
        .update({ render_status: 'failed', render_error: errMsg })
        .eq('id', adId)
      return NextResponse.json({ error: errMsg, detail: shotstackData }, { status: 500 })
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
