// Microsoft OAuth - Step 1: Redirect to Microsoft Login
import { NextRequest, NextResponse } from 'next/server'

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const REDIRECT_URI = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/microsoft/callback`
  : 'https://mymoi.app/api/auth/microsoft/callback'

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Files.ReadWrite.All',
  'Mail.ReadWrite',
  'Calendars.ReadWrite',
  'User.Read'
].join(' ')

export async function GET(request: NextRequest) {
  if (!MICROSOFT_CLIENT_ID) {
    return NextResponse.json({
      error: 'Microsoft integration not configured',
      setup: {
        step1: 'Go to https://portal.azure.com/',
        step2: 'Azure Active Directory > App registrations > New registration',
        step3: 'Set redirect URI to: ' + REDIRECT_URI,
        step4: 'Copy Client ID and Client Secret',
        step5: 'Add to Vercel: MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET'
      }
    }, { status: 503 })
  }

  const state = crypto.randomUUID()

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('response_mode', 'query')

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600
  })

  return response
}
