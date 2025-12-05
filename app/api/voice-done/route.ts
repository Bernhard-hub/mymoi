import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

// ============================================
// VOICE DONE - Aufnahme beendet, WARTE auf Verarbeitung!
// ============================================
// NEUES SYSTEM: Wir halten den Anruf offen während die
// Verarbeitung läuft und antworten dann per Stimme!

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingDuration = formData.get('RecordingDuration') as string
    const callSid = formData.get('CallSid') as string

    console.log(`🎤 Aufnahme beendet: ${recordingDuration}s - CallSid: ${callSid}`)

    const response = new VoiceResponse()

    // Kurze Bestätigung WÄHREND wir verarbeiten
    response.say(
      { language: 'de-DE', voice: 'Polly.Vicki' },
      '<speak><prosody rate="95%">Moment, ich arbeite daran.</prosody></speak>'
    )

    // WICHTIG: Auf die Verarbeitung warten!
    // Wir rufen unsere eigene /api/voice-process URL auf die SYNCHRON antwortet
    const baseUrl = 'https://mymoi-bot.vercel.app'

    // Redirect zu Process-Endpoint der die Antwort generiert
    response.redirect({
      method: 'POST'
    }, `${baseUrl}/api/voice-process?recording=${encodeURIComponent(recordingUrl)}&callSid=${callSid}`)

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (error) {
    console.error('Voice done error:', error)

    const response = new VoiceResponse()
    response.say(
      { language: 'de-DE', voice: 'Polly.Vicki' },
      'Ein Fehler ist aufgetreten. Bitte versuch es nochmal.'
    )
    response.hangup()

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}
