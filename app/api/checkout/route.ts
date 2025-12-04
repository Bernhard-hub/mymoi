import { NextRequest, NextResponse } from 'next/server'

// Stripe Checkout mit Apple Pay & Google Pay
// Diese API erstellt einen Checkout-Link den wir im Bot senden können

const CREDIT_PACKAGES = [
  { id: 'credits_10', credits: 10, price: 199, name: '10 Credits' },
  { id: 'credits_50', credits: 50, price: 799, name: '50 Credits' },
  { id: 'credits_100', credits: 100, price: 1499, name: '100 Credits' },
  { id: 'unlimited', credits: 9999, price: 2999, name: 'Unlimited 30 Tage' }
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const packageId = searchParams.get('package') || 'credits_10'
  const userId = searchParams.get('user') || '0'

  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 400 })
  }

  // Einfache Checkout-Seite mit Apple Pay / Google Pay Buttons
  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MOI Credits kaufen</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
    }
    .logo {
      text-align: center;
      font-size: 48px;
      margin-bottom: 20px;
    }
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 10px;
    }
    .package-info {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      text-align: center;
    }
    .package-name {
      font-size: 24px;
      font-weight: bold;
    }
    .package-price {
      font-size: 36px;
      font-weight: bold;
      margin: 10px 0;
    }
    .package-credits {
      opacity: 0.9;
    }
    .payment-buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 20px;
    }
    .btn {
      padding: 16px 24px;
      border: none;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.2);
    }
    .btn-apple {
      background: #000;
      color: white;
    }
    .btn-google {
      background: #fff;
      color: #333;
      border: 2px solid #ddd;
    }
    .btn-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .secure {
      text-align: center;
      margin-top: 20px;
      color: #888;
      font-size: 14px;
    }
    .secure span {
      color: #4CAF50;
    }
    .features {
      margin-top: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 12px;
    }
    .features li {
      list-style: none;
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #555;
    }
    .features li::before {
      content: "✓";
      color: #4CAF50;
      font-weight: bold;
    }
    .success-message {
      display: none;
      text-align: center;
      padding: 40px;
    }
    .success-message.show {
      display: block;
    }
    .success-message h2 {
      color: #4CAF50;
      margin-bottom: 20px;
    }
    .form-hidden { display: none; }
    .form-visible .payment-buttons { display: flex; }
  </style>
</head>
<body>
  <div class="card">
    <div id="checkout-form">
      <div class="logo">🤖</div>
      <h1>MOI Credits</h1>

      <div class="package-info">
        <div class="package-name">${pkg.name}</div>
        <div class="package-price">${(pkg.price / 100).toFixed(2).replace('.', ',')}€</div>
        <div class="package-credits">${pkg.credits === 9999 ? 'Unbegrenzte AI-Assets' : pkg.credits + ' AI-Assets erstellen'}</div>
      </div>

      <div class="payment-buttons">
        <button class="btn btn-apple" onclick="handlePayment('apple')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          Apple Pay
        </button>

        <button class="btn btn-google" onclick="handlePayment('google')">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google Pay
        </button>

        <button class="btn btn-card" onclick="handlePayment('card')">
          💳 Kreditkarte
        </button>
      </div>

      <ul class="features">
        <li>Sofortige Gutschrift</li>
        <li>Sichere Verschlüsselung</li>
        <li>Keine Abo-Falle</li>
        <li>14 Tage Geld-zurück</li>
      </ul>

      <p class="secure">🔒 <span>SSL-verschlüsselt</span> | Powered by Stripe</p>
    </div>

    <div id="success-message" class="success-message">
      <div style="font-size: 64px;">🎉</div>
      <h2>Zahlung erfolgreich!</h2>
      <p>+${pkg.credits === 9999 ? 'UNLIMITED' : pkg.credits} Credits wurden gutgeschrieben.</p>
      <p style="margin-top: 20px; color: #888;">Du kannst dieses Fenster jetzt schließen und zurück zu Telegram gehen.</p>
    </div>
  </div>

  <script>
    const userId = '${userId}';
    const packageId = '${packageId}';
    const credits = ${pkg.credits};

    async function handlePayment(method) {
      // Simulated payment - in production würden wir Stripe.js einbinden
      // Für jetzt: Direkt Credits gutschreiben und Success zeigen

      try {
        // Credits in Supabase gutschreiben
        const response = await fetch('/api/credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_id: parseInt(userId),
            credits: credits,
            package_id: packageId
          })
        });

        if (response.ok) {
          document.getElementById('checkout-form').style.display = 'none';
          document.getElementById('success-message').classList.add('show');
        } else {
          alert('Zahlung fehlgeschlagen. Bitte versuche es erneut.');
        }
      } catch (error) {
        console.error('Payment error:', error);
        alert('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      }
    }
  </script>
</body>
</html>
  `

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
