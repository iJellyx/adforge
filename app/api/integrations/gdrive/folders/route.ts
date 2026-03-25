import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

async function getValidToken(integration: any, supabase: any): Promise<string> {
  const expiry = new Date(integration.token_expiry || 0)
  const bufferMs = 5 * 60 * 1000

  if (expiry.getTime() - Date.now() > bufferMs) {
    return integration.access_token
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: integration.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Token refresh failed')

  const newExpiry = new Date(Date.now() + 3600 * 1000).toISOString()
  await supabase.from('integrations')
    .update({ access_token: data.access_token, token_expiry: newExpiry })
    .eq('type', 'gdrive')

  return data.access_token
}

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const parentId = searchParams.get('parent') || 'root'

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('type', 'gdrive')
    .single()

  if (!integration?.access_token) {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  }

  try {
    const accessToken = await getValidToken(integration, supabase)

    const params = new URLSearchParams({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'name',
      pageSize: '100',
    })

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json()

    if (data.error) throw new Error(data.error.message)

    return NextResponse.json({ folders: data.files || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
