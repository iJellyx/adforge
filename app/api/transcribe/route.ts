import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { audioUrl } = await req.json()
    if (!audioUrl) return NextResponse.json({ error: 'Missing audioUrl' }, { status: 400 })

    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const data = await res.json()
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    return NextResponse.json({ transcript })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}