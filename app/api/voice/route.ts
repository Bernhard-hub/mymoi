import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

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

    const response = new VoiceResponse()

    // Kurzer Ton statt langer Begrüßung - User weiß was zu tun ist
    response.play({ digits: '0' }) // Kurzer Piep

    // Aufnahme starten
    // - maxLength: 120 Sekunden max
    // - timeout: 2 Sekunden Stille = Ende (natürliches Sprechen)
    // - finishOnKey: # drücken beendet auch
    // - transcribe: false (wir machen das selbst mit Whisper - besser!)
    // - recordingStatusCallback: wird aufgerufen wenn Aufnahme fertig
    response.record({
      maxLength: 120,
      timeout: 2, // 2 Sek Stille = fertig
      playBeep: false,
      recordingStatusCallback: `${process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/voice-status`,
      recordingStatusCallbackEvent: ['completed'],
      action: `${process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/voice-done`,
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
