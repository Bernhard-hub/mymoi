import { NextRequest, NextResponse } from 'next/server'

// ============================================
// GOOGLE OAUTH - Start (ERWEITERT)
// ============================================
// Vollständige Google Workspace Integration:
// - Gmail
// - Google Drive
// - Google Docs, Sheets, Slides
// - Google Calendar

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = 'https://mymoi-bot.vercel.app/api/auth/google/callback'

  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
  }

  // 🚀 ERWEITERTE SCOPES - Vollständige Google Workspace Suite
  const scopes = [
    // === BASIC ===
    'openid',
    'profile',
    'email',
    
    // === GMAIL ===
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    
    // === GOOGLE CALENDAR ===
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    
    // === GOOGLE DRIVE ===
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.metadata',
    
    // === GOOGLE DOCS ===
    'https://www.googleapis.com/auth/documents',
    
    // === GOOGLE SHEETS ===
    'https://www.googleapis.com/auth/spreadsheets',
    
    // === GOOGLE SLIDES ===
    'https://www.googleapis.com/auth/presentations'
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
