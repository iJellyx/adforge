import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || 'uplifting'
    const key = process.env.PIXABAY_API_KEY

    if (!key) {
      return NextResponse.json({ tracks: [], error: 'PIXABAY_API_KEY not configured' })
    }

    const url = `https://pixabay.com/api/music/?key=${key}&q=${encodeURIComponent(q)}&per_page=12&order=popular`
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })

    if (!res.ok) {
      const text = await res.text()
      console.error('Pixabay error:', res.status, text.substring(0, 200))
      return NextResponse.json({ tracks: [], error: `Pixabay API error: ${res.status}` })
    }

    const data = await res.json()

    if (!data.hits) {
      return NextResponse.json({ tracks: [], error: 'No results from Pixabay' })
    }

    const tracks = data.hits.map((t: any) => ({
      id: String(t.id),
      name: t.title || t.tags?.split(',')[0]?.trim() || `Track ${t.id}`,
      tags: t.tags || '',
      duration: t.duration || 0,
      url: t.audio,
      preview_url: t.audio,
      artist: t.user || 'Unknown',
    })).filter((t: any) => t.url)

    return NextResponse.json({ tracks })
  } catch (e: any) {
    console.error('Music route error:', e)
    return NextResponse.json({ tracks: [], error: e.message }, { status: 500 })
  }
}
