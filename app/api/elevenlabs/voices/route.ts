import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const key = process.env.ELEVENLABS_API_KEY
    if (!key) {
      return NextResponse.json({ voices: [], error: 'ELEVENLABS_API_KEY not set' })
    }

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key, 'Accept': 'application/json' }
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('ElevenLabs error:', res.status, text.substring(0, 200))
      return NextResponse.json({ voices: [], error: `ElevenLabs error: ${res.status}` })
    }

    const data = await res.json()
    const voices = (data.voices || []).map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category || 'premade',
      description: v.labels?.description || v.labels?.use_case || '',
      gender: v.labels?.gender || '',
      age: v.labels?.age || '',
      accent: v.labels?.accent || '',
      preview_url: v.preview_url || null,
    }))

    return NextResponse.json({ voices })
  } catch (e: any) {
    console.error('Voices route error:', e)
    return NextResponse.json({ voices: [], error: e.message }, { status: 500 })
  }
}
