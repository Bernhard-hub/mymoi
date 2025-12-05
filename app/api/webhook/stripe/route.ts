import { NextRequest, NextResponse } from 'next/server'
import { handleWebhookEvent } from '@/lib/stripe'
import { completePayment, supabase } from '@/lib/supabase'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

// Telegram Nachricht senden
async function notifyUser(telegramId: number, message: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      text: message,
      parse_mode: 'Markdown'
    })
  })
}

export async function POST(request: NextRequest) {
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  // Webhook Event verarbeiten
  const result = await handleWebhookEvent(payload, signature)

  if (result) {
    const { telegramId, credits, packageId } = result

    // Credits gutschreiben
    const { data: user } = await supabase
      .from('users')
      .select('credits')
      .eq('telegram_id', telegramId)
      .single()

    if (user) {
      const newCredits = user.credits + credits
      await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('telegram_id', telegramId)

      // User benachrichtigen
      await notifyUser(telegramId, `🎉 *Zahlung erfolgreich!*

+${credits === 9999 ? 'UNLIMITED' : credits} Credits wurden gutgeschrieben!

Du hast jetzt *${credits === 9999 ? 'Unbegrenzte' : newCredits} Credits*.

Viel Spaß mit MOI! 🚀`)
    }
  }

  return NextResponse.json({ received: true })
}
