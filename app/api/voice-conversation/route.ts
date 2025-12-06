import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { sendSMS } from '@/lib/twilio-deliver'
import { sendEmail, extractEmailFromText } from '@/lib/email'

const VoiceResponse = twilio.twiml.VoiceResponse
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ============================================
// VOICE CONVERSATION - Das beste Sprachtool der Welt
// ============================================
// Synchrone Verarbeitung: User spricht → MOI antwortet SOFORT per Stimme
// Kontinuierliche Konversation: Fragt nach → User spricht weiter

export async function POST(request: NextRequest) {
  const response = new VoiceResponse()

  try {
    const formData = await request.formData()
    const recordingUrl = formData.get('RecordingUrl') as string
    const callSid = formData.get('CallSid') as string

    // From-Nummer holen
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    const call = await twilioClient.calls(callSid).fetch()
    const from = call.from
    const userId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

    console.log(`🎯 Voice Conversation: ${from}`)

    // ============================================
    // 1. TRANSKRIPTION - Schnell mit Groq Whisper
    // ============================================
    const transcript = await transcribeAudio(`${recordingUrl}.mp3`)

    if (!transcript || transcript.length < 2) {
      response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
        'Ich habe dich nicht verstanden. Kannst du das nochmal sagen?'
      )
      addContinue(response)
      return xml(response)
    }

    console.log(`📝 "${transcript}"`)

    // Cleanup
    const text = transcript
      .replace(/\b(fertig|erledigt|senden|stopp|ende|danke|tschüss|ciao|bye|auf wiederhören)\b[.!?]?$/i, '')
      .trim()

    // ============================================
    // 2. VERABSCHIEDUNG ERKENNEN
    // ============================================
    if (/^(tschüss|bye|ciao|auf wiederhören|bis bald|das wars|fertig|ende|nein danke|nichts mehr|nein|stop)$/i.test(transcript.trim())) {
      response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
        'Alles klar! Bis zum nächsten Mal.'
      )
      response.hangup()
      return xml(response)
    }

    // ============================================
    // 3. INTENT ERKENNEN + ANTWORT GENERIEREN
    // ============================================
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `Du bist MOI, ein freundlicher Telefonassistent. Antworte KURZ (max 2 Sätze), natürlich und hilfreich.
Heute: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
Zeit: ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}

WICHTIG:
- Antworte direkt und prägnant
- Kein Markdown, keine Sonderzeichen
- Sprich wie ein Freund am Telefon
- Wenn du etwas tun sollst, bestätige kurz was du tust

Wenn der User nach E-Mail fragt ohne Account zu haben, sag: "Ich schicke dir einen Link per SMS um dein E-Mail-Konto zu verbinden."`,
      messages: [{ role: 'user', content: text }]
    })

    let voiceAnswer = aiResponse.content[0].type === 'text'
      ? aiResponse.content[0].text
      : 'Das habe ich nicht verstanden.'

    // ============================================
    // 4. SPEZIELLE AKTIONEN
    // ============================================
    const lower = text.toLowerCase()

    // E-MAIL SENDEN
    if (lower.includes('@') || (lower.includes('mail') && lower.includes('send'))) {
      const emailAddress = extractEmailFromText(text)
      if (emailAddress) {
        // E-Mail Inhalt generieren
        const emailContent = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: 'Schreibe eine kurze, professionelle E-Mail basierend auf dem Input. Nur den E-Mail-Body, kein Betreff.',
          messages: [{ role: 'user', content: text }]
        })

        const body = emailContent.content[0].type === 'text' ? emailContent.content[0].text : text
        const subject = text.split(' ').slice(0, 5).join(' ')

        const result = await sendEmail({ to: emailAddress, subject, body })

        if (result.success) {
          voiceAnswer = `Erledigt! E-Mail an ${emailAddress.split('@')[0]} gesendet.`
          await sendSMS(from, `✅ E-Mail gesendet an ${emailAddress}\n\n${body.substring(0, 200)}`)
        } else {
          voiceAnswer = `E-Mail konnte nicht gesendet werden. ${result.error || ''}`
        }
      }
    }

    // TERMIN ERSTELLEN
    else if (lower.includes('termin') || lower.includes('kalender') || lower.includes('meeting')) {
      // Termin parsen
      const calendarParse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: `Extrahiere Termin-Details. Heute: ${new Date().toISOString().split('T')[0]}
Antworte NUR mit: TITEL|DATUM|ZEIT
Beispiel: Zahnarzt|2024-12-10|14:00

Falls "morgen", berechne das Datum. Falls keine Zeit, nutze 09:00.`,
        messages: [{ role: 'user', content: text }]
      })

      const parts = (calendarParse.content[0].type === 'text' ? calendarParse.content[0].text : '').split('|')

      if (parts.length >= 2) {
        const [title, date, time] = parts

        // In lokalen Kalender speichern
        try {
          await supabase.from('calendar_events').insert({
            id: `cal_${Date.now()}_${userId}`,
            user_id: userId,
            title: title.trim(),
            start_time: `${date.trim()}T${(time || '09:00').trim()}:00`,
            end_time: `${date.trim()}T${(time || '10:00').trim()}:00`,
            is_all_day: !time
          })

          voiceAnswer = `Termin gespeichert: ${title.trim()}, am ${new Date(date.trim()).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}${time ? ` um ${time.trim()} Uhr` : ''}.`

          await sendSMS(from, `📅 Termin erstellt:\n\n${title.trim()}\n${date.trim()} ${time || ''}\n\nDetails per SMS gesendet.`)
        } catch (e) {
          console.error('Calendar save error:', e)
          voiceAnswer = `Termin notiert: ${title.trim()}. Ich schicke dir die Details per SMS.`
          await sendSMS(from, `📅 Termin-Notiz:\n\n${text}`)
        }
      } else {
        voiceAnswer = 'Was für einen Termin soll ich eintragen?'
      }
    }

    // FRAGE BEANTWORTEN (allgemein)
    else if (text.includes('?')) {
      // Antwort bereits generiert
    }

    // AUFGABE AUSFÜHREN
    else if (/\b(mach|erstell|schreib|generier|such)\b/i.test(text)) {
      await sendSMS(from, `📝 Arbeite an: ${text}\n\nDetails folgen per SMS.`)
      voiceAnswer = 'Ich arbeite dran. Details kommen per SMS.'
    }

    // ============================================
    // 5. ANTWORT SPRECHEN
    // ============================================
    response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
      `<speak><prosody rate="95%">${escapeXml(voiceAnswer)}</prosody></speak>`
    )

    // ============================================
    // 6. WEITERMACHEN
    // ============================================
    response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
      '<speak><break time="400ms"/>Noch etwas?</speak>'
    )

    addContinue(response)
    return xml(response)

  } catch (error) {
    console.error('Voice conversation error:', error)

    response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
      'Entschuldigung, da ist was schiefgelaufen. Versuch es nochmal.'
    )
    addContinue(response)
    return xml(response)
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function xml(response: any) {
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

function addContinue(response: any) {
  const baseUrl = 'https://mymoi-bot.vercel.app'

  response.record({
    maxLength: 60,
    timeout: 3,
    playBeep: false,
    action: `${baseUrl}/api/voice-conversation`,
  })

  // Falls keine Antwort
  response.say({ language: 'de-DE', voice: 'Polly.Vicki' },
    'Okay, bis bald!'
  )
  response.hangup()
}

async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    const audioResponse = await fetch(audioUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64')}`
      }
    })

    const audioBuffer = await audioResponse.arrayBuffer()

    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer]), 'audio.mp3')
    formData.append('model', 'whisper-large-v3')

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

export async function GET(request: NextRequest) {
  return POST(request)
}
