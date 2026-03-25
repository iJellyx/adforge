import { NextRequest, NextResponse } from 'next/server'

// Redirects the user to Google's OAuth consent screen
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/gdrive/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',  // force refresh_token on every auth
    state: 'gdrive_connect',
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
