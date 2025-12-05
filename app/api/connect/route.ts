import { NextRequest, NextResponse } from 'next/server'

// ============================================
// CONNECT - Einfacher Verbindungslink für User
// ============================================
// User ruft diese URL auf um Email/Kalender zu verbinden
// Sendet dann Link per SMS mit einem Klick

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  const service = searchParams.get('service') // 'google' oder 'microsoft'

  if (!phone) {
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MOI - Verbinden</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, sans-serif;
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
              border-radius: 20px;
              padding: 40px;
              max-width: 400px;
              text-align: center;
              box-shadow: 0 20px 50px rgba(0,0,0,0.3);
            }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; line-height: 1.6; }
            .btn {
              display: block;
              padding: 16px 30px;
              margin: 15px 0;
              border-radius: 12px;
              text-decoration: none;
              font-weight: bold;
              font-size: 16px;
              transition: transform 0.2s;
            }
            .btn:hover { transform: scale(1.02); }
            .google { background: #4285f4; color: white; }
            .microsoft { background: #00a4ef; color: white; }
            .phone-input {
              padding: 15px;
              border: 2px solid #ddd;
              border-radius: 10px;
              width: 100%;
              font-size: 16px;
              margin-bottom: 20px;
              box-sizing: border-box;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div style="font-size: 60px; margin-bottom: 20px;">📱</div>
            <h1>Mit MOI verbinden</h1>
            <p>Verbinde deinen Kalender und E-Mail um MOI per Telefon nutzen zu können.</p>

            <form method="GET" style="margin-top: 30px;">
              <input type="tel" name="phone" class="phone-input" placeholder="Deine Telefonnummer" required>

              <button type="submit" name="service" value="google" class="btn google">
                📧 Gmail & Google Kalender
              </button>

              <button type="submit" name="service" value="microsoft" class="btn microsoft">
                📧 Outlook & Microsoft Kalender
              </button>
            </form>

            <p style="margin-top: 30px; font-size: 14px; color: #999;">
              Nach der Verbindung kannst du per Telefon:<br>
              • E-Mails vorlesen lassen<br>
              • E-Mails beantworten<br>
              • Termine verwalten
            </p>
          </div>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  // Redirect zu OAuth
  const baseUrl = 'https://mymoi-bot.vercel.app'

  if (service === 'google') {
    return NextResponse.redirect(`${baseUrl}/api/auth/google?phone=${encodeURIComponent(phone)}`)
  } else if (service === 'microsoft') {
    return NextResponse.redirect(`${baseUrl}/api/auth/microsoft?phone=${encodeURIComponent(phone)}`)
  }

  // Default: zeige Auswahl
  return NextResponse.redirect(`${baseUrl}/api/connect`)
}
