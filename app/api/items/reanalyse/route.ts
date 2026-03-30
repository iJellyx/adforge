import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { itemId } = await req.json()
  if (!itemId) return NextResponse.json({ error: 'No itemId' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: item } = await supabase.from('items').select('*').eq('id', itemId).single()
  if (!item?.mux_playback_id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const playbackId = item.mux_playback_id
  const duration = item.duration_seconds || 30
  const autoTranscript = item.transcript || ''

  await supabase.from('items').update({ mux_status: 'analysing' }).eq('id', itemId)

  try {
    // Step 1: Gemini visual analysis
    let geminiAnalysis = ''
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        const mp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`
        const videoRes = await fetch(mp4Url, { signal: AbortSignal.timeout(30000) })
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
}`
          ])
          geminiAnalysis = result.response.text()
        }
      } catch (e: any) { console.log('Gemini reanalyse failed:', e.message) }
    }

    // Step 2: Claude combined analysis with enhanced creative type tagging
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 3000,
      messages: [{ role: 'user', content: `You are an expert video ad analyst for DTC e-commerce brands.

Analyse this video combining the transcript and visual analysis. Be extremely specific and detailed — your tags will be used for AI clip matching in ad creation.

Title: ${item.title}
Duration: ${duration}s
Creator: ${item.creator || 'Unknown'}${item.creator_age ? ', ' + item.creator_age : ''}${item.creator_gender ? ', ' + item.creator_gender : ''}
Transcript: ${autoTranscript.substring(0, 2000)}
Gemini Visual Analysis: ${geminiAnalysis.substring(0, 3000)}

Return ONLY valid JSON:
{
  "content_type": "UGC|Founder Clip|Tutorial|Behind the Scenes|High Production|Testimonial|Product Demo|Talking Head|Unboxing|Before & After|Lifestyle|Reaction|Other",
  "creative_tags": ["talking_head", "founder", "demonstration", "product_closeup", "before_after", "testimonial", "unboxing", "lifestyle", "reaction", "tutorial", "ingredient_shot", "result_shot", "ugc", "studio", "outdoor", "kitchen", "bathroom", "gym"],
  "visual_style": "professional|casual|raw_ugc|polished_ugc|studio|outdoor|indoor",
  "has_face": "true ONLY if a human face is clearly visible on screen, false otherwise",
  "is_talking_head": "true ONLY if a person is speaking directly to camera as the primary visual, false otherwise — product demos with voiceover are NOT talking head",
  "is_broll": "true if this is supplementary footage like product shots, demos, lifestyle, close-ups, scenery — with NO person speaking to camera as the focus",
  "product_visible": "true ONLY if a physical product is clearly visible on screen, false otherwise",
  "confidence": "High|Medium|Low",
  "summary": "2-3 sentences combining what was said AND shown — be specific about products, claims, visuals",
  "tone": "emotional tone description (e.g. excited, calm, urgent, empathetic, authoritative)",
  "topics": ["specific topics — product names, ingredients, problems, solutions"],
  "scene_tags": ["extremely specific visual tags — e.g. 'woman applying serum', 'yellow teeth close-up', 'product on bathroom counter', 'before-after skin comparison'"],
  "hook": "most attention-grabbing moment or opening line",
  "key_quotes": ["powerful direct quotes from transcript with context"],
  "ad_potential": "High|Medium|Low",
  "ad_notes": "specific advice on how to use this in ads — what sections it's best for, what it pairs well with",
  "clip_segments": [
    {
      "label": "HOOK|PROBLEM|AGITATE|SOLUTION|SOCIAL PROOF|CTA|BODY|PRODUCT|REACTION|BEFORE|AFTER|TESTIMONIAL|DEMONSTRATION",
      "clip_role": "hook|problem|solution|social_proof|cta|b_roll|product_demo|reaction|before_after|testimonial|demonstration|lifestyle|unboxing",
      "start_seconds": 0,
      "end_seconds": 4,
      "description": "combine exact transcript words with visual description — be specific",
      "scene_tags": ["specific visual tags for THIS segment — be extremely detailed"],
      "creative_tags": ["talking_head|broll|product_shot|demonstration|reaction|lifestyle|closeup|wide_shot|text_overlay"],
      "is_talking_head": "true ONLY if person is speaking to camera in THIS segment",
      "is_broll": "true if this segment shows product/demo/lifestyle/scenery without someone talking to camera",
      "use_case": "specific ad use case — e.g. 'perfect opening hook for problem-aware audience'",
      "quality_score": "High|Medium|Low",
      "avoid_reason": null
    }
  ]
}

RULES:
- Cover the FULL ${duration} seconds with segments
- Minimum 1.5s per segment, maximum 8s
- Cut at natural sentence/visual boundaries only
- Be EXTREMELY specific in scene_tags — these power clip matching
- creative_tags should classify the visual style of each segment independently
- is_talking_head = person speaking directly to camera; is_broll = product shots, demos, lifestyle without dialogue` }]
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())
    const validSegments = (analysis.clip_segments || []).filter((s: any) =>
      typeof s.start_seconds === 'number' && typeof s.end_seconds === 'number' && (s.end_seconds - s.start_seconds) >= 1.5
    ).filter((s: any) => s.quality_score !== 'Low')

    // Delete old clips
    const oldClipIds = item.clip_ids || []
    if (oldClipIds.length > 0) await supabase.from('items').delete().in('id', oldClipIds)

    // Extract transcript for each segment
    const wordTimestamps = item.word_timestamps || []

    const clipInserts = validSegments.map((seg: any) => {
      // Get transcript for this segment from word timestamps if available
      let segTranscript = ''
      if (wordTimestamps.length > 0) {
        segTranscript = wordTimestamps
          .filter((w: any) => w.start >= seg.start_seconds && w.end <= seg.end_seconds)
          .map((w: any) => w.word).join(' ')
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
        workspace_id: item.workspace_id,
        analysis: {
          content_type: analysis.content_type,
          creative_tags: seg.creative_tags || analysis.creative_tags || [],
          is_talking_head: seg.is_talking_head ?? analysis.is_talking_head ?? false,
          is_broll: seg.is_broll ?? analysis.is_broll ?? false,
          summary: seg.description,
          scene_tags: seg.scene_tags || [],
          use_case: seg.use_case,
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

    const { data: clips } = await supabase.from('items').insert(clipInserts).select()
    const clipIds = (clips || []).map((c: any) => c.id)
    await supabase.from('items').update({ analysis, clip_ids: clipIds, mux_status: 'ready' }).eq('id', itemId)
    console.log(`Re-analysis complete: ${clipIds.length} clips created for ${item.title}`)
  } catch (err: any) {
    console.error('Re-analysis failed:', err.message)
    await supabase.from('items').update({ mux_status: 'ready' }).eq('id', itemId)
  }

  return NextResponse.json({ ok: true })
}
