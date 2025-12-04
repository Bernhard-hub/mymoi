import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Credits gutschreiben nach erfolgreicher Zahlung
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { telegram_id, credits, package_id } = body

    if (!telegram_id || !credits) {
      return NextResponse.json({ error: 'Missing telegram_id or credits' }, { status: 400 })
    }

    // Aktuellen User holen
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('credits')
      .eq('telegram_id', telegram_id)
      .single()

    if (fetchError || !user) {
      // User existiert nicht, anlegen
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegram_id,
          credits: credits,
          created_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Insert error:', insertError)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }

      // Zahlung protokollieren
      await supabase.from('payments').insert({
        telegram_id: telegram_id,
        package_id: package_id,
        credits: credits,
        status: 'completed',
        created_at: new Date().toISOString()
      })

      return NextResponse.json({
        success: true,
        credits: credits,
        message: `${credits} Credits gutgeschrieben!`
      })
    }

    // Credits aktualisieren
    const newCredits = user.credits + credits
    const { error: updateError } = await supabase
      .from('users')
      .update({ credits: newCredits })
      .eq('telegram_id', telegram_id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 })
    }

    // Zahlung protokollieren
    await supabase.from('payments').insert({
      telegram_id: telegram_id,
      package_id: package_id,
      credits: credits,
      status: 'completed',
      created_at: new Date().toISOString()
    })

    // Telegram Benachrichtigung senden
    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    if (TELEGRAM_TOKEN) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegram_id,
          text: `🎉 *Zahlung erfolgreich!*\n\n+${credits} Credits wurden gutgeschrieben!\n\nDu hast jetzt *${newCredits} Credits*.\n\nViel Spaß mit MOI! 🚀`,
          parse_mode: 'Markdown'
        })
      })
    }

    return NextResponse.json({
      success: true,
      credits: newCredits,
      added: credits,
      message: `${credits} Credits gutgeschrieben! Gesamt: ${newCredits}`
    })

  } catch (error) {
    console.error('Credits API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Credits abfragen
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const telegram_id = searchParams.get('telegram_id')

  if (!telegram_id) {
    return NextResponse.json({ error: 'Missing telegram_id' }, { status: 400 })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('credits')
    .eq('telegram_id', parseInt(telegram_id))
    .single()

  if (error || !user) {
    return NextResponse.json({ credits: 0 })
  }

  return NextResponse.json({ credits: user.credits })
}
