import { NextRequest, NextResponse } from 'next/server'

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1449116887928672356'
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || ''
const REDIRECT_URI = 'https://mymoi-bot.vercel.app/api/auth/discord/callback'

// Store user tokens (in production: use Supabase)
const userDiscordTokens = new Map<string, string>()

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return new NextResponse(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Autorisierung abgebrochen</h1>
          <p>Du hast die Discord-Autorisierung abgebrochen.</p>
          <p><a href="https://t.me/mikimoibot">Zurück zum Telegram Bot</a></p>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  if (!code) {
    return new NextResponse('Missing code', { status: 400 })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      })
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Token exchange failed:', errorData)
      throw new Error(`Token exchange failed: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!userResponse.ok) {
      throw new Error('Failed to get user info')
    }

    const userData = await userResponse.json()

    // Store token for this user
    userDiscordTokens.set(userData.id, accessToken)

    // Send confirmation to Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ''

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `✅ *Discord autorisiert!*

User: ${userData.username}
ID: ${userData.id}

Ich kann jetzt für dich Discord-Servern beitreten!

Teste mit: \`/find research\``,
        parse_mode: 'Markdown'
      })
    })

    return new NextResponse(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui; padding: 40px; text-align: center; background: #1a1a2e; color: white; }
            .success { color: #4ade80; font-size: 48px; }
            h1 { margin-top: 20px; }
            a { color: #60a5fa; }
          </style>
        </head>
        <body>
          <div class="success">✅</div>
          <h1>Discord verbunden!</h1>
          <p>Hallo <strong>${userData.username}</strong>!</p>
          <p>Der Bot kann jetzt für dich Discord-Servern beitreten.</p>
          <p><a href="https://t.me/mikimoibot">Zurück zum Telegram Bot</a></p>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })

  } catch (error: any) {
    console.error('Discord OAuth error:', error)
    return new NextResponse(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Fehler</h1>
          <p>Discord-Autorisierung fehlgeschlagen.</p>
          <p>Error: ${error?.message || 'Unknown'}</p>
          <p><a href="https://discord.com/oauth2/authorize?client_id=1449116887928672356&scope=guilds.join%20identify&response_type=code&redirect_uri=https://mymoi-bot.vercel.app/api/auth/discord/callback">Erneut versuchen</a></p>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }
}

