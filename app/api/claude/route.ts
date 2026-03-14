import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { messages, maxTokens } = await req.json()
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens || 1500,
    messages,
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  return NextResponse.json({ text })
}