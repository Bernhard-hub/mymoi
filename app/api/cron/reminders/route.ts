import { NextRequest, NextResponse } from 'next/server'
import { getDueReminders, markReminderSent } from '@/lib/supabase'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

// Telegram Nachricht senden
async function sendReminder(telegramId: number, message: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      text: `⏰ *Erinnerung!*\n\n${message}`,
      parse_mode: 'Markdown'
    })
  })
}

// Cron-Job: Wird alle 1-5 Minuten aufgerufen (Vercel Cron)
export async function GET(request: NextRequest) {
  // Optional: Cron Secret prüfen
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Alle fälligen Reminders holen
    const dueReminders = await getDueReminders()

    let sent = 0
    let failed = 0

    for (const reminder of dueReminders) {
      try {
        // Reminder senden
        await sendReminder(reminder.telegram_id, reminder.message)

        // Als gesendet markieren
        await markReminderSent(reminder.id!)

        sent++
      } catch (error) {
        console.error('Failed to send reminder:', reminder.id, error)
        failed++
      }
    }

    return NextResponse.json({
      ok: true,
      processed: dueReminders.length,
      sent,
      failed,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
