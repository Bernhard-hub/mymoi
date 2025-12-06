import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabase } from '@/lib/supabase'

const VoiceResponse = twilio.twiml.VoiceResponse

// ============================================
// TWILIO VOICE WEBHOOK - Das beste Sprachtool der Welt
// ============================================
// Flow: Anruf → Begrüßung → Aufnahme → voice-conversation (Loop)
//
// HYBRID-MODELL: Telefon nur für Admin, Telegram für alle anderen
// So hält das $94 Twilio-Guthaben JAHRE!

// Admin-Nummern die telefonieren dürfen (Whitelist)
const ADMIN_PHONES = [
  '+436769271800',  // Bernhard
  '+43676927180',   // Ohne führende 0
  '436769271800',   // Ohne +
]

function isAdmin(phone: string): boolean {
  const normalized = phone.replace(/[\s\-\(\)]/g, '')
  return ADMIN_PHONES.some(admin =>
    normalized.includes(admin.replace('+', '')) ||
    admin.includes(normalized.replace('+', ''))
  )
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const from = formData.get('From') as string
    const callSid = formData.get('CallSid') as string

    console.log(`📞 Anruf von ${from}`)

    // Check ob Admin
    if (!isAdmin(from)) {
      console.log(`⛔ Nicht-Admin Anruf von ${from} - Weiterleitung zu Telegram`)
      const response = new VoiceResponse()
      response.say(
        { language: 'de-DE', voice: 'Polly.Vicki' },
        'Willkommen bei MOI! Telefon ist nur für Premium-Nutzer. Nutze unseren kostenlosen Telegram Bot: at jo underscore my underscore moi underscore bot. Dort hast du alle Features kostenlos! Tschüss!'
      )
      response.hangup()
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    console.log(`✅ Admin-Anruf von ${from}`)

    const userId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

    // Personalisierte Begrüßung
    let greeting = 'Hallo! Was kann ich für dich tun?'

    try {
      // Check ob wir den User kennen
      const { data: interactions } = await supabase
        .from('voice_interactions')
        .select('*')
        .eq('phone', from)
        .order('created_at', { ascending: false })
        .limit(1)

      if (interactions && interactions.length > 0) {
        // Wiederkehrender User
        const hour = new Date().getHours()
        const timeGreeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend'
        greeting = `${timeGreeting}! Schön, dass du wieder anrufst. Was brauchst du?`
      }

      // Check pending follow-ups
      const { data: followups } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .limit(3)

      if (followups && followups.length > 0) {
        greeting += ` Übrigens, du hast ${followups.length} offene Follow-ups.`
      }
    } catch (e) {
      console.log('Greeting personalization skipped:', e)
    }

    const response = new VoiceResponse()

    // Begrüßung
    response.say(
      { language: 'de-DE', voice: 'Polly.Vicki' },
      `<speak><prosody rate="95%">${greeting}</prosody></speak>`
    )

    // Aufnahme starten - geht direkt zu voice-conversation
    const baseUrl = 'https://mymoi-bot.vercel.app'

    response.record({
      maxLength: 120,
      timeout: 3,
      playBeep: false,
      action: `${baseUrl}/api/voice-conversation`,
    })

    // Falls Timeout
    response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
      'Keine Aufnahme erkannt. Tschüss!'
    )
    response.hangup()

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (error) {
    console.error('Voice webhook error:', error)

    const response = new VoiceResponse()
    response.say({ language: 'de-DE' }, 'Ein Fehler ist aufgetreten.')
    response.hangup()

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}
