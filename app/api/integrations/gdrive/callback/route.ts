import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const supabase = createServiceClient()

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/dashboard?gdrive=error&reason=${error || 'no_code'}`)
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${appUrl}/api/integrations/gdrive/callback`,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()

    if (tokens.error) {
      console.error('Token exchange error:', tokens)
      return NextResponse.redirect(`${appUrl}/dashboard?gdrive=error&reason=token_exchange`)
    }

    const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()

    // Upsert integration record
    await supabase.from('integrations').upsert({
      type: 'gdrive',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      sync_status: 'idle',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'type' })

    // Redirect to dashboard with success — folder picker will open
    return NextResponse.redirect(`${appUrl}/dashboard?gdrive=connected`)

  } catch (err: any) {
    console.error('GDrive callback error:', err)
    return NextResponse.redirect(`${appUrl}/dashboard?gdrive=error&reason=server_error`)
  }
}
