// ============================================
// TELEGRAM STARS PAYMENT - One-Click im Chat!
// ============================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`

// Credit Pakete mit Telegram Stars
// 1 Star ≈ 0.02€ (User zahlt ~0.02€ pro Star)
// Preise in Stars (nicht Cents!)
export const CREDIT_PACKAGES = [
  { id: 'credits_10', credits: 10, stars: 100, euroPrice: '~1,99€', label: '⭐ 10 Credits', description: '10 AI-Assets erstellen' },
  { id: 'credits_50', credits: 50, stars: 400, euroPrice: '~7,99€', label: '⭐ 50 Credits', description: '50 AI-Assets + 10% Bonus' },
  { id: 'credits_100', credits: 100, stars: 750, euroPrice: '~14,99€', label: '⭐ 100 Credits', description: '100 AI-Assets + 20% Bonus' },
  { id: 'unlimited', credits: 9999, stars: 1500, euroPrice: '~29,99€', label: '🚀 UNLIMITED', description: 'Unbegrenzte AI-Assets für 30 Tage' }
]

// Stripe Checkout URLs (Fallback für größere Beträge)
const STRIPE_PACKAGES = [
  { id: 'credits_10', credits: 10, price: 199, label: '10 Credits - 1,99€' },
  { id: 'credits_50', credits: 50, price: 799, label: '50 Credits - 7,99€' },
  { id: 'credits_100', credits: 100, price: 1499, label: '100 Credits - 14,99€' },
  { id: 'unlimited', credits: 9999, price: 2999, label: 'Unlimited - 29,99€' }
]

// ============================================
// TELEGRAM STARS INVOICE (One-Click!)
// ============================================
export async function sendStarsInvoice(chatId: number, packageId: string) {
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
  if (!pkg) throw new Error('Package not found')

  const payload = JSON.stringify({ package_id: packageId, credits: pkg.credits })

  // Telegram Stars Invoice - provider_token muss LEER sein für Stars!
  const response = await fetch(`${TELEGRAM_API}/sendInvoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      title: `MOI ${pkg.label}`,
      description: pkg.description,
      payload: payload,
      provider_token: '', // LEER für Telegram Stars!
      currency: 'XTR', // XTR = Telegram Stars
      prices: [{ label: pkg.label, amount: pkg.stars }],
      start_parameter: packageId
    })
  })

  const result = await response.json()
  console.log('Stars invoice result:', JSON.stringify(result))
  return result
}

// ============================================
// PRE-CHECKOUT QUERY BEANTWORTEN
// ============================================
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

// ============================================
// PAYMENT MENU - Stars + Stripe Option
// ============================================
export async function sendPaymentMenu(chatId: number, userId?: number) {
  const baseUrl = 'mymoi-bot.vercel.app'
  const userParam = userId ? `&user=${userId}` : `&user=${chatId}`

  // Inline Keyboard mit Stars-Buttons (callback_data) + Stripe Link
  const keyboard = {
    inline_keyboard: [
      [{ text: '⭐ 10 Credits (100 Stars)', callback_data: 'stars_credits_10' }],
      [{ text: '⭐ 50 Credits (400 Stars)', callback_data: 'stars_credits_50' }],
      [{ text: '⭐ 100 Credits (750 Stars)', callback_data: 'stars_credits_100' }],
      [{ text: '🚀 UNLIMITED (1500 Stars)', callback_data: 'stars_unlimited' }],
      [{ text: '💳 Mit Kreditkarte zahlen', url: `https://${baseUrl}/api/checkout?package=credits_10${userParam}` }]
    ]
  }

  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `💎 *Credits kaufen*

⭐ *Telegram Stars* (One-Click!)
_Direkt hier bezahlen - kein Redirect!_

⭐ 10 Credits = 100 Stars (~1,99€)
⭐ 50 Credits = 400 Stars (~7,99€)
⭐ 100 Credits = 750 Stars (~14,99€)
🚀 UNLIMITED = 1500 Stars (~29,99€)

━━━━━━━━━━━━━━━
✅ One-Click Payment
✅ Apple Pay / Google Pay
✅ Sofortige Gutschrift
✅ Kein Abo - Keine Falle`,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  })

  return response.json()
}

// ============================================
// ERFOLGREICHE ZAHLUNG VERARBEITEN
// ============================================
export async function processSuccessfulPayment(telegramId: number, payload: string): Promise<number> {
  try {
    const data = JSON.parse(payload)
    return data.credits || 0
  } catch {
    return 0
  }
}

// Legacy export für Kompatibilität
export async function sendInvoice(chatId: number, packageId: string) {
  return sendStarsInvoice(chatId, packageId)
}

export { STRIPE_PACKAGES }
