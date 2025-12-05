import { NextResponse } from 'next/server'
import { isStripeConfigured, createCheckoutSession } from '@/lib/stripe'

export async function GET() {
  const configured = isStripeConfigured()
  const keyPrefix = process.env.STRIPE_SECRET_KEY?.substring(0, 10) || 'NOT SET'

  let sessionTest = null
  let error = null

  if (configured) {
    try {
      const session = await createCheckoutSession(
        'credits_10',
        123456,
        'https://mymoi-bot.vercel.app/api/checkout/success',
        'https://mymoi-bot.vercel.app/api/checkout'
      )
      sessionTest = session ? 'OK - ' + session.url?.substring(0, 50) : 'FAILED'
    } catch (e: any) {
      error = e.message
    }
  }

  return NextResponse.json({
    configured,
    keyPrefix,
    sessionTest,
    error
  })
}
