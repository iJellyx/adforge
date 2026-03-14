import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || 'uplifting'
    const url = `https://pixabay.com/api/music/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(q)}&per_page=10`
    const res = await fetch(url)
    const data = await res.json()
    const tracks = (data.hits || []).map((t: any) => ({
      id: t.id,
      name: t.title || t.tags,
      tags: t.tags,
      duration: t.duration,
      url: t.audio,
      preview_url: t.audio,
      artist: t.user,
    }))
    return NextResponse.json({ tracks })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
