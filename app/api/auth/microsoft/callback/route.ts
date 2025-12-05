import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ============================================
// MICROSOFT OAUTH - Callback
// ============================================
// Microsoft leitet hierher nach erfolgreicher Anmeldung

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect('https://mymoi-bot.vercel.app/?error=auth_failed')
  }

  if (!code) {
    return NextResponse.redirect('https://mymoi-bot.vercel.app/?error=no_code')
  }

  try {
    // State dekodieren (enthält Phone-Nummer)
    let phone: string | null = null
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
        phone = decoded.phone
      } catch {
        // Kein State
      }
    }

    // Token abrufen
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: 'https://mymoi-bot.vercel.app/api/auth/microsoft/callback',
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      console.error('Token error:', await tokenResponse.text())
      return NextResponse.redirect('https://mymoi-bot.vercel.app/?error=token_failed')
    }

    const tokens = await tokenResponse.json()

    // User-Info von Microsoft holen
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    })

    if (!userResponse.ok) {
      return NextResponse.redirect('https://mymoi-bot.vercel.app/?error=user_fetch_failed')
    }

    const user = await userResponse.json()
    const email = user.mail || user.userPrincipalName

    // User-ID generieren (basierend auf Phone oder Email)
    const userId = phone
      ? Math.abs(phone.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
      : Math.abs(email.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0))

    // Token in DB speichern
    await supabase.from('user_email_configs').upsert({
      user_id: userId,
      provider: 'microsoft',
      email: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
      enabled: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })

    console.log(`✅ Microsoft OAuth erfolgreich für ${email}`)

    // Erfolgsseite
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MOI - E-Mail verbunden!</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
            }
            .card {
              background: white;
              border-radius: 16px;
              padding: 40px;
              text-align: center;
              max-width: 400px;
              box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            }
            .emoji { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; line-height: 1.6; }
            .email {
              background: #f0f0f0;
              padding: 10px 20px;
              border-radius: 8px;
              margin: 20px 0;
              font-weight: bold;
            }
            .phone {
              background: #667eea;
              color: white;
              padding: 15px 30px;
              border-radius: 8px;
              font-size: 18px;
              margin-top: 20px;
              display: inline-block;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="emoji">✅</div>
            <h1>E-Mail verbunden!</h1>
            <div class="email">${email}</div>
            <p>
              Du kannst jetzt per Telefon deine E-Mails vorlesen lassen und beantworten!
            </p>
            <a href="tel:+18886642970" class="phone">
              📞 +1 (888) 664-2970
            </a>
            <p style="margin-top: 20px; font-size: 14px;">
              Sage: "Meine E-Mails" um sie vorzulesen
            </p>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    })

  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect('https://mymoi-bot.vercel.app/?error=unknown')
  }
}
