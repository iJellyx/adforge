import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Recovery endpoint: unstick items that have a playback_id but status is still 'analysing'.
// Call this after deploying the new pipeline to clean up legacy stuck items.
// GET /api/items/unstick
export async function GET(_req: NextRequest) {
  const supabase = createServiceClient()

  // Find items with playback_id (video works) but stuck in 'analysing'
  const { data: stuck, error: selectError } = await supabase
    .from('items')
    .select('id, title, mux_status, mux_playback_id, clip_ids')
    .eq('mux_status', 'analysing')
    .not('mux_playback_id', 'is', null)

  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 })

  const count = stuck?.length || 0
  if (count === 0) return NextResponse.json({ ok: true, unstuck: 0, message: 'No stuck items found' })

  // Mark them as ready — video is playable; analysis can be retried via the UI
  const { error: updateError } = await supabase
    .from('items')
    .update({ mux_status: 'ready' })
    .eq('mux_status', 'analysing')
    .not('mux_playback_id', 'is', null)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    unstuck: count,
    items: stuck.map(s => ({ id: s.id, title: s.title, hasClips: (s.clip_ids || []).length > 0 })),
  })
}
