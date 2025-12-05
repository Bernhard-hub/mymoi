import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

// ============================================
// VOICE DONE - Aufnahme beendet, Anruf beenden
// ============================================
// Twilio ruft diese URL nachdem Record-Action abgeschlossen ist
// Hier sagen wir dem User kurz Bescheid und beenden den Anruf
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingDuration = formData.get('RecordingDuration') as string

    console.log(`🎤 Aufnahme beendet: ${recordingDuration}s`)

    const response = new VoiceResponse()

    // Kurze Bestätigung - User weiß dass es geklappt hat
    response.say(
      { language: 'de-DE', voice: 'Polly.Vicki' },
      'Erledigt. Ergebnis kommt gleich.'
    )

    // Anruf beenden
    response.hangup()

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (error) {
    console.error('Voice done error:', error)

    const response = new VoiceResponse()
    response.hangup()

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}
