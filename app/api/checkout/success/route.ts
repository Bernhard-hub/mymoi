import { NextRequest, NextResponse } from 'next/server'
import { getSessionStatus } from '@/lib/stripe'
import { completePayment } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return new NextResponse('Session ID fehlt', { status: 400 })
  }

  // Session Status prüfen
  const status = await getSessionStatus(sessionId)

  if (!status) {
    return new NextResponse('Session nicht gefunden', { status: 404 })
  }

  let credits = status.credits || 0
  let success = false

  if (status.status === 'paid') {
    // Payment in DB abschließen und Credits gutschreiben
    const payment = await completePayment(sessionId)
    if (payment) {
      credits = payment.credits
      success = true
    }
  }

  // Success Page
  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? 'Zahlung erfolgreich!' : 'Zahlung ausstehend'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, ${success ? '#4CAF50' : '#667eea'} 0%, ${success ? '#45a049' : '#764ba2'} 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #333; margin-bottom: 20px; }
    .credits {
      font-size: 48px;
      font-weight: bold;
      color: ${success ? '#4CAF50' : '#667eea'};
      margin: 20px 0;
    }
    .message {
      color: #666;
      margin: 20px 0;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      padding: 16px 32px;
      background: ${success ? '#4CAF50' : '#667eea'};
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '🎉' : '⏳'}</div>
    <h1>${success ? 'Zahlung erfolgreich!' : 'Zahlung wird verarbeitet...'}</h1>

    ${success ? `
      <div class="credits">+${credits === 9999 ? '∞' : credits}</div>
      <p class="message">
        Deine Credits wurden gutgeschrieben!<br>
        Du kannst dieses Fenster jetzt schließen.
      </p>
    ` : `
      <p class="message">
        Deine Zahlung wird noch verarbeitet.<br>
        Die Credits werden in Kürze gutgeschrieben.
      </p>
    `}

    <a href="https://t.me/MYMOIBot" class="btn">
      ↩️ Zurück zu MOI
    </a>
  </div>
</body>
</html>
  `

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
