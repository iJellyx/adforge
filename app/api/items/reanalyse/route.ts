import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Mux from '@mux/mux-node'
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
    let geminiAnalysis = ''
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        const mp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`
        const videoRes = await fetch(mp4Url)
        if (videoRes.ok) {
          const videoBuffer = await videoRes.arrayBuffer()
          const base64Video = Buffer.from(videoBuffer).toString('base64')
          const result = await model.generateContent([
            { inlineData: { mimeType: 'video/mp4', data: base64Video } },
            `Analyse this video and return JSON with clip_segments covering the full ${duration}s. Each segment needs: label (HOOK/PROBLEM/SOLUTION/CTA/BODY), clip_role, start_seconds, end_seconds, description, scene_tags, use_case, quality_score. Cut only at sentence boundaries. Min 1.5s per clip.`
          ])
          geminiAnalysis = result.response.text()
        }
      } catch (e: any) { console.log('Gemini failed:', e.message) }
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 2000,
      messages: [{ role: 'user', content: `Analyse this video and create clip segments. Return ONLY valid JSON.
Title: ${item.title}, Duration: ${duration}s, Transcript: ${autoTranscript}
Gemini visual analysis: ${geminiAnalysis.substring(0, 2000)}
Return: {"content_type":"UGC|Tutorial|Testimonial|Other","confidence":"High|Medium|Low","summary":"2-3 sentences","tone":"string","topics":["string"],"scene_tags":["string"],"hook":"string","key_quotes":["string"],"ad_potential":"High|Medium|Low","ad_notes":"string","clip_segments":[{"label":"HOOK|PROBLEM|SOLUTION|CTA|BODY","clip_role":"hook|problem|solution|cta|b_roll","start_seconds":0,"end_seconds":5,"description":"what is said and shown","scene_tags":["tags"],"use_case":"ad use","quality_score":"High|Medium|Low"}]}
Rules: Cover full ${duration}s, min 1.5s per clip, cut at sentence boundaries only.` }]
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())
    const validSegments = (analysis.clip_segments || []).filter((s: any) =>
      typeof s.start_seconds === 'number' && typeof s.end_seconds === 'number' && (s.end_seconds - s.start_seconds) >= 1.5
    ).filter((s: any) => s.quality_score !== 'Low')

    // Delete old clips first
    const oldClipIds = item.clip_ids || []
    if (oldClipIds.length > 0) await supabase.from('items').delete().in('id', oldClipIds)

    const clipInserts = validSegments.map((seg: any) => ({
      type: 'clip', parent_id: itemId,
      title: `${item.title} — ${seg.label}`,
      creator: item.creator, creator_age: item.creator_age, creator_gender: item.creator_gender,
      mux_playback_id: playbackId, mux_status: 'ready',
      start_seconds: seg.start_seconds, end_seconds: seg.end_seconds,
      thumbnail_time: seg.start_seconds + (seg.end_seconds - seg.start_seconds) / 2,
      duration_seconds: seg.end_seconds - seg.start_seconds,
      clip_role: seg.clip_role || null,
      analysis: { content_type: analysis.content_type, summary: seg.description, scene_tags: seg.scene_tags || [], use_case: seg.use_case, ad_potential: analysis.ad_potential, label: seg.label, clip_role: seg.clip_role, quality_score: seg.quality_score },
    }))

    const { data: clips } = await supabase.from('items').insert(clipInserts).select()
    const clipIds = (clips || []).map((c: any) => c.id)
    await supabase.from('items').update({ analysis, clip_ids: clipIds, mux_status: 'ready' }).eq('id', itemId)
    console.log(`Re-analysis complete: ${clipIds.length} clips created`)
  } catch (err: any) {
    console.error('Re-analysis failed:', err.message)
    await supabase.from('items').update({ mux_status: 'ready' }).eq('id', itemId)
  }

  return NextResponse.json({ ok: true })
}
