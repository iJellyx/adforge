import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! }
    })
    const data = await res.json()
    const voices = (data.voices || []).map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.labels?.description || '',
      gender: v.labels?.gender || '',
      age: v.labels?.age || '',
      accent: v.labels?.accent || '',
      preview_url: v.preview_url,
    }))
    return NextResponse.json({ voices })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
