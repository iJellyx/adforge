import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { adId } = await req.json()
    if (!adId) return NextResponse.json({ error: 'Missing adId' }, { status: 400 })

    const supabase = createServiceClient()

    // Fetch the forged ad
    const { data: ad, error: adErr } = await supabase
      .from('forged_ads')
      .select('*')
      .eq('id', adId)
      .single()

    if (adErr || !ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
    }

    const sections = ad.sections || []
    if (sections.length === 0) {
      return NextResponse.json({ error: 'Ad has no sections' }, { status: 400 })
    }

    // Fetch all clips used in this ad
    const clipIds = sections
      .map((s: any) => s.selectedClipId)
      .filter(Boolean)

    let clipMap: Record<string, any> = {}
    if (clipIds.length > 0) {
      const { data: clips } = await supabase
        .from('items')
        .select('*')
        .in('id', clipIds)

      if (clips) {
        clipMap = Object.fromEntries(clips.map((c: any) => [c.id, c]))
      }
    }

    // Build scoring context for each section
    const sectionDetails = sections.map((s: any, i: number) => {
      const clip = clipMap[s.selectedClipId] || null
      return {
        index: i + 1,
        type: s.type || 'UNKNOWN',
        spokenWords: s.spokenWords || '',
        visualDirection: s.visualDirection || '',
        hasClip: !!clip,
        clipTranscript: clip?.transcript || '',
        clipSummary: clip?.analysis?.summary || '',
        clipSceneTags: (clip?.analysis?.scene_tags || []).join(', '),
        clipRole: clip?.analysis?.clip_role || '',
        clipContentType: clip?.analysis?.content_type || '',
        clipAdPotential: clip?.analysis?.ad_potential || '',
      }
    })

    // Ask Claude to score each section's clip-script alignment
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an expert video ad creative director scoring clip-script alignment.

For each section of this forged ad, score how well the matched video clip aligns with what the script says and the intended visual direction.

SCORING CRITERIA:
- Visual Match (0-10): Does the clip's visual content match the script's visual direction?
- Narrative Fit (0-10): Does the clip support the emotional tone and message of the spoken words?
- Role Alignment (0-10): Is the clip's content type appropriate for this section type (e.g. testimonial clip for SOCIAL PROOF, product demo for SOLUTION)?

Also provide:
- A 1-sentence "fix" suggestion if the section scores below 7 average
- For sections without a matched clip, score 0 and suggest what type of clip to find

AD SECTIONS:
${sectionDetails.map((s: any) => `
--- Section ${s.index}: ${s.type} ---
Script: "${s.spokenWords}"
Visual Direction: "${s.visualDirection}"
${s.hasClip ? `Clip Transcript: "${s.clipTranscript}"
Clip Visual Tags: ${s.clipSceneTags}
Clip Summary: ${s.clipSummary}
Clip Role: ${s.clipRole}
Clip Type: ${s.clipContentType}
Clip Ad Potential: ${s.clipAdPotential}` : 'NO CLIP MATCHED'}
`).join('\n')}

Return ONLY valid JSON, no markdown:
{
  "sections": [
    {
      "index": 1,
      "visual_match": 8,
      "narrative_fit": 7,
      "role_alignment": 9,
      "avg": 8.0,
      "fix": null
    }
  ],
  "overall_score": 82,
  "overall_grade": "B+",
  "top_issue": "Section 3 clip shows a product close-up but script discusses lifestyle benefits — swap for a lifestyle clip"
}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const scoreData = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Save score to forged_ads
    const overallScore = scoreData.overall_score || 0
    const grade = scoreData.overall_grade || gradeFromScore(overallScore)

    await supabase
      .from('forged_ads')
      .update({
        metadata: {
          ...ad.metadata,
          score: overallScore,
          grade,
          score_details: scoreData,
          scored_at: new Date().toISOString(),
        }
      })
      .eq('id', adId)

    return NextResponse.json({
      score: overallScore,
      grade,
      details: scoreData,
    })
  } catch (e: any) {
    console.error('[ads/score] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B+'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C+'
  if (score >= 50) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}
