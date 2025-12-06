import { NextRequest, NextResponse } from 'next/server'

// ============================================
// MICROSOFT OAUTH - Start (ERWEITERT)
// ============================================
// Vollständige Microsoft 365 Integration:
// - Outlook/Hotmail E-Mail
// - OneDrive Dateiverwaltung
// - Word, Excel, PowerPoint API-Zugriff
// - Kalender (Exchange)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone') // Optional: Phone number to link

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const redirectUri = 'https://mymoi-bot.vercel.app/api/auth/microsoft/callback'

  if (!clientId) {
    return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 500 })
  }

  // 🚀 ERWEITERTE SCOPES - Vollständige Microsoft 365 Suite
  const scopes = [
    // === BASIC ===
    'openid',
    'profile',
    'email',
    'offline_access',
    
    // === E-MAIL (Outlook/Exchange) ===
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    
    // === KALENDER ===
    'https://graph.microsoft.com/Calendars.Read',
    'https://graph.microsoft.com/Calendars.ReadWrite',
    
    // === ONEDRIVE - Dateiverwaltung ===
    'https://graph.microsoft.com/Files.Read',
    'https://graph.microsoft.com/Files.ReadWrite',
    'https://graph.microsoft.com/Files.Read.All',
    'https://graph.microsoft.com/Files.ReadWrite.All',
    
    // === SITES (SharePoint falls benötigt) ===
    'https://graph.microsoft.com/Sites.Read.All',
    'https://graph.microsoft.com/Sites.ReadWrite.All'
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
