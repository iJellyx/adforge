import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth'

/**
 * GET /api/my-ads?workspace_id=...&kind=video|static|all
 *
 * Reads from the unified `my_ads` view, scoped to one brand. Returns:
 *   { ads: [{ kind, id, title, preview_url, folder_id, ... }] }
 *
 * Folder grouping is computed client-side from `folder_id`, with
 * folders fetched separately so we can show empty system folders too.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspace_id')
  const kindFilter = url.searchParams.get('kind') || 'all'
  if (!workspaceId) return NextResponse.json({ error: 'workspace_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify the user owns this brand_card
  const { data: bc } = await supabase
    .from('brand_cards').select('user_id').eq('id', workspaceId).maybeSingle()
  if (!bc || bc.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Ensure the system folders exist so the page never renders an empty tree
  await supabase.rpc('ensure_my_ads_roots', { p_workspace_id: workspaceId })

  let query = supabase.from('my_ads').select('*').eq('workspace_id', workspaceId)
  if (kindFilter === 'video' || kindFilter === 'static') {
    query = query.eq('kind', kindFilter)
  }
  const { data: ads, error } = await query.order('saved_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Folders for this brand (kind='ads')
  const { data: folders } = await supabase
    .from('folders')
    .select('id, name, parent_id, is_system, kind')
    .eq('workspace_id', workspaceId)
    .eq('kind', 'ads')

  return NextResponse.json({ ads: ads || [], folders: folders || [] })
}
