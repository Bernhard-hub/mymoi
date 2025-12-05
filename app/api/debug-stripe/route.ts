import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY
  const keyPrefix = key?.substring(0, 15) || 'NOT SET'

  let sessionTest = null
  let error = null
  let sessionUrl = null

  if (key && key.startsWith('sk_')) {
    try {
      const stripe = new Stripe(key, { apiVersion: '2025-11-17.clover' })

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'MOI 10 Credits',
              description: 'Test'
            },
            unit_amount: 199
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: 'https://mymoi-bot.vercel.app/api/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://mymoi-bot.vercel.app/',
        metadata: {
          telegram_id: '123456',
          credits: '10'
        }
      })

      sessionTest = 'OK'
      sessionUrl = session.url
    } catch (e: any) {
      error = e.message || String(e)
      sessionTest = 'FAILED'
    }
  }

  return NextResponse.json({
    keyPrefix,
    sessionTest,
    sessionUrl,
    error
  })
}
