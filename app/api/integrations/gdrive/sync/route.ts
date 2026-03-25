import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Mux from '@mux/mux-node'

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
})

const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/mov',
]

// ── Token management ──────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to refresh access token')
  return data.access_token
}

async function getValidToken(integration: any, supabase: any): Promise<string> {
  const expiry = new Date(integration.token_expiry || 0)
  const now = new Date()
  const bufferMs = 5 * 60 * 1000 // refresh 5 mins before expiry

  if (expiry.getTime() - now.getTime() > bufferMs) {
    return integration.access_token
  }

  // Refresh the token
  const newToken = await refreshAccessToken(integration.refresh_token)
  const newExpiry = new Date(Date.now() + 3600 * 1000).toISOString()

  await supabase.from('integrations')
    .update({ access_token: newToken, token_expiry: newExpiry })
    .eq('type', 'gdrive')

  return newToken
}

// ── Google Drive API helpers ──────────────────────────────────────────────

async function listDriveFiles(
  folderId: string,
  accessToken: string,
  pageToken?: string
): Promise<{ files: any[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken,files(id,name,mimeType,size,parents,modifiedTime)',
    pageSize: '100',
    orderBy: 'modifiedTime desc',
  })
  if (pageToken) params.set('pageToken', pageToken)

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (data.error) throw new Error(`Drive API error: ${data.error.message}`)
  return data
}

async function getAllVideosInFolder(
  folderId: string,
  accessToken: string,
  folderPath: string = '',
  depth: number = 0
): Promise<{ id: string; name: string; mimeType: string; folderPath: string; creatorHint: string }[]> {
  const maxDepth = 4
  if (depth > maxDepth) return []

  const allVideos: any[] = []
  let pageToken: string | undefined

  do {
    const { files, nextPageToken } = await listDriveFiles(folderId, accessToken, pageToken)
    pageToken = nextPageToken

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Recurse into subfolders
        const subPath = folderPath ? `${folderPath}/${file.name}` : file.name
        const subVideos = await getAllVideosInFolder(file.id, accessToken, subPath, depth + 1)
        allVideos.push(...subVideos)
      } else if (VIDEO_MIME_TYPES.includes(file.mimeType)) {
        // Extract creator hint from immediate parent folder name
        const pathParts = folderPath.split('/')
        const creatorHint = pathParts[pathParts.length - 1] || ''
        allVideos.push({
          id: file.id,
          name: file.name.replace(/\.[^/.]+$/, ''), // strip extension
          mimeType: file.mimeType,
          folderPath,
          creatorHint,
        })
      }
    }
  } while (pageToken)

  return allVideos
}

async function getDriveDownloadUrl(fileId: string, accessToken: string): Promise<string> {
  // Get a short-lived download URL for the file
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'manual' }
  )

  // For large files Google redirects — we use the download URL directly with the token
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`
}

// ── Main sync handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()

  try {
    // 1. Load integration
    const { data: integration, error: intErr } = await supabase
      .from('integrations')
      .select('*')
      .eq('type', 'gdrive')
      .single()

    if (intErr || !integration) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 })
    }

    if (!integration.folder_id) {
      return NextResponse.json({ error: 'No folder selected' }, { status: 400 })
    }

    // 2. Mark as syncing
    await supabase.from('integrations').update({
      sync_status: 'syncing',
      sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('type', 'gdrive')

    // 3. Get valid access token
    const accessToken = await getValidToken(integration, supabase)

    // 4. List all videos in folder (recursive)
    const allVideos = await getAllVideosInFolder(
      integration.folder_id,
      accessToken,
      integration.folder_name || ''
    )

    // 5. Filter out already-imported files
    const importedIds: string[] = integration.imported_ids || []
    const newVideos = allVideos.filter(v => !importedIds.includes(v.id))

    if (newVideos.length === 0) {
      await supabase.from('integrations').update({
        sync_status: 'idle',
        last_synced: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('type', 'gdrive')

      return NextResponse.json({ imported: 0, message: 'No new videos found' })
    }

    // 6. Import each new video via Mux URL upload
    const newlyImported: string[] = []
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    for (const video of newVideos) {
      try {
        const downloadUrl = await getDriveDownloadUrl(video.id, accessToken)

        // Create item in DB first
        const { data: item, error: itemErr } = await supabase
          .from('items')
          .insert({
            type: 'original',
            title: video.name,
            creator: video.creatorHint || '',
            description: `Imported from Google Drive${video.folderPath ? ` (${video.folderPath})` : ''}`,
            mux_status: 'pending',
          })
          .select()
          .single()

        if (itemErr || !item) {
          console.error('Failed to create item for', video.name, itemErr)
          continue
        }

        // Create Mux upload from URL
        const asset = await mux.video.assets.create({
          input: [{ url: downloadUrl }],
          playback_policy: ['public'],
          meta: { item_id: item.id },
        })

        // Update item with Mux asset info
        await supabase.from('items').update({
          mux_asset_id: asset.id,
          mux_status: 'processing',
        }).eq('id', item.id)

        newlyImported.push(video.id)
      } catch (videoErr: any) {
        console.error(`Failed to import ${video.name}:`, videoErr.message)
        // Continue with next video — don't fail the whole sync
      }
    }

    // 7. Update integration with newly imported IDs
    const allImported = [...new Set([...importedIds, ...newlyImported])]
    await supabase.from('integrations').update({
      sync_status: 'idle',
      last_synced: new Date().toISOString(),
      imported_ids: allImported,
      sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('type', 'gdrive')

    return NextResponse.json({
      imported: newlyImported.length,
      skipped: allVideos.length - newlyImported.length,
      total_in_folder: allVideos.length,
    })

  } catch (err: any) {
    console.error('GDrive sync error:', err)

    await supabase.from('integrations').update({
      sync_status: 'error',
      sync_error: err.message,
      updated_at: new Date().toISOString(),
    }).eq('type', 'gdrive').catch(() => {})

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — return current sync status
export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('integrations')
    .select('folder_id,folder_name,last_synced,sync_status,sync_error,imported_ids')
    .eq('type', 'gdrive')
    .single()

  return NextResponse.json(data || { connected: false })
}
