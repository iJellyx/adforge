import { NextRequest, NextResponse } from 'next/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const download = req.nextUrl.searchParams.get('download')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const res = await fetch(`https://api.shotstack.io/${SHOTSTACK_ENV}/render/${id}`, {
    headers: { 'x-api-key': SHOTSTACK_API_KEY },
  })
  const data = await res.json()
  const status = data.response?.status

  if (status === 'done') {
    const url = data.response.url
    // If download=true, proxy the file so browser downloads it directly
    if (download === 'true') {
      const fileRes = await fetch(url)
      const buffer = await fileRes.arrayBuffer()
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="adforge-ad-${Date.now()}.mp4"`,
          'Content-Length': buffer.byteLength.toString(),
        }
      })
    }
    return NextResponse.json({ url })
  }
  if (status === 'failed') return NextResponse.json({ failed: true })
  return NextResponse.json({ status })
}