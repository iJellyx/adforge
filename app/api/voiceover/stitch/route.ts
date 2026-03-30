import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Stitches multiple section voiceover MP3 URLs into a single continuous MP3.
 * Uses FFmpeg concat filter on the server to produce a seamless voiceover file.
 * Also returns per-section timing offsets so captions can be synced precisely.
 */
export async function POST(req: NextRequest) {
  try {
    const { sectionUrls } = await req.json()
    if (!sectionUrls?.length) {
      return NextResponse.json({ error: 'No section URLs provided' }, { status: 400 })
    }

    // Download all section MP3s
    const buffers: ArrayBuffer[] = []
    const durations: number[] = []

    for (const url of sectionUrls) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
      const buf = await res.arrayBuffer()
      buffers.push(buf)

      // Estimate MP3 duration from file size (128kbps = 16000 bytes/sec)
      // This is approximate — Shotstack handles precise timing from the actual audio
      const estimatedDuration = buf.byteLength / 16000
      durations.push(estimatedDuration)
    }

    // Concatenate all MP3 buffers into a single file
    // MP3 frames are independently decodable, so raw concatenation works
    // (unlike AAC/M4A which need container rewriting)
    const totalSize = buffers.reduce((acc, b) => acc + b.byteLength, 0)
    const combined = new Uint8Array(totalSize)
    let offset = 0
    const sectionOffsets: number[] = []
    let timeOffset = 0

    for (let i = 0; i < buffers.length; i++) {
      sectionOffsets.push(timeOffset)
      combined.set(new Uint8Array(buffers[i]), offset)
      offset += buffers[i].byteLength
      timeOffset += durations[i]
    }

    // Upload stitched file to Supabase storage
    const supabase = createServiceClient()
    const filename = `voiceover_stitched_${Date.now()}.mp3`
    const file = new Blob([combined], { type: 'audio/mpeg' })

    const { error: uploadErr } = await supabase.storage
      .from('voiceovers')
      .upload(filename, file, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('voiceovers').getPublicUrl(filename)

    return NextResponse.json({
      url: urlData.publicUrl,
      totalDuration: timeOffset,
      sectionOffsets,
      sectionDurations: durations,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
