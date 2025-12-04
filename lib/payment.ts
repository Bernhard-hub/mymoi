// Telegram Payment mit Stripe
// Telegram hat eingebaute Payments - einfach über sendInvoice!

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const STRIPE_PROVIDER_TOKEN = process.env.STRIPE_PROVIDER_TOKEN! // Telegram Stripe Provider Token
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`

// Credit Pakete
export const CREDIT_PACKAGES = [
  { id: 'credits_10', credits: 10, price: 199, label: '10 Credits', description: '10 AI-Assets erstellen' },
  { id: 'credits_50', credits: 50, price: 799, label: '50 Credits', description: '50 AI-Assets erstellen + 10% Bonus' },
  { id: 'credits_100', credits: 100, price: 1499, label: '100 Credits', description: '100 AI-Assets erstellen + 20% Bonus' },
  { id: 'unlimited', credits: 9999, price: 2999, label: 'Unlimited (30 Tage)', description: 'Unbegrenzte AI-Assets für 30 Tage' }
]

// Invoice senden (Telegram native payment)
export async function sendInvoice(chatId: number, packageId: string) {
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
  if (!pkg) throw new Error('Package not found')

  const payload = JSON.stringify({ package_id: packageId, credits: pkg.credits })

  const response = await fetch(`${TELEGRAM_API}/sendInvoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      title: pkg.label,
      description: pkg.description,
      payload: payload,
      provider_token: STRIPE_PROVIDER_TOKEN,
      currency: 'EUR',
      prices: [{ label: pkg.label, amount: pkg.price }], // amount in cents
      start_parameter: packageId,
      // Photo optional
      photo_url: 'https://i.imgur.com/MOI_Credits.png',
      photo_width: 512,
      photo_height: 512,
      need_name: false,
      need_email: false,
      need_phone_number: false,
      need_shipping_address: false,
      is_flexible: false
    })
  })

  return response.json()
}

// Pre-Checkout Query beantworten (MUSS innerhalb 10 Sekunden erfolgen!)
export async function answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string) {
  const response = await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pre_checkout_query_id: preCheckoutQueryId,
      ok: ok,
      error_message: errorMessage
    })
  })

  return response.json()
}

// Payment Menu senden mit Checkout Links
export async function sendPaymentMenu(chatId: number, userId?: number) {
  const baseUrl = process.env.VERCEL_URL || 'mymoi-bot.vercel.app'
  const userParam = userId ? `&user=${userId}` : `&user=${chatId}`

  const keyboard = {
    inline_keyboard: [
      [{ text: '💎 10 Credits - 1,99€', url: `https://${baseUrl}/api/checkout?package=credits_10${userParam}` }],
      [{ text: '💎 50 Credits - 7,99€', url: `https://${baseUrl}/api/checkout?package=credits_50${userParam}` }],
      [{ text: '💎 100 Credits - 14,99€', url: `https://${baseUrl}/api/checkout?package=credits_100${userParam}` }],
      [{ text: '🚀 UNLIMITED - 29,99€', url: `https://${baseUrl}/api/checkout?package=unlimited${userParam}` }]
    ]
  }

  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `💳 *Credits kaufen*

Wähle dein Paket:

💎 *10 Credits* - 1,99€
_Perfekt zum Ausprobieren_

💎 *50 Credits* - 7,99€
_10% mehr Credits als Bonus!_

💎 *100 Credits* - 14,99€
_20% mehr Credits als Bonus!_

🚀 *UNLIMITED* - 29,99€/Monat
_Unbegrenzte AI-Power für 30 Tage!_

 Apple Pay |  Google Pay | 💳 Kreditkarte
✅ Sofortige Gutschrift
✅ Keine Abo-Falle
🔒 SSL-verschlüsselt`,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  })

  return response.json()
}

// Credits nach erfolgreicher Zahlung gutschreiben
export async function processSuccessfulPayment(telegramId: number, payload: string): Promise<number> {
  try {
    const data = JSON.parse(payload)
    return data.credits || 0
  } catch {
    return 0
  }
}
