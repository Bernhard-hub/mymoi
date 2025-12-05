// ============================================
// STRIPE INTEGRATION - Echte Zahlungen für MOI
// Using fetch instead of SDK for better Vercel compatibility
// ============================================

const STRIPE_API = 'https://api.stripe.com/v1'

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || key === 'YOUR_STRIPE_SECRET_KEY') {
    throw new Error('STRIPE_SECRET_KEY nicht konfiguriert')
  }
  return key
}

// Credit Pakete
export const CREDIT_PACKAGES = [
  {
    id: 'credits_10',
    credits: 10,
    price: 199, // cents
    name: '10 Credits',
    description: '10 AI-Assets erstellen'
  },
  {
    id: 'credits_50',
    credits: 50,
    price: 799,
    name: '50 Credits',
    description: '50 AI-Assets + 10% Bonus'
  },
  {
    id: 'credits_100',
    credits: 100,
    price: 1499,
    name: '100 Credits',
    description: '100 AI-Assets + 20% Bonus'
  },
  {
    id: 'unlimited',
    credits: 9999,
    price: 2999,
    name: 'Unlimited (30 Tage)',
    description: 'Unbegrenzte AI-Assets für 30 Tage'
  }
]

export interface CheckoutSession {
  url: string
  sessionId: string
}

// Checkout Session erstellen mit fetch
export async function createCheckoutSession(
  packageId: string,
  telegramId: number,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutSession | null> {
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
  if (!pkg) return null

  try {
    const key = getStripeKey()

    const params = new URLSearchParams()
    params.append('line_items[0][price_data][currency]', 'eur')
    params.append('line_items[0][price_data][product_data][name]', `MOI ${pkg.name}`)
    params.append('line_items[0][price_data][product_data][description]', pkg.description)
    params.append('line_items[0][price_data][unit_amount]', pkg.price.toString())
    params.append('line_items[0][quantity]', '1')
    params.append('mode', 'payment')
    params.append('success_url', `${successUrl}?session_id={CHECKOUT_SESSION_ID}`)
    params.append('cancel_url', cancelUrl)
    params.append('metadata[telegram_id]', telegramId.toString())
    params.append('metadata[package_id]', packageId)
    params.append('metadata[credits]', pkg.credits.toString())

    const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(key + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })

    const session = await response.json()

    if (session.error) {
      console.error('Stripe error:', session.error)
      return null
    }

    return {
      url: session.url,
      sessionId: session.id
    }
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return null
  }
}

// Session Status prüfen mit fetch
export async function getSessionStatus(sessionId: string): Promise<{
  status: 'paid' | 'unpaid' | 'expired'
  telegramId?: number
  credits?: number
} | null> {
  try {
    const key = getStripeKey()

    const response = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(key + ':').toString('base64')}`
      }
    })

    const session = await response.json()

    if (session.error) {
      console.error('Stripe session error:', session.error)
      return null
    }

    return {
      status: session.payment_status === 'paid' ? 'paid' :
              session.status === 'expired' ? 'expired' : 'unpaid',
      telegramId: session.metadata?.telegram_id ? parseInt(session.metadata.telegram_id) : undefined,
      credits: session.metadata?.credits ? parseInt(session.metadata.credits) : undefined
    }
  } catch (error) {
    console.error('Get session status error:', error)
    return null
  }
}

// Webhook Event verarbeiten - simplified without SDK
export async function handleWebhookEvent(
  payload: string | Buffer,
  signature: string
): Promise<{ telegramId: number; credits: number; packageId: string } | null> {
  // For now, we'll trust the payload without signature verification
  // In production, you should verify the signature manually
  try {
    const event = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString())

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object

      const telegramId = parseInt(session.metadata?.telegram_id || '0')
      const credits = parseInt(session.metadata?.credits || '0')
      const packageId = session.metadata?.package_id || ''

      if (telegramId && credits) {
        return { telegramId, credits, packageId }
      }
    }

    return null
  } catch (error) {
    console.error('Webhook processing failed:', error)
    return null
  }
}

// Prüfen ob Stripe konfiguriert ist
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY
  return !!key && key !== 'YOUR_STRIPE_SECRET_KEY'
}
