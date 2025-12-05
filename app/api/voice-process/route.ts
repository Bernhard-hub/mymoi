import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { generateAsset } from '@/lib/ai-engine'
import { sendSMS } from '@/lib/twilio-deliver'
import { sendEmail, extractEmailFromText } from '@/lib/email'
import { processWithBrain, enrichWithKnowledge } from '@/lib/moi-brain'

const VoiceResponse = twilio.twiml.VoiceResponse
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ============================================
// VOICE PROCESS - ECHTE KONVERSATION!
// ============================================
// Dieser Endpoint verarbeitet die Anfrage SYNCHRON
// und antwortet dem User direkt per Stimme!
// Dann fragt er ob noch was gebraucht wird.

export async function POST(request: NextRequest) {
  const response = new VoiceResponse()

  try {
    const { searchParams } = new URL(request.url)
    const recordingUrl = searchParams.get('recording')
    const callSid = searchParams.get('callSid')

    // Auch Form Data checken (Twilio sendet beides)
    let formFrom = ''
    try {
      const formData = await request.formData()
      formFrom = formData.get('From') as string || ''
    } catch {}

    if (!recordingUrl) {
      response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
        'Ich konnte die Aufnahme nicht finden. Bitte versuch es nochmal.'
      )
      response.hangup()
      return twimlResponse(response)
    }

    // From-Nummer holen
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    let from = formFrom
    if (!from && callSid) {
      try {
        const call = await twilioClient.calls(callSid).fetch()
        from = call.from
      } catch (e) {
        console.log('Could not fetch call from:', e)
      }
    }

    const userId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

    console.log(`🎯 Verarbeite synchron für ${from}`)

    // ============================================
    // 1. TRANSKRIPTION - Schnell mit Groq Whisper
    // ============================================
    const transcript = await transcribeAudio(`${recordingUrl}.mp3`)

    if (!transcript || transcript.length < 3) {
      response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
        'Ich konnte dich leider nicht verstehen. Kannst du das nochmal sagen?'
      )
      // Nochmal aufnehmen
      addRecordingPrompt(response)
      return twimlResponse(response)
    }

    console.log(`📝 Transkript: ${transcript}`)

    // Cleanup
    const cleanedTranscript = transcript
      .replace(/\b(fertig|erledigt|senden|stopp|ende|danke|tschüss|ciao)\b[.!?]?$/i, '')
      .trim()

    // ============================================
    // 2. BRAIN PROCESSING - Verstehen & Reagieren
    // ============================================
    const brainResult = await processWithBrain(cleanedTranscript, userId, from)

    // Wenn Klärung nötig - PER STIMME FRAGEN!
    if (brainResult.status === 'clarify' && brainResult.clarificationQuestions) {
      const questions = brainResult.clarificationQuestions.join(' Oder: ')

      response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
        `<speak><prosody rate="95%">Kurze Rückfrage: ${escapeXml(questions)}</prosody></speak>`
      )

      // Auf Antwort warten
      addRecordingPrompt(response, 'Sprich jetzt.')
      return twimlResponse(response)
    }

    // Text anreichern
    const enrichedTranscript = await enrichWithKnowledge(cleanedTranscript, userId)

    // ============================================
    // 3. ERKENNEN WAS DER USER WILL
    // ============================================
    const intent = await detectIntent(cleanedTranscript)

    let voiceResponse = ''
    let needsFollowUp = true

    // ============================================
    // FRAGEN BEANTWORTEN
    // ============================================
    if (intent.type === 'question') {
      const answer = await answerQuestion(cleanedTranscript, userId)
      voiceResponse = answer
      needsFollowUp = true
    }

    // ============================================
    // E-MAIL SENDEN
    // ============================================
    else if (intent.type === 'email') {
      const emailAddress = extractEmailFromText(cleanedTranscript)

      if (!emailAddress) {
        response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
          'An wen soll ich die E-Mail senden? Sag mir die E-Mail-Adresse.'
        )
        addRecordingPrompt(response)
        return twimlResponse(response)
      }

      // E-Mail generieren und senden
      const asset = await generateAsset(enrichedTranscript)

      const emailResult = await sendEmail({
        to: emailAddress,
        subject: asset.title || 'MOI Nachricht',
        body: asset.content,
      })

      if (emailResult.success) {
        voiceResponse = `Erledigt! Ich habe die E-Mail an ${emailAddress.split('@')[0]} gesendet. Der Betreff ist: ${asset.title || 'MOI Nachricht'}.`
      } else {
        voiceResponse = `Die E-Mail konnte leider nicht gesendet werden. ${emailResult.error || ''}`
      }
    }

    // ============================================
    // AUFGABE / AKTION AUSFÜHREN
    // ============================================
    else if (intent.type === 'task') {
      const asset = await generateAsset(enrichedTranscript)

      // Je nach Asset-Typ
      if (asset.type === 'email') {
        const emailAddress = extractEmailFromText(cleanedTranscript)
        if (emailAddress) {
          await sendEmail({
            to: emailAddress,
            subject: asset.title || 'MOI Nachricht',
            body: asset.content
          })
          voiceResponse = `E-Mail an ${emailAddress.split('@')[0]} wurde gesendet!`
        } else {
          // Inhalt per SMS senden
          await sendSMS(from, `📧 ${asset.title || 'Deine E-Mail'}:\n\n${asset.content.substring(0, 1400)}`)
          voiceResponse = `Ich habe die E-Mail erstellt und dir per SMS geschickt. An wen soll ich sie senden?`
          needsFollowUp = true
        }
      } else if (asset.type === 'text' || asset.type === 'listing') {
        // Text per SMS senden
        await sendSMS(from, `${asset.title || ''}:\n\n${asset.content.substring(0, 1400)}`)
        voiceResponse = `${asset.title || 'Dein Text'} ist fertig! Ich habe es dir per SMS geschickt.`
      } else {
        // Alles andere per SMS
        await sendSMS(from, `✨ ${asset.title || 'Erledigt'}:\n\n${asset.content.substring(0, 1400)}`)
        voiceResponse = `${asset.title || 'Dein Auftrag'} ist erledigt. Details kommen per SMS.`
      }
    }

    // ============================================
    // SMALLTALK / ALLGEMEINES
    // ============================================
    else {
      const answer = await generateConversationalResponse(cleanedTranscript, userId)
      voiceResponse = answer
    }

    // ============================================
    // 4. ANTWORT SPRECHEN
    // ============================================
    response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
      `<speak><prosody rate="95%">${escapeXml(voiceResponse)}</prosody></speak>`
    )

    // ============================================
    // 5. FOLLOW-UP FRAGEN - ECHTE KONVERSATION!
    // ============================================
    if (needsFollowUp) {
      response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
        '<speak><break time="500ms"/>Brauchst du noch etwas?</speak>'
      )

      // Auf weitere Anfragen warten
      addRecordingPrompt(response)
    } else {
      response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
        '<speak><break time="300ms"/>Bis bald!</speak>'
      )
      response.hangup()
    }

    return twimlResponse(response)

  } catch (error) {
    console.error('Voice process error:', error)

    response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
      'Entschuldigung, da ist etwas schiefgelaufen. Versuch es bitte nochmal.'
    )
    response.hangup()

    return twimlResponse(response)
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function twimlResponse(response: any) {
  return new NextResponse(response.toString(), {
    headers: { 'Content-Type': 'text/xml' }
  })
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function addRecordingPrompt(response: any, prompt?: string) {
  if (prompt) {
    response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
      `<speak><break time="300ms"/>${prompt}</speak>`
    )
  }

  const baseUrl = 'https://mymoi-bot.vercel.app'
  response.record({
    maxLength: 120,
    timeout: 3, // 3 Sekunden Stille = fertig
    playBeep: false,
    action: `${baseUrl}/api/voice-done`,
  })

  // Falls Timeout ohne Sprache
  response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
    'Okay, bis zum nächsten Mal!'
  )
  response.hangup()
}

async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    // Audio von Twilio holen
    const audioResponse = await fetch(audioUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64')}`
      }
    })

    const audioBuffer = await audioResponse.arrayBuffer()

    // Groq Whisper - MULTILINGUAL
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer]), 'audio.mp3')
    formData.append('model', 'whisper-large-v3')
    // Kein language = auto-detect!

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: formData
    })

    const result = await response.json()
    return result.text || ''
  } catch (e) {
    console.error('Transcription error:', e)
    return ''
  }
}

interface Intent {
  type: 'question' | 'email' | 'task' | 'smalltalk' | 'goodbye'
  confidence: number
}

async function detectIntent(text: string): Promise<Intent> {
  const lower = text.toLowerCase()

  // Verabschiedung erkennen
  if (/\b(tschüss|bye|ciao|bis bald|auf wiederhören|fertig|das wars|nein danke|nichts mehr)\b/.test(lower)) {
    return { type: 'goodbye', confidence: 95 }
  }

  // Frage erkennen
  if (
    text.includes('?') ||
    /^(was|wer|wo|wann|wie|warum|wieso|welche|ist|sind|hat|hast|kann|kannst)\s/i.test(text)
  ) {
    return { type: 'question', confidence: 90 }
  }

  // E-Mail erkennen
  if (lower.includes('mail') || lower.includes('@') || lower.includes('schreib') && lower.includes('an')) {
    return { type: 'email', confidence: 85 }
  }

  // Aufgabe erkennen
  if (
    /\b(mach|erstell|schreib|generier|send|schick|buch|plan|erinner)\b/i.test(text)
  ) {
    return { type: 'task', confidence: 80 }
  }

  // Smalltalk
  return { type: 'smalltalk', confidence: 50 }
}

async function answerQuestion(question: string, userId: number): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: `Du bist MOI, ein freundlicher Sprachassistent.
Antworte kurz und natürlich (2-3 Sätze max), da es vorgelesen wird.
Kein Markdown, keine Aufzählungen. Sprich wie ein Freund.`,
    messages: [{ role: 'user', content: question }]
  })

  return response.content[0].type === 'text'
    ? response.content[0].text
    : 'Das kann ich leider nicht beantworten.'
}

async function generateConversationalResponse(text: string, userId: number): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: `Du bist MOI, ein hilfreicher Sprachassistent.
Der User hat gerade etwas gesagt. Reagiere freundlich und natürlich.
Wenn es eine Aufgabe ist, bestätige dass du dich darum kümmerst.
Kurz und knapp (1-2 Sätze), wird vorgelesen.`,
    messages: [{ role: 'user', content: text }]
  })

  return response.content[0].type === 'text'
    ? response.content[0].text
    : 'Alles klar!'
}

export async function GET(request: NextRequest) {
  return POST(request)
}
