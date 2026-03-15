import { NextRequest, NextResponse } from 'next/server'
import Mux from '@mux/mux-node'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID!,
    tokenSecret: process.env.MUX_TOKEN_SECRET!,
  })
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const body = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => { headers[key] = value })

  try {
    mux.webhooks.verifySignature(body, headers, process.env.MUX_WEBHOOK_SECRET!)
  } catch {
    console.log('Webhook signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  const supabase = createServiceClient()

  if (event.type === 'video.asset.errored') {
    const itemId = event.data?.meta?.item_id
    if (itemId) {
      await supabase.from('items').update({ mux_status: 'errored' }).eq('id', itemId)
    }
    return NextResponse.json({ ok: true })
  }

  if (event.type !== 'video.asset.ready') {
    return NextResponse.json({ ok: true })
  }

  const asset = event.data
  const itemId = asset.passthrough
  if (!itemId) return NextResponse.json({ ok: true })

 const playbackId = asset.playback_ids?.[0]?.id
  const duration = asset.duration || 30

  // Auto-transcribe using Deepgram
  let autoTranscript = ''
  if (playbackId && process.env.DEEPGRAM_API_KEY) {
    try {
      // Download the MP4 from Mux first, then send as binary to Deepgram
      const mp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`
      // MP4 rendition may still be preparing — retry up to 5 times with 30s delays
      let audioFetch: Response | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const tryFetch = await fetch(mp4Url)
        if (tryFetch.ok) { audioFetch = tryFetch; break }
        console.log(`MP4 not ready yet (attempt ${attempt + 1}/5), waiting 30s…`)
        await new Promise(r => setTimeout(r, 30000))
      }
      if (audioFetch) {
        const audioBuffer = await audioFetch.arrayBuffer()
        const tRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'video/mp4',
            'Content-Length': audioBuffer.byteLength.toString(),
          },
          body: audioBuffer,
        })
        if (tRes.ok) {
          const tData = await tRes.json()
          autoTranscript = tData.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
          console.log('Deepgram transcript length:', autoTranscript.length)
        } else {
          const errText = await tRes.text()
          console.log('Deepgram error:', tRes.status, errText.substring(0,200))
        }
      } else {
        console.log('MP4 not available after 5 attempts, skipping transcription')
      }
    } catch (e:any) {
      console.log('Transcription failed:', e.message)
    }
  }

  const { data: item } = await supabase
    .from('items')
    .update({
      mux_asset_id: asset.id,
      mux_playback_id: playbackId,
      mux_status: 'analysing',
      duration_seconds: duration,
      ...(autoTranscript ? { transcript: autoTranscript } : {}),
    })
    .eq('id', itemId)
    .select()
    .single()

  if (!item) return NextResponse.json({ ok: true })

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1400,
      messages: [{
        role: 'user',
        content: `You are a video content strategist. Return ONLY valid JSON, no markdown.
Title: ${item.title}
Duration: ${duration}s
Description: ${item.description || 'not provided'}
Transcript: ${item.transcript || autoTranscript || 'not provided'}
Creator: ${item.creator || 'unknown'}

Return exactly this JSON shape:
{"content_type":"UGC|Founder Clip|Tutorial|Behind the Scenes|High Production|Testimonial|Product Demo|Other","confidence":"High|Medium|Low","summary":"2-3 sentences","tone":"string","topics":["string"],"scene_tags":["string"],"hook":"string or null","key_quotes":["string"],"ad_potential":"High|Medium|Low","ad_notes":"string","missing_info":"string or null","clip_segments":[{"label":"HOOK|PROBLEM|AGITATE|SOLUTION|SOCIAL PROOF|CTA|BODY","start_seconds":0,"end_seconds":5,"description":"exactly what is said and shown in this segment","scene_tags":["specific tags for this segment"],"use_case":"how this clip would be used in an ad e.g. hook opener, product demo, testimonial close"}]}

clip_segments rules:
- Create 3-8 segments covering the FULL ${duration}s video with no gaps
- Each segment MUST be 2-8 seconds long
- Label each segment with its direct response ad role: HOOK, PROBLEM, AGITATE, SOLUTION, SOCIAL PROOF, CTA, or BODY
- description must quote exact words spoken if transcript available
- scene_tags must be specific and searchable e.g. "product close-up", "before skin", "smiling creator", not generic
- use_case must explain specifically how this clip serves a direct response ad`
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())

    const validSegments = (analysis.clip_segments || []).filter(
      (s: any) => typeof s.start_seconds === 'number' &&
                  typeof s.end_seconds === 'number' &&
                  (s.end_seconds - s.start_seconds) >= 1
    )

    const clipInserts = validSegments.map((seg: any) => ({
      type: 'clip',
      parent_id: itemId,
      title: `${item.title} — ${seg.label}`,
      creator: item.creator,
      creator_age: item.creator_age,
      creator_gender: item.creator_gender,
      mux_playback_id: playbackId,
      mux_status: 'ready',
      start_seconds: seg.start_seconds,
      end_seconds: seg.end_seconds,
      thumbnail_time: seg.start_seconds + (seg.end_seconds - seg.start_seconds) / 2,
      duration_seconds: seg.end_seconds - seg.start_seconds,
      description: seg.description,
      analysis: {
        content_type: analysis.content_type,
        summary: seg.description,
        scene_tags: [...(seg.scene_tags || []), ...(analysis.scene_tags || []).slice(0,3)],
        use_case: seg.use_case,
        ad_potential: analysis.ad_potential,
        tone: analysis.tone,
        hook: seg.label === 'HOOK' ? analysis.hook : null,
        key_quotes: (analysis.key_quotes || []).filter((q:string) => {
          const segStart = seg.start_seconds
          const segEnd = seg.end_seconds
          const transcript = autoTranscript || item.transcript || ''
          return transcript.toLowerCase().includes(q.toLowerCase().substring(0,20))
        }),
        label: seg.label,
        parent_title: item.title,
        creator_context: item.creator ? `${item.creator}${item.creator_age ? ', '+item.creator_age : ''}` : null,
      },
    }))

    const { data: clips } = await supabase.from('items').insert(clipInserts).select()
    const clipIds = (clips || []).map((c: any) => c.id)

    await supabase.from('items').update({
      analysis,
      clip_ids: clipIds,
      mux_status: 'ready',
    }).eq('id', itemId)


  } catch (err: any) {
    console.error('Claude analysis failed:', err.message)
    await supabase.from('items').update({ mux_status: 'ready' }).eq('id', itemId)
  }

  return NextResponse.json({ ok: true })
}