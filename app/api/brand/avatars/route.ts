import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { brand } = await req.json()
    if (!brand) return NextResponse.json({ error: 'Missing brand data' }, { status: 400 })

    const brandContext = [
      brand.name && `Brand: ${brand.name}`,
      brand.description && `Description: ${brand.description}`,
      brand.target_customer && `Target Customer: ${brand.target_customer}`,
      brand.voice && `Voice & Tone: ${brand.voice}`,
      brand.reviews && `Reviews: ${brand.reviews}`,
      brand.additional_info && `Additional Info: ${brand.additional_info}`,
    ].filter(Boolean).join('\n')

    if (brandContext.length < 20) {
      return NextResponse.json({ error: 'Add more brand info first — at least a description and target customer.' }, { status: 400 })
    }

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an expert direct-response marketer. Based on the brand info below, generate exactly 3 distinct customer avatars — the ideal buyers for this brand's products.

Each avatar should be a realistic, specific person (not a generic segment). Make them diverse in age, background, and motivation but all plausible buyers.

For each avatar, provide:
- name: A realistic first name
- age: An age range (e.g. "25-34", "35-44")
- gender: "Female", "Male", or "Non-binary"
- description: 2-3 sentences about who they are, their lifestyle, and why they'd buy
- pains: Their specific frustrations and problems this brand solves (2-3 bullet points as text)
- desires: What they want to achieve or feel (2-3 bullet points as text)
- objections: Why they might hesitate to buy (2-3 bullet points as text)

Return ONLY a valid JSON array with exactly 3 objects. No markdown, no explanation.

Brand Info:
${brandContext}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const avatars = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Add unique IDs
    const withIds = avatars.map((a: any) => ({
      ...a,
      id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7),
    }))

    return NextResponse.json({ avatars: withIds })
  } catch (e: any) {
    console.error('[avatars] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
