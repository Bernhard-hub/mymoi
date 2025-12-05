import { NextResponse } from 'next/server'
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe'

export async function GET() {
  const configured = isStripeConfigured()
  const keyPrefix = process.env.STRIPE_SECRET_KEY?.substring(0, 15) || 'NOT SET'

  let sessionTest = null
  let sessionUrl = null
  let error = null

  if (configured) {
    try {
      const session = await createCheckoutSession(
        'credits_10',
        123456,
        'https://mymoi-bot.vercel.app/api/checkout/success',
        'https://mymoi-bot.vercel.app/'
      )

      if (session) {
        sessionTest = 'OK'
        sessionUrl = session.url
      } else {
        sessionTest = 'FAILED'
      }
    } catch (e: any) {
      error = e.message
      sessionTest = 'ERROR'
    }
  }

  return NextResponse.json({
    configured,
    keyPrefix,
    sessionTest,
    sessionUrl,
    error
  })
}
