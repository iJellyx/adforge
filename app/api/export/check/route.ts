import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { adId } = await req.json()
    const supabase = createServiceClient()

    const { data: ad } = await supabase
      .from('forged_ads')
      .select('render_id, render_status, render_url')
      .eq('id', adId)
      .single()

    if (!ad?.render_id) return NextResponse.json({ status: 'pending' })
    if (ad.render_status === 'ready') return NextResponse.json({ status: 'ready', url: ad.render_url })
    if (ad.render_status === 'failed') return NextResponse.json({ status: 'failed' })

    // Check Shotstack
    const res = await fetch(`https://api.shotstack.io/${SHOTSTACK_ENV}/render/${ad.render_id}`, {
      headers: { 'x-api-key': SHOTSTACK_API_KEY },
    })
    const data = await res.json()
    const status = data.response?.status

    if (status === 'done') {
      const url = data.response.url
      await supabase.from('forged_ads').update({
        render_status: 'ready',
        render_url: url,
        updated_at: new Date().toISOString(),
      }).eq('id', adId)
      return NextResponse.json({ status: 'ready', url })
    }

    if (status === 'failed') {
      await supabase.from('forged_ads').update({ render_status: 'failed' }).eq('id', adId)
      return NextResponse.json({ status: 'failed' })
    }

    return NextResponse.json({ status: 'rendering' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}