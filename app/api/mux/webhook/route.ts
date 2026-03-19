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

  // ── Step 2: Duplicate detection ───────────────────────────────────────────
  if (playbackId) {
    try {
      // Find existing items with similar duration (±1.5 seconds)
      const { data: candidates } = await supabase
        .from('items')
        .select('id, title, mux_playback_id, duration_seconds, transcript')
        .eq('type', 'original')
        .neq('id', itemId)
        .neq('mux_status', 'errored')
        .neq('mux_status', 'duplicate')
        .gte('duration_seconds', duration - 1.5)
        .lte('duration_seconds', duration + 1.5)

      if (candidates && candidates.length > 0) {
        console.log(`Found ${candidates.length} duration-match candidates for duplicate check`)

        // Check thumbnail similarity using Gemini for each candidate
        const newThumbUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=320`

        for (const candidate of candidates) {
          if (!candidate.mux_playback_id) continue

          const candidateThumbUrl = `https://image.mux.com/${candidate.mux_playback_id}/thumbnail.jpg?time=0&width=320`

          // Fetch both thumbnails
          const [newThumbRes, candThumbRes] = await Promise.all([
            fetch(newThumbUrl),
            fetch(candidateThumbUrl),
          ])

          if (!newThumbRes.ok || !candThumbRes.ok) continue

          const [newThumbBuf, candThumbBuf] = await Promise.all([
            newThumbRes.arrayBuffer(),
            candThumbRes.arrayBuffer(),
          ])

          const newThumbB64 = Buffer.from(newThumbBuf).toString('base64')
          const candThumbB64 = Buffer.from(candThumbBuf).toString('base64')

          // Also compare transcripts if available
          const transcriptMatch = autoTranscript && candidate.transcript &&
            autoTranscript.substring(0, 80).toLowerCase().trim() ===
            candidate.transcript.substring(0, 80).toLowerCase().trim()

          let isDuplicate = false

          if (transcriptMatch) {
            // Transcripts match — very likely duplicate
            isDuplicate = true
            console.log(`Duplicate detected via transcript match: ${candidate.title}`)
          } else if (process.env.GOOGLE_AI_API_KEY) {
            // Use Gemini to compare thumbnails
            try {
              const { GoogleGenerativeAI } = await import('@google/generative-ai')
              const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
              const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

              const result = await model.generateContent([
                {
                  inlineData: { mimeType: 'image/jpeg', data: newThumbB64 }
                },
                {
                  inlineData: { mimeType: 'image/jpeg', data: candThumbB64 }
                },
                'Are these two video thumbnails from the same video? Answer only YES or NO.'
              ])

              const answer = result.response.text().trim().toUpperCase()
              isDuplicate = answer.startsWith('YES')
              console.log(`Gemini thumbnail comparison: ${answer} (vs "${candidate.title}")`)
            } catch (geminiErr: any) {
              console.log('Gemini thumbnail comparison failed:', geminiErr.message)
            }
          }

          if (isDuplicate) {
            // Block this upload — mark as duplicate and delete Mux asset
            await supabase.from('items').update({
              mux_status: 'duplicate',
              mux_asset_id: asset.id,
              description: `Duplicate of: ${candidate.title} (${candidate.id})`,
            }).eq('id', itemId)

            // Delete the Mux asset to save storage
            try {
              await mux.video.assets.delete(asset.id)
            } catch (e) {
              console.log('Could not delete duplicate Mux asset:', asset.id)
            }

            console.log(`Blocked duplicate upload: itemId ${itemId} is a duplicate of "${candidate.title}"`)

            return NextResponse.json({ ok: true, duplicate: true })
          }
        }
      }
    } catch (dupErr: any) {
      console.log('Duplicate check failed, continuing:', dupErr.message)
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
      // If brand opted out of auto-clipping, do analysis only — no clip creation
  if (item.auto_clip === false) {
    console.log('Auto-clip disabled for this item — running analysis only')
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 800,
        messages: [{ role: 'user', content: `Analyse this video. Return ONLY valid JSON:
{"content_type":"UGC|Tutorial|Testimonial|Other","confidence":"High|Medium|Low","summary":"2-3 sentences","tone":"string","topics":["string"],"scene_tags":["string"],"hook":"string","key_quotes":["string"],"ad_potential":"High|Medium|Low","ad_notes":"string"}
Title: ${item.title}, Duration: ${duration}s, Transcript: ${autoTranscript||'not provided'}` }]
      })
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())
      await supabase.from('items').update({ analysis, mux_status: 'ready' }).eq('id', itemId)
    } catch (e: any) {
      console.error('Analysis-only failed:', e.message)
      await supabase.from('items').update({ mux_status: 'ready' }).eq('id', itemId)
    }
    return NextResponse.json({ ok: true })
  }

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

    // Snap segment boundaries to nearest sentence endings using word timestamps
    function snapToSentence(targetTime: number, words: any[], mode: 'start'|'end', windowSecs = 1.5): number {
      if(!words||words.length===0)return targetTime
      const window=words.filter(w=>Math.abs((mode==='end'?w.end:w.start)-targetTime)<windowSecs)
      if(mode==='end'){
        // Find the last word in window that ends a sentence
        const sentenceEnds=window.filter(w=>/[.!?]$/.test(w.punctuated_word||w.word||""))
        if(sentenceEnds.length>0)return sentenceEnds[sentenceEnds.length-1].end+0.05
        // No sentence end found — use the nearest word end
        const nearest=window.sort((a:any,b:any)=>Math.abs(a.end-targetTime)-Math.abs(b.end-targetTime))[0]
        return nearest?nearest.end+0.05:targetTime
      } else {
        // For start — snap to just after a sentence end, or nearest word start
        const sentenceStarts=window.filter(w=>{
          const wIdx=words.indexOf(w);if(wIdx===0)return true
          const prev=words[wIdx-1];return /[.!?]$/.test(prev.punctuated_word||prev.word||"")
        })
        if(sentenceStarts.length>0){
          const closest=sentenceStarts.sort((a:any,b:any)=>Math.abs(a.start-targetTime)-Math.abs(b.start-targetTime))[0]
          return closest.start
        }
        const nearest=window.sort((a:any,b:any)=>Math.abs(a.start-targetTime)-Math.abs(b.start-targetTime))[0]
        return nearest?nearest.start:targetTime
      }
    }

    const rawSegments = (analysis.clip_segments || []).filter(
      (s: any) => typeof s.start_seconds === 'number' &&
                  typeof s.end_seconds === 'number' &&
                  (s.end_seconds - s.start_seconds) >= 1
    )

    // Snap to sentence boundaries if we have word timestamps
    const validSegments = wordTimestamps.length > 0
      ? rawSegments.map((s: any) => ({
          ...s,
          start_seconds: snapToSentence(s.start_seconds, wordTimestamps, 'start'),
          end_seconds: snapToSentence(s.end_seconds, wordTimestamps, 'end'),
        })).filter((s:any) => s.end_seconds - s.start_seconds >= 1)
      : rawSegments

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
    // Create basic clips from word timestamps if we have them, even without Claude
    try {
      if (wordTimestamps.length > 0 && playbackId) {
        const dur = asset.duration || 30
        // Split into ~5 second segments at sentence boundaries
        const segments: any[] = []
        let segStart = 0
        for (let i = 0; i < wordTimestamps.length; i++) {
          const w = wordTimestamps[i]
          const isPunct = /[.!?]$/.test(w.punctuated_word || w.word || "")
          const segDur = (w.end || 0) - segStart
          if ((isPunct && segDur >= 3) || segDur >= 8) {
            segments.push({ start: segStart, end: w.end || segStart + 5, label: segments.length === 0 ? 'HOOK' : 'BODY' })
            segStart = w.end || segStart + 5
          }
        }
        if (segStart < dur - 1) segments.push({ start: segStart, end: dur, label: 'CTA' })
        if (segments.length > 0) {
          const clipInserts = segments.map((seg: any, i: number) => ({
            type: 'clip', parent_id: itemId,
            title: `${item?.title || 'Clip'} — ${seg.label} ${i + 1}`,
            creator: item?.creator, creator_age: item?.creator_age, creator_gender: item?.creator_gender,
            mux_playback_id: playbackId, mux_status: 'ready',
            start_seconds: seg.start, end_seconds: seg.end,
            thumbnail_time: seg.start + (seg.end - seg.start) / 2,
            duration_seconds: seg.end - seg.start,
            analysis: { label: seg.label, quality_score: 'Medium', scene_tags: [], summary: 'Auto-generated clip (basic)' },
          }))
          const { data: fallbackClips } = await supabase.from('items').insert(clipInserts).select()
          const clipIds = (fallbackClips || []).map((c: any) => c.id)
          await supabase.from('items').update({ mux_status: 'ready', clip_ids: clipIds }).eq('id', itemId)
          console.log(`Created ${clipIds.length} fallback clips without Claude`)
          return NextResponse.json({ ok: true })
        }
      }
    } catch (fallbackErr: any) {
      console.error('Fallback clip creation failed:', fallbackErr.message)
    }
    await supabase.from('items').update({ mux_status: 'ready' }).eq('id', itemId)
  }

  return NextResponse.json({ ok: true })
}