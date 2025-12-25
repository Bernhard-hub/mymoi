// Google OAuth - Step 1: Redirect to Google Login
import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const REDIRECT_URI = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`
  : 'https://mymoi.app/api/auth/google/callback'

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/blogger',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/tasks'
].join(' ')

export async function GET(request: NextRequest) {
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({
      error: 'Google integration not configured',
      setup: {
        step1: 'Go to https://console.cloud.google.com/',
        step2: 'Create project, enable Drive/Docs/Sheets/Slides APIs',
        step3: 'Create OAuth 2.0 Client ID',
        step4: 'Add redirect URI: ' + REDIRECT_URI,
        step5: 'Add to Vercel: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'
      }
    }, { status: 503 })
  }

  const state = crypto.randomUUID()

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600
  })

  return response
}
