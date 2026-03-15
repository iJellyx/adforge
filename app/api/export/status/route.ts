import { NextRequest, NextResponse } from 'next/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const res = await fetch(`https://api.shotstack.io/${SHOTSTACK_ENV}/render/${id}`, {
    headers: { 'x-api-key': SHOTSTACK_API_KEY },
  })
  const data = await res.json()
  const status = data.response?.status

  if (status === 'done') return NextResponse.json({ url: data.response.url })
  if (status === 'failed') return NextResponse.json({ failed: true })
  return NextResponse.json({ status })
}