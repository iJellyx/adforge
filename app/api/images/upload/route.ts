import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/images/upload
 *
 * FormData body:
 *   - file (one or many — accepts repeated 'file' entries)
 *   - workspace_id  (brand_card.id this image belongs to)
 *   - folder_id     (optional — assign to a Stash folder on upload)
 *
 * For each file:
 *   1. Validate type + size
 *   2. Probe dimensions via sharp
 *   3. Upload to the `stash-images` bucket
 *   4. Insert items row with kind='image'
 *
 * Returns: { items: Item[] }
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const workspaceId = formData.get('workspace_id') as string | null
  const folderId = formData.get('folder_id') as string | null
  if (!workspaceId) return NextResponse.json({ error: 'workspace_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify the user owns this brand
  const { data: brand } = await supabase
    .from('brand_cards').select('user_id').eq('id', workspaceId).maybeSingle()
  if (!brand || brand.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const files = formData.getAll('file').filter(f => f instanceof File) as File[]
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const items: any[] = []
  const errors: string[] = []

  for (const file of files) {
    try {
      // Basic validation — bucket has its own MIME + size limits but we
      // surface a useful error instead of letting Supabase return a generic 400.
      if (!file.type.startsWith('image/')) {
        errors.push(`${file.name}: not an image (${file.type})`)
        continue
      }
      if (file.size > 20 * 1024 * 1024) {
        errors.push(`${file.name}: too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 20MB)`)
        continue
      }

      const arrayBuffer = await file.arrayBuffer()
      const buf = Buffer.from(arrayBuffer)

      // Dimensions are probed client-side and passed as paired form fields:
      //   FormData entries:  file=<File>, width=1920, height=1080, ...
      // We use the index in the files list as the implicit pairing key.
      // Failing-to-probe is non-fatal — we just store NULL.
      const idx = items.length + errors.length
      const widthRaw = formData.get(`width_${idx}`)
      const heightRaw = formData.get(`height_${idx}`)
      const width = widthRaw ? Number(widthRaw) || null : null
      const height = heightRaw ? Number(heightRaw) || null : null
      // PNG/WebP/GIF + SVG can have transparency; cheap heuristic
      const hasAlpha = ['image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)

      // Upload — path namespaced by workspace so we can audit/clean up later
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
      const path = `${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
      const upload = await supabase.storage
        .from('stash-images')
        .upload(path, buf, { contentType: file.type, upsert: false })
      if (upload.error) {
        errors.push(`${file.name}: ${upload.error.message}`)
        continue
      }
      const { data: pub } = supabase.storage.from('stash-images').getPublicUrl(path)

      // Insert items row
      const { data: row, error: insertErr } = await supabase
        .from('items')
        .insert({
          workspace_id: workspaceId,
          type: 'image',
          title: file.name,
          src_url: pub.publicUrl,
          width,
          height,
          has_alpha: hasAlpha,
          folder_id: folderId || null,
          user_id: userId,
          mux_status: 'ready',         // not Mux-backed but UI looks at this for "is this ready to show"
          status: 'ready',
        })
        .select()
        .single()
      if (insertErr) {
        errors.push(`${file.name}: ${insertErr.message}`)
        continue
      }
      items.push(row)
    } catch (e: any) {
      console.error('[images/upload] unexpected error:', e?.message)
      errors.push(`${file.name}: ${e?.message || 'unknown error'}`)
    }
  }

  return NextResponse.json({ items, errors })
}
