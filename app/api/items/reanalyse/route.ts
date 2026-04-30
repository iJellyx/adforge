import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 300

// ── Editorial guardrails for clip selection ────────────────────────────────
//
// Different roles have different ideal durations. These are based on what
// performs in DR ads — hooks are punchy, agitations breathe, CTAs are tight.
const ROLE_DURATIONS: Record<string, { min: number; max: number; ideal: number }> = {
  hook:           { min: 1.8, max: 4.0, ideal: 2.8 },
  problem:        { min: 2.5, max: 5.0, ideal: 3.5 },
  agitate:        { min: 2.5, max: 5.0, ideal: 3.5 },
  solution:       { min: 2.5, max: 6.0, ideal: 4.0 },
  social_proof:   { min: 2.5, max: 5.5, ideal: 3.5 },
  testimonial:    { min: 2.5, max: 6.0, ideal: 4.0 },
  cta:            { min: 1.5, max: 3.0, ideal: 2.2 },
  b_roll:         { min: 1.2, max: 4.0, ideal: 2.5 },
  product_demo:   { min: 2.0, max: 5.0, ideal: 3.5 },
  reaction:       { min: 1.0, max: 3.0, ideal: 1.8 },
  before_after:   { min: 2.0, max: 5.0, ideal: 3.0 },
  demonstration:  { min: 2.0, max: 5.0, ideal: 3.5 },
  lifestyle:      { min: 1.5, max: 4.0, ideal: 2.5 },
  unboxing:       { min: 2.0, max: 5.0, ideal: 3.0 },
}
const DEFAULT_DURATION = { min: 1.5, max: 5.0, ideal: 3.0 }

// ── Snap helpers ───────────────────────────────────────────────────────────
//
// Snap a clip boundary to the nearest natural cut point using word timestamps
// (sentence ends) and Gemini's detected scene changes (visual cuts). The goal
// is to never start/end a clip mid-word or mid-action.

type Word = { word: string; start: number; end: number; punctuated_word?: string }
type SceneChange = { time_seconds: number; description?: string }

const SENTENCE_END_RE = /[.!?]$/
const PHRASE_END_RE = /[,.;:!?]$/

function snapStart(target: number, words: Word[], scenes: SceneChange[], windowSec = 0.6): number {
  if (!words.length && !scenes.length) return target

  // 1) Best: snap to a word that starts a sentence (preceded by sentence-end punct)
  if (words.length) {
    const candidates: number[] = []
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const prev = i === 0 ? null : words[i - 1]
      const startsSentence = !prev || SENTENCE_END_RE.test(prev.punctuated_word || prev.word || '')
      if (startsSentence && Math.abs(w.start - target) < windowSec) candidates.push(w.start)
    }
    if (candidates.length) {
      return candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0]
    }
  }

  // 2) Otherwise: snap to a scene change near target
  if (scenes.length) {
    const near = scenes.filter(s => Math.abs(s.time_seconds - target) < windowSec * 1.5)
    if (near.length) {
      return near.sort((a, b) => Math.abs(a.time_seconds - target) - Math.abs(b.time_seconds - target))[0].time_seconds
    }
  }

  // 3) Otherwise: snap to nearest word start in window
  if (words.length) {
    const inWindow = words.filter(w => Math.abs(w.start - target) < windowSec)
    if (inWindow.length) return inWindow.sort((a, b) => Math.abs(a.start - target) - Math.abs(b.start - target))[0].start
  }

  return target
}

function snapEnd(target: number, words: Word[], scenes: SceneChange[], windowSec = 0.6): number {
  if (!words.length && !scenes.length) return target

  // 1) Best: snap to a word that ends a sentence (sentence-end punctuation)
  if (words.length) {
    const sentEnds = words.filter(w =>
      SENTENCE_END_RE.test(w.punctuated_word || w.word || '') &&
      Math.abs(w.end - target) < windowSec
    )
    if (sentEnds.length) {
      const closest = sentEnds.sort((a, b) => Math.abs(a.end - target) - Math.abs(b.end - target))[0]
      return closest.end + 0.05  // tiny breath
    }

    // 2) Then: snap to phrase-ending punct (comma/colon)
    const phraseEnds = words.filter(w =>
      PHRASE_END_RE.test(w.punctuated_word || w.word || '') &&
      Math.abs(w.end - target) < windowSec
    )
    if (phraseEnds.length) {
      const closest = phraseEnds.sort((a, b) => Math.abs(a.end - target) - Math.abs(b.end - target))[0]
      return closest.end + 0.03
    }
  }

  // 3) Then: scene change just before target
  if (scenes.length) {
    const before = scenes.filter(s => s.time_seconds <= target + windowSec && s.time_seconds >= target - windowSec)
    if (before.length) {
      return before.sort((a, b) => Math.abs(a.time_seconds - target) - Math.abs(b.time_seconds - target))[0].time_seconds
    }
  }

  // 4) Last resort: nearest word end in window (avoid mid-word cuts)
  if (words.length) {
    const inWindow = words.filter(w => Math.abs(w.end - target) < windowSec)
    if (inWindow.length) return inWindow.sort((a, b) => Math.abs(a.end - target) - Math.abs(b.end - target))[0].end
  }

  return target
}

// Validate + clamp a clip to its role's allowed duration band
function clampToRole(seg: { start_seconds: number; end_seconds: number; clip_role?: string }, words: Word[], scenes: SceneChange[]) {
  const rules = ROLE_DURATIONS[(seg.clip_role || '').toLowerCase()] || DEFAULT_DURATION
  const dur = seg.end_seconds - seg.start_seconds

  if (dur < rules.min) {
    // Too short: extend the end forward to nearest sentence end up to max
    const newEnd = snapEnd(seg.start_seconds + rules.ideal, words, scenes, 1.0)
    if (newEnd - seg.start_seconds >= rules.min) seg.end_seconds = newEnd
  } else if (dur > rules.max) {
    // Too long: pull the end back to nearest sentence end
    const newEnd = snapEnd(seg.start_seconds + rules.ideal, words, scenes, 1.0)
    if (newEnd - seg.start_seconds >= rules.min && newEnd <= seg.end_seconds) seg.end_seconds = newEnd
  }
  return seg
}

// ──────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { itemId } = await req.json()
  if (!itemId) return NextResponse.json({ error: 'No itemId' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: item } = await supabase.from('items').select('*').eq('id', itemId).single()
  if (!item?.mux_playback_id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const playbackId = item.mux_playback_id
  const duration = item.duration_seconds || 30
  let autoTranscript = item.transcript || ''
  let wordTimestamps: Word[] = item.word_timestamps || []

  try {
    const mp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`

    // ── Step 0: Deepgram if we don't already have word timestamps ────────
    // Without these, snap-to-sentence can't work and clips will start/end
    // mid-word. This was the missing piece.
    if (wordTimestamps.length === 0 && process.env.DEEPGRAM_API_KEY) {
      try {
        const audioRes = await fetch(mp4Url, { signal: AbortSignal.timeout(45000) })
        if (audioRes.ok) {
          const audioBuf = await audioRes.arrayBuffer()
          const tRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&words=true', {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
              'Content-Type': 'video/mp4',
              'Content-Length': audioBuf.byteLength.toString(),
            },
            body: audioBuf,
            signal: AbortSignal.timeout(60000),
          })
          if (tRes.ok) {
            const tData = await tRes.json()
            autoTranscript = tData.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
            wordTimestamps = tData.results?.channels?.[0]?.alternatives?.[0]?.words || []
            console.log(`[reanalyse] Deepgram: ${autoTranscript.length} chars, ${wordTimestamps.length} words`)
            // Persist so we don't re-run on subsequent re-analyses
            await supabase.from('items').update({
              transcript: autoTranscript,
              word_timestamps: wordTimestamps,
            }).eq('id', itemId)
          }
        }
      } catch (e: any) { console.log('[reanalyse] Deepgram failed:', e.message) }
    }

    // ── Step 1: Gemini visual analysis ─────────────────────────────────
    let geminiAnalysis = ''
    let sceneChanges: SceneChange[] = []
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        const videoRes = await fetch(mp4Url, { signal: AbortSignal.timeout(45000) })
        if (videoRes.ok) {
          const videoBuffer = await videoRes.arrayBuffer()
          const base64Video = Buffer.from(videoBuffer).toString('base64')
          const result = await model.generateContent([
            { inlineData: { mimeType: 'video/mp4', data: base64Video } },
            `Analyse this video visually. Return ONLY valid JSON:
{
  "visual_summary": "detailed description of what is shown visually",
  "scene_changes": [{"time_seconds": 0, "description": "..."}],
  "visual_elements": ["close-up of product", "person talking to camera"],
  "creator_description": "age range, gender, setting, appearance",
  "product_shots": ["timestamp and what product is shown"],
  "emotional_moments": ["timestamps of reactions or emphasis"],
  "on_screen_text": ["any text visible on screen with timestamp"],
  "scene_segments": [
    {
      "start_seconds": 0, "end_seconds": 5,
      "visual_description": "exactly what is shown",
      "visual_tags": ["searchable visual tags"],
      "scene_type": "talking_head|product_shot|before_after|reaction|demonstration|lifestyle|text_overlay|unboxing|ingredient_shot|result_shot|testimonial|founder|tutorial|behind_the_scenes",
      "ad_value": "High|Medium|Low",
      "cut_reason": "why this is a natural cut point"
    }
  ]
}

Pay special attention to scene_changes — list every clear visual cut/transition with timestamp. These are critical cut points for clip extraction.`
          ])
          geminiAnalysis = result.response.text()
          // Try to extract scene_changes for snapping
          try {
            const parsed = JSON.parse(geminiAnalysis.replace(/```json|```/g, '').trim())
            sceneChanges = (parsed.scene_changes || []).filter((s: any) => typeof s.time_seconds === 'number')
          } catch {}
          console.log(`[reanalyse] Gemini: ${geminiAnalysis.length} chars, ${sceneChanges.length} scene changes`)
        }
      } catch (e: any) { console.log('[reanalyse] Gemini failed:', e.message) }
    }

    // ── Step 2: Claude — strict editorial prompt ───────────────────────
    //
    // The prompt is built around what makes a clip USEFUL in a direct response
    // ad, not what's interesting in the video. The role table teaches Claude
    // the exact duration windows we expect.
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const editorialRules = `EDITORIAL RULES — these are not suggestions:

1. QUALITY > QUANTITY
   - Generate 3-8 clips MAX. A typical 60s video should yield 4-6 great clips, not 12 mediocre ones.
   - REJECT segments that are: mid-thought, generic, low-energy, repetitive, mumbled, off-camera audio only.
   - Mark quality_score "Low" for anything you wouldn't proudly use in an ad. We DROP all Low clips.

2. CUT POINTS
   - START a clip at the first word of a complete thought. Never start mid-sentence.
   - END a clip on a sentence-ending word (period, question mark, exclamation), or at a clear visual transition.
   - Leave a tiny breath at the end (we add that automatically).

3. ROLE-SPECIFIC DURATIONS (strict — these are validated post-hoc):
   - hook: 1.8-4.0s (ideal 2.8s) — punchy, attention-grabbing single line
   - problem: 2.5-5.0s — articulates the pain
   - agitate: 2.5-5.0s — twists the knife
   - solution: 2.5-6.0s — introduces the product
   - social_proof: 2.5-5.5s — testimonial moment
   - testimonial: 2.5-6.0s — full claim with delivery
   - cta: 1.5-3.0s — short, direct
   - b_roll: 1.2-4.0s — visual support, no dialogue needed
   - product_demo: 2.0-5.0s — showing the product working
   - reaction: 1.0-3.0s — facial expression, gasp, smile
   - before_after: 2.0-5.0s
   - lifestyle: 1.5-4.0s
   - unboxing: 2.0-5.0s

4. CLIP_ROLE ASSIGNMENT
   - Every clip MUST have one of the roles above.
   - Match the role to what the clip actually IS, not what we wish it was.
   - If a single clip works for multiple roles, pick the BEST fit.

5. SCENE TAGS — be brutally specific
   - Bad: "person talking", "product shown"
   - Good: "blonde woman in white kitchen holding green smoothie bottle", "yellow-stained teeth close-up at 2.3s", "before-after split-screen of rosacea on cheek"
   - Include: who is on camera, what they wear, where they are, what they hold, lighting, framing, distinctive details
   - 5-10 scene_tags per clip is good. More is better than fewer.

6. CREATIVE TAGS — classify the visual style
   - From: talking_head, broll, product_shot, demonstration, reaction, lifestyle, closeup, wide_shot, text_overlay, hand_held, studio, outdoor, kitchen, bathroom, gym, founder, ugc, polished, raw

7. DROP THESE (don't return as a clip):
   - Filler words / "um, so, like" intros
   - Off-camera setup talk
   - Repeated takes of the same line
   - Anything mid-sentence at start OR end
   - Long pauses or silence
   - Off-topic tangents`

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 3500,
      messages: [{ role: 'user', content: `You are a senior video editor specialising in direct response ads for DTC e-commerce brands. Your reputation depends on cutting clips that look broadcast-ready, not amateur.

Analyse this video and extract the BEST clips for use in future ads. Combine the transcript and visual analysis. Be ruthless — a smaller set of great clips beats a larger set of mediocre ones.

Title: ${item.title}
Duration: ${duration}s
Creator: ${item.creator || 'Unknown'}${item.creator_age ? ', ' + item.creator_age : ''}${item.creator_gender ? ', ' + item.creator_gender : ''}
Transcript: ${autoTranscript.substring(0, 3000)}

Word-level timestamps (use these for cut points):
${wordTimestamps.slice(0, 200).map(w => `${w.start.toFixed(2)}s "${w.punctuated_word || w.word}"`).join(' · ')}

Gemini visual analysis:
${geminiAnalysis.substring(0, 4000)}

${editorialRules}

Return ONLY valid JSON:
{
  "content_type": "UGC|Founder Clip|Tutorial|Behind the Scenes|High Production|Testimonial|Product Demo|Talking Head|Unboxing|Before & After|Lifestyle|Reaction|Other",
  "creative_tags": ["..."],
  "visual_style": "professional|casual|raw_ugc|polished_ugc|studio|outdoor|indoor",
  "has_face": true,
  "is_talking_head": true,
  "is_broll": false,
  "product_visible": true,
  "confidence": "High|Medium|Low",
  "summary": "2-3 sentences combining what was said AND shown",
  "tone": "emotional tone",
  "topics": ["specific topics"],
  "scene_tags": ["specific visual tags for the WHOLE video"],
  "hook": "most attention-grabbing line",
  "key_quotes": ["powerful direct quotes"],
  "ad_potential": "High|Medium|Low",
  "ad_notes": "specific advice on how to use this in ads",
  "clip_segments": [
    {
      "label": "HOOK|PROBLEM|AGITATE|SOLUTION|SOCIAL PROOF|CTA|BODY|PRODUCT|REACTION|BEFORE|AFTER|TESTIMONIAL|DEMONSTRATION",
      "clip_role": "hook|problem|agitate|solution|social_proof|cta|b_roll|product_demo|reaction|before_after|testimonial|demonstration|lifestyle|unboxing",
      "start_seconds": 0.0,
      "end_seconds": 3.5,
      "description": "exact transcript words + visual description",
      "scene_tags": ["very specific visual tags for THIS clip"],
      "creative_tags": ["..."],
      "is_talking_head": true,
      "is_broll": false,
      "use_case": "specific ad use case",
      "quality_score": "High|Medium|Low",
      "why_this_works": "1-2 sentences on why this clip is shareable"
    }
  ]
}` }]
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())

    // ── Step 3: Post-process segments ────────────────────────────────────
    // (a) Drop quality === Low
    // (b) Snap start/end to sentence/scene boundaries
    // (c) Clamp to role-specific duration window
    // (d) Re-validate min duration; drop if still bad
    let segments: any[] = (analysis.clip_segments || []).filter((s: any) =>
      typeof s.start_seconds === 'number' &&
      typeof s.end_seconds === 'number' &&
      (s.end_seconds - s.start_seconds) >= 1.0 &&
      s.quality_score !== 'Low'
    )

    segments = segments.map((seg: any) => {
      const snappedStart = snapStart(seg.start_seconds, wordTimestamps, sceneChanges)
      const snappedEnd = snapEnd(seg.end_seconds, wordTimestamps, sceneChanges)
      seg.start_seconds = Math.max(0, snappedStart)
      seg.end_seconds = Math.min(duration, snappedEnd)
      return clampToRole(seg, wordTimestamps, sceneChanges)
    })

    // Drop anything that ended up too short post-snap, or with start >= end
    const validSegments = segments.filter((s: any) => {
      const dur = s.end_seconds - s.start_seconds
      const rules = ROLE_DURATIONS[(s.clip_role || '').toLowerCase()] || DEFAULT_DURATION
      return dur >= rules.min && dur <= rules.max + 0.5  // small tolerance over max
    })

    console.log(`[reanalyse] Claude returned ${analysis.clip_segments?.length || 0} → ${segments.length} after Low-filter → ${validSegments.length} after snap+role validation`)

    // ── Step 4: Replace old clips with new ones ──────────────────────────
    const oldClipIds = item.clip_ids || []
    if (oldClipIds.length > 0) await supabase.from('items').delete().in('id', oldClipIds)

    const clipInserts = validSegments.map((seg: any) => {
      // Per-clip transcript from word timestamps
      let segTranscript = ''
      if (wordTimestamps.length > 0) {
        segTranscript = wordTimestamps
          .filter(w => w.start >= seg.start_seconds && w.end <= seg.end_seconds)
          .map(w => w.punctuated_word || w.word)
          .join(' ')
      }
      return {
        type: 'clip', parent_id: itemId,
        title: `${item.title} — ${seg.label}`,
        creator: item.creator, creator_age: item.creator_age, creator_gender: item.creator_gender,
        mux_playback_id: playbackId, mux_status: 'ready',
        start_seconds: seg.start_seconds, end_seconds: seg.end_seconds,
        thumbnail_time: seg.start_seconds + (seg.end_seconds - seg.start_seconds) / 2,
        duration_seconds: seg.end_seconds - seg.start_seconds,
        transcript: segTranscript || undefined,
        clip_role: seg.clip_role || null,
        clip_status: 'pending',
        workspace_id: item.workspace_id,
        analysis: {
          content_type: analysis.content_type,
          creative_tags: seg.creative_tags || analysis.creative_tags || [],
          is_talking_head: seg.is_talking_head ?? analysis.is_talking_head ?? false,
          is_broll: seg.is_broll ?? analysis.is_broll ?? false,
          summary: seg.description,
          scene_tags: seg.scene_tags || [],
          use_case: seg.use_case,
          why_this_works: seg.why_this_works,
          ad_potential: seg.quality_score === 'High' ? 'High' : analysis.ad_potential,
          tone: analysis.tone,
          hook: seg.label === 'HOOK' ? analysis.hook : null,
          key_quotes: analysis.key_quotes || [],
          label: seg.label,
          clip_role: seg.clip_role,
          quality_score: seg.quality_score,
          parent_title: item.title,
          creator_context: item.creator ? `${item.creator}${item.creator_age ? ', ' + item.creator_age : ''}` : null,
        },
      }
    })

    const { data: clips } = clipInserts.length > 0
      ? await supabase.from('items').insert(clipInserts).select()
      : { data: [] as any[] }
    const clipIds = (clips || []).map((c: any) => c.id)
    await supabase.from('items').update({ analysis, clip_ids: clipIds, mux_status: 'ready' }).eq('id', itemId)
    console.log(`[reanalyse] Done: ${clipIds.length} clips for ${item.title}`)
  } catch (err: any) {
    console.error('[reanalyse] failed:', err.message)
    await supabase.from('items').update({ mux_status: 'ready' }).eq('id', itemId)
  }

  return NextResponse.json({ ok: true })
}
