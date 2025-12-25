// Microsoft OAuth Callback
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!
const REDIRECT_URI = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/microsoft/callback`
  : 'https://mymoi.app/api/auth/microsoft/callback'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url))
  }

  const storedState = request.cookies.get('oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url))
  }

  try {
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text())
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url))
    }

    const tokens = await tokenResponse.json()

    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    })
    const userData = await userResponse.json()

    await supabase.from('oauth_tokens').upsert({
      provider: 'microsoft',
      email: userData.mail || userData.userPrincipalName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      user_data: userData,
      updated_at: new Date().toISOString()
    }, { onConflict: 'provider,email' })

    const response = NextResponse.redirect(new URL('/?connected=microsoft', request.url))
    response.cookies.delete('oauth_state')
    response.cookies.set('moi_user', userData.mail || userData.userPrincipalName, {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30
    })
    response.cookies.set('moi_ms_connected', 'true', {
      httpOnly: false, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30
    })

    return response
  } catch (error) {
    console.error('OAuth error:', error)
    return NextResponse.redirect(new URL('/?error=oauth_failed', request.url))
  }
}
