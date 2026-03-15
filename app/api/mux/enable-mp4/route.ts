import { NextResponse } from 'next/server'

export async function POST() {
  const tokenId = process.env.MUX_TOKEN_ID!
  const tokenSecret = process.env.MUX_TOKEN_SECRET!
  const auth = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')

  try {
    // Get all assets
    const listRes = await fetch('https://api.mux.com/video/v1/assets?limit=100', {
      headers: { 'Authorization': `Basic ${auth}` }
    })
    const listData = await listRes.json()
    const assets = listData.data || []

    const results = []
    for (const asset of assets) {
      try {
        const res = await fetch(`https://api.mux.com/video/v1/assets/${asset.id}/mp4-support`, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ mp4_support: 'capped-1080p' })
        })
        const data = await res.json()
        results.push({ id: asset.id, status: res.ok ? 'updated' : 'failed', data })
      } catch(e: any) {
        results.push({ id: asset.id, status: 'failed', error: e.message })
      }
    }
    return NextResponse.json({ total: assets.length, results })
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}