import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'
const SHOTSTACK_BASE = `https://api.shotstack.io/${SHOTSTACK_ENV}`

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { adId } = await req.json()
    const supabase = createServiceClient()

    // Get the forged ad
    const { data: ad } = await supabase
      .from('forged_ads')
      .select('*')
      .eq('id', adId)
      .single()

    if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 })

    const sections = ad.sections || []
    const itemIds = sections.map((s: any) => s.selectedClipId).filter(Boolean)

    if (!itemIds.length) {
      return NextResponse.json({ error: 'No clips assigned' }, { status: 400 })
    }

    // Fetch items
    const { data: items } = await supabase
      .from('items')
      .select('id, mux_playback_id, start_seconds, end_seconds, duration_seconds')
      .in('id', itemIds)

    if (!items?.length) {
      return NextResponse.json({ error: 'No items found' }, { status: 400 })
    }

    // Build clips
    const clips = sections
      .map((s: any) => {
        const item = items.find((i: any) => i.id === s.selectedClipId)
        if (!item?.mux_playback_id) return null
        const start = item.start_seconds || 0
        const end = item.end_seconds || item.duration_seconds || 5
        const duration = Math.max(0.5, end - start)
        return { item, start, duration }
      })
      .filter(Boolean)

    if (!clips.length) {
      return NextResponse.json({ error: 'No valid clips' }, { status: 400 })
    }

    // Build Shotstack timeline
    const videoClips = clips.map((clip: any, i: number) => ({
      asset: {
        type: 'video',
        src: `https://stream.mux.com/${clip.item.mux_playback_id}/capped-1080p.mp4`,
        trim: clip.start,
        volume: 1,
      },
      start: clips.slice(0, i).reduce((acc: number, c: any) => acc + c.duration, 0),
      length: clip.duration,
    }))

    const tracks: any[] = [{ clips: videoClips }]
    const totalDuration = clips.reduce((acc: number, c: any) => acc + c.duration, 0)

    if (ad.voiceover_url) {
      tracks.push({
        clips: [{
          asset: { type: 'audio', src: ad.voiceover_url, volume: 1 },
          start: 0,
          length: totalDuration,
        }]
      })
    }

    if (ad.music_url) {
      tracks.push({
        clips: [{
          asset: { type: 'audio', src: ad.music_url, volume: 0.15 },
          start: 0,
          length: totalDuration,
        }]
      })
    }

    const payload = {
      timeline: { tracks },
      output: {
        format: 'mp4',
        resolution: 'hd',
        aspectRatio: '9:16',
        fps: 30,
      },
    }

    // Submit to Shotstack
    const renderRes = await fetch(`${SHOTSTACK_BASE}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SHOTSTACK_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    const renderData = await renderRes.json()

    if (!renderRes.ok || !renderData.response?.id) {
      await supabase.from('forged_ads').update({ render_status: 'failed' }).eq('id', adId)
      return NextResponse.json({ error: 'Shotstack submission failed' }, { status: 500 })
    }

    const renderId = renderData.response.id

    // Save render ID to DB
    await supabase.from('forged_ads').update({
      render_id: renderId,
      render_status: 'rendering',
      updated_at: new Date().toISOString(),
    }).eq('id', adId)

    return NextResponse.json({ renderId, status: 'rendering' })
  } catch (e: any) {
    console.error('Background render error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}