import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'
const SHOTSTACK_BASE = `https://api.shotstack.io/${SHOTSTACK_ENV}`

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { sections, itemIds, voiceoverUrl, musicUrl } = await req.json()
    const supabase = createServiceClient()

    // Fetch items from DB
    const { data: items } = await supabase
      .from('items')
      .select('id, mux_playback_id, start_seconds, end_seconds, duration_seconds, title')
      .in('id', itemIds)

    if (!items || !items.length) {
      return NextResponse.json({ error: 'No items found' }, { status: 400 })
    }

    // Build ordered clips from sections
    const clips = sections
      .map((s: any) => {
        const item = items.find((i: any) => i.id === s.selectedClipId)
        if (!item?.mux_playback_id) return null
        const start = item.start_seconds || 0
        const end = item.end_seconds || item.duration_seconds || 5
        const duration = Math.max(0.5, end - start)
        return { item, start, duration, label: s.type || s.label || '' }
      })
      .filter(Boolean)

    if (!clips.length) {
      return NextResponse.json({ error: 'No clips assigned' }, { status: 400 })
    }

    // Build Shotstack timeline tracks
    const videoClips = clips.map((clip: any, i: number) => ({
      asset: {
        type: 'video',
        src: `https://stream.mux.com/${clip.item.mux_playback_id}/capped-1080p.mp4`,
        trim: clip.start,
        volume: clip.muted ? 0 : 1,
      },
      start: clips.slice(0, i).reduce((acc: number, c: any) => acc + c.duration, 0),
      length: clip.duration,
    }))

    const tracks: any[] = [{ clips: videoClips }]

    // Add voiceover track
    if (voiceoverUrl) {
      tracks.push({
        clips: [{
          asset: { type: 'audio', src: voiceoverUrl, volume: 1 },
          start: 0,
          length: clips.reduce((acc: number, c: any) => acc + c.duration, 0),
        }]
      })
    }

    // Add music track at low volume
    if (musicUrl) {
      tracks.push({
        clips: [{
          asset: { type: 'audio', src: musicUrl, volume: voiceoverUrl ? 0.08 : 0.3 },
          start: 0,
          length: clips.reduce((acc: number, c: any) => acc + c.duration, 0),
        }]
      })
    }

    const totalDuration = clips.reduce((acc: number, c: any) => acc + c.duration, 0)

    // Build Shotstack payload
    const payload = {
      timeline: {
        tracks,
      },
      output: {
        format: 'mp4',
        resolution: 'hd',
        aspectRatio: '9:16',
        fps: 30,
      },
    }

    // Submit render job to Shotstack
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
      console.error('Shotstack submit error:', renderData)
      return NextResponse.json({ error: renderData.response?.message || 'Shotstack submission failed' }, { status: 500 })
    }

    const renderId = renderData.response.id

    // Poll for completion (max 55 seconds)
    const start = Date.now()
    while (Date.now() - start < 55000) {
      await new Promise(r => setTimeout(r, 3000))

      const statusRes = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
        headers: { 'x-api-key': SHOTSTACK_API_KEY },
      })
      const statusData = await statusRes.json()
      const status = statusData.response?.status

      if (status === 'done') {
        const url = statusData.response.url
        return NextResponse.json({ renderId, url })
      }

      if (status === 'failed') {
        return NextResponse.json({ error: 'Render failed on Shotstack' }, { status: 500 })
      }
    }

    // If we hit the timeout, return the render ID so client can poll
    return NextResponse.json({ renderId, polling: true })

  } catch (e: any) {
    console.error('Export error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}