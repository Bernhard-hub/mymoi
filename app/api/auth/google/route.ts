import { NextRequest, NextResponse } from 'next/server'

// ============================================
// GOOGLE OAUTH - Start
// ============================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = 'https://mymoi-bot.vercel.app/api/auth/google/callback'

  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
  }

  const scopes = [
    'openid',
    'profile',
    'email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
  ].join(' ')

  const state = phone ? Buffer.from(JSON.stringify({ phone })).toString('base64') : ''

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scopes)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  return NextResponse.redirect(authUrl.toString())
}
