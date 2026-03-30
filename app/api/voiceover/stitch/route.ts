import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Stitches multiple section voiceover MP3 URLs into a single continuous MP3.
 * Raw MP3 buffer concatenation (MP3 frames are independently decodable).
 * After stitching, calls Deepgram to get word-level timestamps for caption sync.
 * Returns per-section timing offsets + word timestamps for precise captions.
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
      const estimatedDuration = buf.byteLength / 16000
      durations.push(estimatedDuration)
    }

    // Concatenate all MP3 buffers into a single file
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
    const stitchedUrl = urlData.publicUrl

    // ── Deepgram word-level transcription ──────────────────────────────────
    // Call Deepgram on the stitched voiceover to get precise word timestamps.
    // These drive caption sync in both the preview and Shotstack render.
    let wordTimestamps: { word: string; start: number; end: number }[] = []

    if (process.env.DEEPGRAM_API_KEY) {
      try {
        const dgRes = await fetch(
          'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=false&words=true',
          {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: stitchedUrl }),
          }
        )

        if (dgRes.ok) {
          const dgData = await dgRes.json()
          const dgWords = dgData.results?.channels?.[0]?.alternatives?.[0]?.words || []
          wordTimestamps = dgWords.map((w: any) => ({
            word: w.punctuated_word || w.word,
            start: w.start,
            end: w.end,
          }))

          // Also refine section durations using actual Deepgram timing
          // Find the last word in each section based on cumulative offsets
          if (wordTimestamps.length > 0) {
            const lastWordEnd = wordTimestamps[wordTimestamps.length - 1].end
            // Update estimated durations with Deepgram-accurate ones
            for (let i = 0; i < sectionOffsets.length; i++) {
              const sectionStart = sectionOffsets[i]
              const sectionEnd = i < sectionOffsets.length - 1
                ? sectionOffsets[i + 1]
                : lastWordEnd

              // Find words that belong to this section
              const sectionWords = wordTimestamps.filter(
                w => w.start >= sectionStart - 0.1 && w.start < (i < sectionOffsets.length - 1 ? sectionOffsets[i + 1] - 0.1 : Infinity)
              )

              if (sectionWords.length > 0) {
                const actualEnd = sectionWords[sectionWords.length - 1].end
                durations[i] = actualEnd - sectionStart + 0.15 // small buffer
              }
            }
          }
        } else {
          console.warn('Deepgram transcription failed:', dgRes.status, await dgRes.text())
        }
      } catch (dgErr) {
        console.warn('Deepgram word timestamp extraction failed:', dgErr)
      }
    }

    return NextResponse.json({
      url: stitchedUrl,
      totalDuration: timeOffset,
      sectionOffsets,
      sectionDurations: durations,
      wordTimestamps,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
