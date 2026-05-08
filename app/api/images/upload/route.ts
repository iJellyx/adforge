import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

      // Fire-and-forget AI tagging — keeps the upload response snappy.
      // Failures here don't surface to the user; image still uploads fine,
      // it just won't have searchable tags. Tags get filled in async.
      if (process.env.GOOGLE_AI_API_KEY && row.id) {
        tagImageInBackground(row.id, buf, file.type).catch(e => {
          console.error('[images/upload] background tag failed for', row.id, ':', e?.message)
        })
      }
    } catch (e: any) {
      console.error('[images/upload] unexpected error:', e?.message)
      errors.push(`${file.name}: ${e?.message || 'unknown error'}`)
    }
  }

  return NextResponse.json({ items, errors })
}

/**
 * Background helper — runs Gemini Vision on the uploaded image and writes
 * the result to items.analysis. Best-effort: any error is logged and
 * swallowed so the upload itself isn't held up.
 *
 * Output schema written to items.analysis:
 *   {
 *     subject_type: 'logo' | 'product' | 'lifestyle' | 'graphic' | 'portrait' | 'other',
 *     summary: string,                  // 1 sentence
 *     scene_tags: string[],             // 5-8 specific visual tags for search
 *     dominant_colors: string[],        // 3-5 hex codes
 *     has_text: boolean,
 *     text_content: string,             // OCR'd text if has_text
 *     mood: string,                     // 'energetic' | 'calm' | 'premium' | etc.
 *   }
 */
async function tagImageInBackground(itemId: string, buffer: Buffer, contentType: string) {
  const supabase = createServiceClient()
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const base64 = buffer.toString('base64')
  const mimeType = contentType.startsWith('image/') ? contentType : 'image/jpeg'

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      `Analyse this brand asset image. Return ONLY valid JSON, no markdown:
{
  "subject_type": "logo|product|lifestyle|graphic|portrait|other",
  "summary": "one specific sentence describing what this image is",
  "scene_tags": ["5-8 specific search tags — what's literally shown, e.g. 'green bottle on white background', 'minimalist sans-serif logo', 'female model holding skincare jar'"],
  "dominant_colors": ["3-5 hex codes representing the most prominent colours"],
  "has_text": true,
  "text_content": "exact text visible in the image, or empty string",
  "mood": "energetic|calm|premium|playful|clinical|minimal|bold|soft|warm|cool"
}

Be ruthlessly specific in scene_tags — vague tags like 'product' or 'photo' are useless. Tags should let someone search for this specific image among hundreds.`,
    ])
    const raw = result.response.text()
    let parsed: any = null
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      console.warn('[tag-image] non-JSON Gemini response for', itemId)
      return
    }
    // Persist
    await supabase.from('items').update({
      analysis: {
        ...parsed,
        tagged_at: new Date().toISOString(),
        tagged_by: 'gemini-2.0-flash',
      },
    }).eq('id', itemId)
  } catch (e: any) {
    console.error('[tag-image] gemini call failed for', itemId, ':', e?.message)
  }
}
