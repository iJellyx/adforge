import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/music/upload
 * FormData: file (mp3 / wav / m4a / ogg)
 * Returns: { url, name, duration? }
 *
 * Uploads a user-supplied music track to Supabase storage so it can be used
 * in ad renders. The returned public URL is compatible with Shotstack (same
 * pattern we use for Pixabay tracks).
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    // Accept common audio formats
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/webm']
    if (file.type && !allowed.includes(file.type.toLowerCase())) {
      return NextResponse.json({ error: `Unsupported audio type: ${file.type}. Please upload MP3, WAV, M4A, or OGG.` }, { status: 400 })
    }

    // 25 MB cap
    const MAX_BYTES = 25 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 25MB.` }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Derive a safe filename with original extension
    const origName = (file.name || 'track').replace(/[^a-zA-Z0-9._-]/g, '_')
    const ext = origName.includes('.') ? origName.split('.').pop() : 'mp3'
    const filename = `music_${Date.now()}_${origName.slice(0, 60)}`

    // Use a dedicated 'music' bucket. Fall back to 'voiceovers' if the bucket
    // doesn't exist yet (user hasn't run the migration).
    let bucket = 'music'
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filename, file, { contentType: file.type || 'audio/mpeg', upsert: true })

    if (uploadError) {
      // Retry with voiceovers bucket if music bucket missing
      if ((uploadError.message || '').toLowerCase().includes('bucket') || (uploadError.message || '').toLowerCase().includes('not found')) {
        bucket = 'voiceovers'
        const fallbackName = `music_${filename}`
        const { error: retryError } = await supabase.storage
          .from(bucket)
          .upload(fallbackName, file, { contentType: file.type || 'audio/mpeg', upsert: true })
        if (retryError) return NextResponse.json({ error: retryError.message, hint: 'Create a "music" bucket in Supabase storage for best performance.' }, { status: 500 })
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fallbackName)
        return NextResponse.json({ url: urlData.publicUrl, name: origName.replace(/\.[^.]+$/, ''), bucket })
      }
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filename)
    return NextResponse.json({ url: urlData.publicUrl, name: origName.replace(/\.[^.]+$/, ''), bucket })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
