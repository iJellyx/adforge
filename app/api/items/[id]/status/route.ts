import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('items')
    .select('id, mux_status, mux_playback_id, analysis, clip_ids')
    .eq('id', id)
    .single()
  return NextResponse.json(data || { error: 'Not found' })
}