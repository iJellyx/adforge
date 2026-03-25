import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// DELETE — disconnect Google Drive
export async function DELETE() {
  const supabase = createServiceClient()
  await supabase.from('integrations').delete().eq('type', 'gdrive')
  return NextResponse.json({ ok: true })
}

// PATCH — update folder selection
export async function PATCH(req: NextRequest) {
  const supabase = createServiceClient()
  const { folder_id, folder_name } = await req.json()

  if (!folder_id) {
    return NextResponse.json({ error: 'folder_id required' }, { status: 400 })
  }

  // Reset imported_ids when folder changes so everything in new folder gets imported
  const { data: existing } = await supabase
    .from('integrations')
    .select('folder_id')
    .eq('type', 'gdrive')
    .single()

  const isNewFolder = existing?.folder_id !== folder_id

  await supabase.from('integrations').update({
    folder_id,
    folder_name: folder_name || folder_id,
    ...(isNewFolder ? { imported_ids: [] } : {}),
    updated_at: new Date().toISOString(),
  }).eq('type', 'gdrive')

  return NextResponse.json({ ok: true, folder_id, folder_name })
}
