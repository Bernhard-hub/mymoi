import { NextRequest, NextResponse } from 'next/server'

// ============================================
// MICROSOFT OAUTH - Start
// ============================================
// Leitet User zu Microsoft Login weiter

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone') // Optional: Phone number to link

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const redirectUri = 'https://mymoi-bot.vercel.app/api/auth/microsoft/callback'

  if (!clientId) {
    return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 500 })
  }

  // Scopes für E-Mail-Zugriff
  const scopes = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send'
  ].join(' ')

  // State enthält Phone-Nummer für spätere Zuordnung
  const state = phone ? Buffer.from(JSON.stringify({ phone })).toString('base64') : ''

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scopes)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('response_mode', 'query')

  return NextResponse.redirect(authUrl.toString())
}
