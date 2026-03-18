import { NextRequest, NextResponse } from 'next/server'
import Mux from '@mux/mux-node'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

  // ── Step 1: Deepgram transcription ────────────────────────────────────────
  let autoTranscript = ''
  let wordTimestamps: any[] = []
  if (playbackId && process.env.DEEPGRAM_API_KEY) {
    try {
      const mp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`
      let audioFetch: Response | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const tryFetch = await fetch(mp4Url)
        if (tryFetch.ok) { audioFetch = tryFetch; break }
        console.log(`MP4 not ready yet (attempt ${attempt + 1}/5), waiting 30s…`)
        await new Promise(r => setTimeout(r, 30000))
      }
      if (audioFetch) {
        const audioBuffer = await audioFetch.arrayBuffer()
        const tRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&words=true', {
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
          wordTimestamps = tData.results?.channels?.[0]?.alternatives?.[0]?.words || []
          console.log('Deepgram transcript length:', autoTranscript.length, 'words:', wordTimestamps.length)
        }
      }
    } catch (e: any) {
      console.log('Transcription failed:', e.message)
    }
  }

  // ── Step 2: Update item with transcript ───────────────────────────────────
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

  // ── Step 3: Gemini video analysis ─────────────────────────────────────────
  let geminiAnalysis = ''
  if (playbackId && process.env.GOOGLE_AI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const mp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`
      
      // Fetch video as base64 for Gemini
      const videoRes = await fetch(mp4Url)
      if (videoRes.ok) {
        const videoBuffer = await videoRes.arrayBuffer()
        const base64Video = Buffer.from(videoBuffer).toString('base64')
        
        const geminiPrompt = `You are an expert direct response video analyst for DTC brands. Watch this video carefully and provide a detailed analysis.

Video duration: ${duration} seconds
Title: ${item.title}

Analyse the video and return a JSON object with these fields:
{
  "visual_summary": "detailed description of exactly what is shown visually throughout the video",
  "scene_changes": [{"time_seconds": 0, "description": "what changes at this moment visually"}],
  "visual_elements": ["specific visual elements present e.g. 'close-up of yellow teeth', 'product bottle being held', 'before/after split screen'"],
  "creator_description": "describe the person on screen if any - age range, gender, setting",
  "product_shots": ["timestamps and descriptions of any product appearances"],
  "emotional_moments": ["timestamps of high-emotion or reaction moments"],
  "scene_segments": [
    {
      "start_seconds": 0,
      "end_seconds": 5,
      "visual_description": "exactly what is shown on screen",
      "visual_tags": ["specific searchable visual tags"],
      "scene_type": "talking_head|product_shot|before_after|reaction|demonstration|lifestyle|text_overlay",
      "ad_value": "High|Medium|Low",
      "cut_reason": "why this is a natural cut point"
    }
  ]
}

Be extremely specific about visual content. If you see teeth, describe their colour. If you see a product, name what it looks like. Do not generalise.`

        const result = await model.generateContent([
          { inlineData: { mimeType: 'video/mp4', data: base64Video } },
          geminiPrompt
        ])
        geminiAnalysis = result.response.text()
        console.log('Gemini analysis length:', geminiAnalysis.length)
      }
    } catch (e: any) {
      console.log('Gemini analysis failed:', e.message)
    }
  }

  // ── Step 4: Claude combines transcript + visual analysis ──────────────────
  try {
    let geminiData: any = {}
    try {
      const cleanGemini = geminiAnalysis.replace(/```json|```/g, '').trim()
      if (cleanGemini) geminiData = JSON.parse(cleanGemini)
    } catch (e) {
      console.log('Could not parse Gemini JSON, using raw text')
    }

    const wordTimingContext = wordTimestamps.length > 0
      ? `\nWORD-LEVEL TIMESTAMPS:\n${wordTimestamps.slice(0, 100).map((w: any) => `${w.start.toFixed(1)}s: "${w.word}"`).join(', ')}`
      : ''

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an expert direct response video editor for DTC brands. Combine the transcript, word timestamps, and visual analysis to create highly accurate clip segments.

TITLE: ${item.title}
DURATION: ${duration}s
CREATOR: ${item.creator || 'unknown'}
TRANSCRIPT: ${item.transcript || autoTranscript || 'not provided'}
${wordTimingContext}

GEMINI VISUAL ANALYSIS:
${JSON.stringify(geminiData, null, 2) || geminiAnalysis || 'not available'}

Return ONLY valid JSON:
{
  "content_type": "UGC|Founder Clip|Tutorial|Behind the Scenes|High Production|Testimonial|Product Demo|Talking Head|Other",
  "confidence": "High|Medium|Low",
  "summary": "2-3 sentences combining what was said AND shown",
  "tone": "emotional tone description",
  "topics": ["specific topics from transcript AND visuals"],
  "scene_tags": ["specific visual tags from Gemini analysis"],
  "hook": "most attention-grabbing moment or line",
  "key_quotes": ["powerful direct quotes from transcript"],
  "ad_potential": "High|Medium|Low",
  "ad_notes": "specific advice on ad usage based on both transcript and visuals",
  "clip_segments": [
    {
      "label": "HOOK|PROBLEM|AGITATE|SOLUTION|SOCIAL PROOF|CTA|BODY|PRODUCT|REACTION|BEFORE|AFTER|TESTIMONIAL",
      "clip_role": "hook|problem|solution|social_proof|cta|b_roll|product_demo|reaction|before_after|testimonial",
      "start_seconds": 0,
      "end_seconds": 4,
      "description": "combine exact transcript words with visual description",
      "scene_tags": ["specific visual tags for THIS segment from Gemini"],
      "use_case": "specific ad use case",
      "quality_score": "High|Medium|Low",
      "avoid_reason": null
    }
  ]
}

CRITICAL RULES:
1. Use WORD TIMESTAMPS to cut at exact sentence endings — never mid-word or mid-sentence
2. Use Gemini scene_segments to cut at visual scene changes
3. Minimum 1.5s per clip, maximum 8s
4. scene_tags must come from actual Gemini visual analysis — no guessing
5. Mark quality_score Low if: mid-sentence cut, visually unclear, duplicate of adjacent clip
6. Prefer cuts where BOTH a sentence ends AND a visual scene changes
7. Create up to 12 segments for longer videos — more is better than fewer if quality is High`
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())

    const validSegments = (analysis.clip_segments || []).filter(
      (s: any) => typeof s.start_seconds === 'number' &&
                  typeof s.end_seconds === 'number' &&
                  (s.end_seconds - s.start_seconds) >= 1
    )

    const goodSegments = validSegments.filter((seg: any) => seg.quality_score !== 'Low')
    console.log(`Created ${goodSegments.length} good clips from ${validSegments.length} total segments`)

    const clipInserts = goodSegments.map((seg: any) => ({
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
      clip_role: seg.clip_role || null,
      analysis: {
        content_type: analysis.content_type,
        summary: seg.description,
        scene_tags: seg.scene_tags || [],
        use_case: seg.use_case,
        ad_potential: seg.quality_score === 'High' ? 'High' : analysis.ad_potential,
        tone: analysis.tone,
        hook: seg.label === 'HOOK' ? analysis.hook : null,
        key_quotes: (analysis.key_quotes || []).filter((q: string) =>
          (autoTranscript || item.transcript || '').toLowerCase().includes(q.toLowerCase().substring(0, 20))
        ),
        label: seg.label,
        clip_role: seg.clip_role || null,
        quality_score: seg.quality_score || 'Medium',
        parent_title: item.title,
        creator_context: item.creator ? `${item.creator}${item.creator_age ? ', ' + item.creator_age : ''}` : null,
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
    console.error('Analysis failed:', err.message)
    await supabase.from('items').update({ mux_status: 'ready' }).eq('id', itemId)
  }

  return NextResponse.json({ ok: true })
}