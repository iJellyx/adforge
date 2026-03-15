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
      const audioUrl = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`
      const tRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioUrl }),
      })
      if (tRes.ok) {
        const tData = await tRes.json()
        autoTranscript = tData.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
      }
    } catch (e) {
      console.log('Transcription failed, continuing without transcript')
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
{"content_type":"UGC|Founder Clip|Tutorial|Behind the Scenes|High Production|Testimonial|Product Demo|Other","confidence":"High|Medium|Low","summary":"2-3 sentences","tone":"string","topics":["string"],"scene_tags":["string"],"hook":"string or null","key_quotes":["string"],"ad_potential":"High|Medium|Low","ad_notes":"string","missing_info":"string or null","clip_segments":[{"label":"string","start_seconds":0,"end_seconds":5,"description":"string","scene_tags":["string"],"use_case":"string"}]}

clip_segments: create 3-8 segments, each MUST be 2-7 seconds long, together covering the full ${duration}s video.`
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
      analysis: {
        content_type: analysis.content_type,
        summary: seg.description,
        scene_tags: seg.scene_tags || [],
        use_case: seg.use_case,
        ad_potential: analysis.ad_potential,
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