import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_BASE = process.env.SHOTSTACK_ENV === 'production'
  ? 'https://api.shotstack.io/edit/v1'
  : 'https://api.shotstack.io/edit/stage/v1'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()

  try {
    const { adId } = await req.json()
    if (!adId) return NextResponse.json({ error: 'adId required' }, { status: 400 })

    const { data: ad } = await supabase
      .from('forged_ads')
      .select('render_id, render_status, render_url')
      .eq('id', adId)
      .single()

    if (!ad?.render_id) {
      return NextResponse.json({ status: 'pending' })
    }

    // Already done — return immediately
    if (ad.render_status === 'ready' && ad.render_url) {
      return NextResponse.json({ status: 'ready', url: ad.render_url })
    }

    // Poll Shotstack
    const res = await fetch(`${SHOTSTACK_BASE}/render/${ad.render_id}`, {
      headers: { 'x-api-key': SHOTSTACK_API_KEY },
    })

    const data = await res.json()
    const renderData = data?.response

    if (!renderData) {
      return NextResponse.json({ status: ad.render_status || 'rendering' })
    }

    const shotStatus: string = renderData.status // queued | fetching | rendering | saving | done | failed

    if (shotStatus === 'done' && renderData.url) {
      await supabase
        .from('forged_ads')
        .update({
          render_status: 'ready',
          render_url: renderData.url,
          render_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', adId)

      return NextResponse.json({ status: 'ready', url: renderData.url })
    }

    if (shotStatus === 'failed') {
      const errMsg = renderData.error || 'Render failed on Shotstack'
      await supabase
        .from('forged_ads')
        .update({ render_status: 'failed', render_error: errMsg })
        .eq('id', adId)

      return NextResponse.json({ status: 'failed', error: errMsg })
    }

    // Still in progress
    return NextResponse.json({ status: 'rendering', shotstackStatus: shotStatus })
  } catch (err: any) {
    console.error('Check route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
