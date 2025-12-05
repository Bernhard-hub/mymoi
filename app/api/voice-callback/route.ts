import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

// ============================================
// VOICE CALLBACK - MOI ruft zurück mit Antwort!
// ============================================
// Dieser Endpoint liefert TwiML für ausgehende Anrufe
// Die Nachricht kommt als Query-Parameter

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const message = searchParams.get('message') || 'Ich habe deine Anfrage erhalten.'
    const continueRecording = searchParams.get('continue') === 'true'

    const response = new VoiceResponse()

    // Nachricht vorlesen
    response.say(
      { language: 'de-DE', voice: 'Polly.Vicki' },
      `<speak><prosody rate="95%">${escapeXml(message)}</prosody></speak>`
    )

    // Optional: Weitere Aufnahme ermöglichen
    if (continueRecording) {
      response.say(
        { language: 'de-DE', voice: 'Polly.Vicki' },
        '<speak><break time="500ms"/>Du kannst jetzt antworten.</speak>'
      )

      const baseUrl = 'https://mymoi-bot.vercel.app'
      response.record({
        maxLength: 60,
        timeout: 2,
        playBeep: false,
        recordingStatusCallback: `${baseUrl}/api/voice-status`,
        recordingStatusCallbackEvent: ['completed'],
        action: `${baseUrl}/api/voice-done`,
      })
    }

    // Anruf beenden
    response.hangup()

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (error) {
    console.error('Voice callback error:', error)

    const response = new VoiceResponse()
    response.say({ language: 'de-DE' }, 'Ein Fehler ist aufgetreten.')
    response.hangup()

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}

// GET für Twilio (manche Requests kommen als GET)
export async function GET(request: NextRequest) {
  return POST(request)
}

// XML escapen für SSML
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
