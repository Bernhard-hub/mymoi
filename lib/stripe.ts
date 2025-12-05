// ============================================
// STRIPE INTEGRATION - Echte Zahlungen für MOI
// ============================================

import Stripe from 'stripe'

// Lazy initialization
let stripeClient: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key || key === 'YOUR_STRIPE_SECRET_KEY') {
      throw new Error('STRIPE_SECRET_KEY nicht konfiguriert')
    }
    stripeClient = new Stripe(key, { apiVersion: '2025-11-17.clover' })
  }
  return stripeClient
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

// Checkout Session erstellen
export async function createCheckoutSession(
  packageId: string,
  telegramId: number,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutSession | null> {
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
  if (!pkg) return null

  try {
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `MOI ${pkg.name}`,
            description: pkg.description,
            images: ['https://i.imgur.com/MOI_Logo.png'] // TODO: Echtes Logo
          },
          unit_amount: pkg.price
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        telegram_id: telegramId.toString(),
        package_id: packageId,
        credits: pkg.credits.toString()
      },
      // Apple Pay & Google Pay automatisch aktiviert!
      payment_method_options: {
        card: {
          setup_future_usage: 'off_session' // Für spätere Zahlungen speichern
        }
      }
    })

    return {
      url: session.url!,
      sessionId: session.id
    }
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return null
  }
}

// Webhook Event verarbeiten
export async function handleWebhookEvent(
  payload: string | Buffer,
  signature: string
): Promise<{ telegramId: number; credits: number; packageId: string } | null> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret || webhookSecret === 'YOUR_STRIPE_WEBHOOK_SECRET') {
    console.error('STRIPE_WEBHOOK_SECRET nicht konfiguriert')
    return null
  }

  try {
    const stripe = getStripe()
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      const telegramId = parseInt(session.metadata?.telegram_id || '0')
      const credits = parseInt(session.metadata?.credits || '0')
      const packageId = session.metadata?.package_id || ''

      if (telegramId && credits) {
        return { telegramId, credits, packageId }
      }
    }

    return null
  } catch (error) {
    console.error('Webhook verification failed:', error)
    return null
  }
}

// Session Status prüfen (für Polling-Fallback)
export async function getSessionStatus(sessionId: string): Promise<{
  status: 'paid' | 'unpaid' | 'expired'
  telegramId?: number
  credits?: number
} | null> {
  try {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

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

// Prüfen ob Stripe konfiguriert ist
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY
  return !!key && key !== 'YOUR_STRIPE_SECRET_KEY'
}
