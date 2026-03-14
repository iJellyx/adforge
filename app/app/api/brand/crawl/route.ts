import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'Missing URL' }, { status: 400 })

    // Fetch the website
    let html = ''
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
        signal: AbortSignal.timeout(8000)
      })
      html = await res.text()
    } catch (e) {
      return NextResponse.json({ error: 'Could not fetch website. Try pasting your About page copy instead.' }, { status: 400 })
    }

    // Strip HTML tags to get readable text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 6000)

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are filling out a brand profile. Write ALL fields in FIRST PERSON as the brand themselves (e.g. "We are a...", "Our mission is...", "Our customers love..."). Never say "The brand" or "They" — always use "We", "Our", "Us".

Extract from the website content below. Return ONLY valid JSON, no markdown:
{"name":"","website":"${url}","description":"","voice":"","target_customer":"","reviews":"","additional_info":""}

Website content:
${text}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const profile = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return NextResponse.json({ profile })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
