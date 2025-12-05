import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getProactiveVoiceGreeting } from '@/lib/proactive-intelligence'

const VoiceResponse = twilio.twiml.VoiceResponse

// ============================================
// TWILIO VOICE WEBHOOK - Eingehende Anrufe
// ============================================
// Twilio ruft diese URL wenn jemand die MOI-Nummer anruft
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const from = formData.get('From') as string
    const callSid = formData.get('CallSid') as string

    console.log(`📞 Neuer Anruf von ${from} (${callSid})`)

    // User-ID aus Telefonnummer
    const userId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

    const response = new VoiceResponse()

    // PROAKTIVE BEGRÜSSUNG - personalisiert!
    let greeting = 'Hallo! Sprich jetzt.'
    try {
      greeting = await getProactiveVoiceGreeting(from, userId)
    } catch (e) {
      console.log('Proactive greeting fallback:', e)
    }

    response.say(
      { language: 'de-DE', voice: 'Polly.Vicki' },
      `<speak><prosody rate="95%">${greeting}</prosody></speak>`
    )

    // Aufnahme starten
    // - maxLength: 120 Sekunden max
    // - timeout: 2 Sekunden Stille = Ende (natürliches Sprechen)
    // - finishOnKey: # drücken beendet auch
    // - transcribe: false (wir machen das selbst mit Whisper - besser!)
    // - recordingStatusCallback: wird aufgerufen wenn Aufnahme fertig
    // Feste Production URL für Callbacks (Preview URLs funktionieren nicht mit Twilio)
    const baseUrl = 'https://mymoi-bot.vercel.app'

    response.record({
      maxLength: 120,
      timeout: 2, // 2 Sek Stille = fertig
      playBeep: false,
      recordingStatusCallback: `${baseUrl}/api/voice-status`,
      recordingStatusCallbackEvent: ['completed'],
      action: `${baseUrl}/api/voice-done`,
    })

    // Falls nichts aufgenommen wird (Timeout ohne Sprache)
    response.say({ language: 'de-DE' }, 'Keine Aufnahme erhalten. Tschüss.')

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (error) {
    console.error('Voice webhook error:', error)

    const response = new twilio.twiml.VoiceResponse()
    response.say({ language: 'de-DE' }, 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.')

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}
