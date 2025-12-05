// ============================================
// VOICE RESPONSE - MOI antwortet per Telefon!
// ============================================
// Ruft den User zurück und spricht die Antwort

import twilio from 'twilio'

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

// Anruf mit Sprachantwort starten
export async function callWithVoiceResponse(
  to: string,
  message: string,
  options?: {
    continueRecording?: boolean  // Soll User nach Antwort weiter sprechen können?
  }
): Promise<{ success: boolean; callSid?: string; error?: string }> {
  try {
    const baseUrl = 'https://mymoi-bot.vercel.app'
    const continueParam = options?.continueRecording ? '&continue=true' : ''

    // Nachricht URL-encodieren
    const encodedMessage = encodeURIComponent(message)

    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: `${baseUrl}/api/voice-callback?message=${encodedMessage}${continueParam}`,
      method: 'POST'
    })

    console.log(`📞 Rückruf gestartet an ${to}: ${call.sid}`)

    return { success: true, callSid: call.sid }
  } catch (error: any) {
    console.error('Voice callback error:', error)
    return { success: false, error: error.message }
  }
}

// Kurze Antwort für einfache Fragen (ohne Rückruf-Wartezeit)
export function formatVoiceResponse(text: string, maxLength: number = 500): string {
  // Für TTS optimieren
  let response = text
    .replace(/\n+/g, '. ')           // Newlines zu Punkten
    .replace(/[*_#]/g, '')            // Markdown entfernen
    .replace(/\s+/g, ' ')             // Mehrfache Leerzeichen
    .replace(/\.\s*\./g, '.')         // Doppelte Punkte
    .trim()

  // Kürzen wenn nötig
  if (response.length > maxLength) {
    response = response.substring(0, maxLength)
    // Am letzten vollständigen Satz abschneiden
    const lastPeriod = response.lastIndexOf('.')
    if (lastPeriod > maxLength * 0.5) {
      response = response.substring(0, lastPeriod + 1)
    }
  }

  return response
}

// Prüfen ob Anfrage eine Frage ist
export function isQuestion(text: string): boolean {
  const questionPatterns = [
    /\?$/,                                           // Endet mit ?
    /^(was|wer|wo|wann|wie|warum|wieso|weshalb|woher|wohin|welche[rsmn]?)\s/i,  // W-Fragen
    /^(ist|sind|hat|haben|kann|können|darf|soll|muss|wird|werden)\s/i,          // Ja/Nein Fragen
    /^(hast du|kannst du|weißt du|erinnerst du|kennst du)/i,                    // MOI-spezifische
    /^(status|stand|erledigt|gemacht|gesendet|geschickt)\s/i,                   // Status-Fragen
    /(schon|bereits|noch nicht)\s.*(erledigt|gemacht|gesendet)/i,               // Schon gemacht?
  ]

  return questionPatterns.some(pattern => pattern.test(text.trim()))
}

// Kategorie der Frage erkennen
export function categorizeQuestion(text: string): 'status' | 'info' | 'action' | 'general' {
  const lowerText = text.toLowerCase()

  // Status-Fragen (über erledigte Aufgaben)
  if (
    lowerText.includes('schon') ||
    lowerText.includes('bereits') ||
    lowerText.includes('erledigt') ||
    lowerText.includes('gesendet') ||
    lowerText.includes('status') ||
    lowerText.includes('gemacht') ||
    /habe ich.*schon/i.test(text) ||
    /wurde.*schon/i.test(text)
  ) {
    return 'status'
  }

  // Info-Fragen (Wissen abrufen)
  if (
    lowerText.includes('was ist') ||
    lowerText.includes('wer ist') ||
    lowerText.includes('bedeutet') ||
    lowerText.includes('erkläre') ||
    lowerText.includes('erinnerst du') ||
    lowerText.includes('weißt du')
  ) {
    return 'info'
  }

  // Aktions-Anfragen (eigentlich keine Fragen, aber ähnlich formuliert)
  if (
    lowerText.includes('kannst du') ||
    lowerText.includes('könntest du') ||
    lowerText.includes('mach') ||
    lowerText.includes('schick') ||
    lowerText.includes('send')
  ) {
    return 'action'
  }

  return 'general'
}
