import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { sendEmail, extractEmailFromText } from '@/lib/email'

const MessagingResponse = twilio.twiml.MessagingResponse
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ============================================
// WHATSAPP WEBHOOK - MOI per WhatsApp!
// ============================================
// Funktioniert WELTWEIT - keine Carrier-Einschränkungen
// Gleiche Features wie SMS, aber besser!

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const from = formData.get('From') as string // whatsapp:+436769271800
    const body = formData.get('Body') as string
    const profileName = formData.get('ProfileName') as string

    // WhatsApp Nummer extrahieren
    const phone = from.replace('whatsapp:', '')
    const userId = Math.abs(phone.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

    console.log(`💬 WhatsApp von ${profileName || phone}: ${body}`)

    const response = new MessagingResponse()
    const lowerBody = body.toLowerCase().trim()

    // ============================================
    // KONTEXT LADEN
    // ============================================
    let conversationContext = ''
    try {
      const { data: history } = await supabase
        .from('whatsapp_conversations')
        .select('role, content')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(6)

      if (history && history.length > 0) {
        conversationContext = history.reverse().map(h =>
          `${h.role === 'user' ? 'User' : 'MOI'}: ${h.content}`
        ).join('\n')
      }
    } catch {
      // Tabelle existiert nicht
    }

    // ============================================
    // HILFE
    // ============================================
    if (lowerBody === 'hi' || lowerBody === 'hallo' || lowerBody === 'start' || lowerBody === 'hilfe' || lowerBody === 'help') {
      response.message(`👋 *Hey ${profileName || 'du'}!*

Ich bin *MOI* - dein AI-Assistent per WhatsApp!

📧 *E-Mail senden:*
\`max@firma.de Treffen morgen 10 Uhr\`

📅 *Termin erstellen:*
\`Termin Zahnarzt morgen 14 Uhr\`

🌤 *Wetter:*
\`Wetter Wien\`

📞 *Anruf:*
\`Ruf mich an\`

🔍 *Fragen:*
Frag mich einfach was!

_Schreib mir was du brauchst!_ 🚀`)
      return xml(response)
    }

    // ============================================
    // RÜCKRUF
    // ============================================
    if (lowerBody.includes('ruf') && lowerBody.includes('an') || lowerBody === 'call') {
      try {
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!
        )

        await twilioClient.calls.create({
          to: phone,
          from: process.env.TWILIO_PHONE_NUMBER!,
          url: 'https://mymoi-bot.vercel.app/api/voice'
        })

        response.message('📞 Ich rufe dich JETZT an!')
      } catch (e) {
        response.message(`📞 Anruf fehlgeschlagen. Ruf mich an: ${process.env.TWILIO_PHONE_NUMBER}`)
      }
      return xml(response)
    }

    // ============================================
    // E-MAIL SENDEN
    // ============================================
    const emailAddress = extractEmailFromText(body)
    if (emailAddress) {
      const textWithoutEmail = body.replace(emailAddress, '').trim()

      const emailGen = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `Generiere eine kurze, professionelle E-Mail.
Antworte NUR mit JSON: {"subject": "Betreff", "body": "E-Mail Text"}`,
        messages: [{ role: 'user', content: textWithoutEmail || 'Kurze Nachricht' }]
      })

      try {
        const emailText = emailGen.content[0].type === 'text' ? emailGen.content[0].text : '{}'
        const parsed = JSON.parse(emailText.match(/\{[\s\S]*\}/)?.[0] || '{}')

        const result = await sendEmail({
          to: emailAddress,
          subject: parsed.subject || 'Nachricht',
          body: parsed.body || textWithoutEmail
        })

        if (result.success) {
          response.message(`✅ *E-Mail gesendet!*

📬 An: ${emailAddress}
📋 ${parsed.subject}

_"${(parsed.body || textWithoutEmail).substring(0, 100)}..."_`)
          await saveConversation(phone, body, `Email an ${emailAddress} gesendet`)
        } else {
          response.message(`❌ E-Mail fehlgeschlagen: ${result.error}`)
        }
      } catch {
        response.message('❌ E-Mail konnte nicht gesendet werden.')
      }
      return xml(response)
    }

    // ============================================
    // WETTER
    // ============================================
    if (lowerBody.includes('wetter') || lowerBody.includes('weather')) {
      const cityMatch = body.match(/(?:wetter|weather)\s+(?:in\s+)?(\w+)/i)
      const city = cityMatch?.[1] || 'Wien'

      try {
        const { getWeather } = await import('@/lib/web-search')
        const weather = await getWeather(city)

        if (weather) {
          response.message(`🌤 *Wetter in ${city}:*

🌡 *${weather.temp}°C* - ${weather.description}
💧 Feuchtigkeit: ${weather.humidity}%
💨 Wind: ${weather.wind} km/h`)
        } else {
          response.message(`Wetter für ${city} nicht gefunden.`)
        }
      } catch {
        response.message('Wetter-Abfrage fehlgeschlagen.')
      }
      return xml(response)
    }

    // ============================================
    // TERMIN
    // ============================================
    if (lowerBody.includes('termin') || lowerBody.includes('kalender') || lowerBody.includes('meeting')) {
      const calendarParse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: `Extrahiere Termin. Heute: ${new Date().toISOString().split('T')[0]}
Antworte NUR: TITEL|DATUM|UHRZEIT`,
        messages: [{ role: 'user', content: body }]
      })

      const parts = (calendarParse.content[0].type === 'text' ? calendarParse.content[0].text : '').split('|')

      if (parts.length >= 2) {
        const [title, date, time] = parts.map(p => p.trim())

        try {
          await supabase.from('calendar_events').insert({
            id: `cal_${Date.now()}_${userId}`,
            user_id: userId,
            title,
            start_time: `${date}T${time || '09:00'}:00`,
            end_time: `${date}T${time ? (parseInt(time.split(':')[0]) + 1).toString().padStart(2, '0') + ':00' : '10:00'}:00`
          })
        } catch { }

        const displayDate = new Date(date).toLocaleDateString('de-DE', {
          weekday: 'long', day: 'numeric', month: 'long'
        })

        response.message(`📅 *Termin gespeichert!*

📌 *${title}*
📆 ${displayDate}
🕐 ${time || 'Ganztägig'}`)
        await saveConversation(phone, body, `Termin: ${title}`)
      } else {
        response.message(`📅 Welcher Termin?

Beispiel: _Termin Zahnarzt morgen 14 Uhr_`)
      }
      return xml(response)
    }

    // ============================================
    // AI KONVERSATION
    // ============================================
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `Du bist MOI, ein WhatsApp-Assistent. Antworte kurz und hilfreich.
Heute: ${new Date().toLocaleDateString('de-DE')}
User: ${profileName || 'Unbekannt'}

Kontext:
${conversationContext || 'Neuer Chat'}

Nutze *fett* für wichtiges, _kursiv_ für Beispiele.`,
      messages: [{ role: 'user', content: body }]
    })

    let aiAnswer = aiResponse.content[0].type === 'text'
      ? aiResponse.content[0].text
      : 'Verstanden!'

    response.message(aiAnswer)
    await saveConversation(phone, body, aiAnswer)

    return xml(response)

  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    const response = new MessagingResponse()
    response.message('Fehler aufgetreten. Versuch es nochmal!')
    return xml(response)
  }
}

function xml(response: any) {
  return new NextResponse(response.toString(), {
    headers: { 'Content-Type': 'text/xml' }
  })
}

async function saveConversation(phone: string, userMessage: string, assistantMessage: string) {
  try {
    await supabase.from('whatsapp_conversations').insert([
      { phone, role: 'user', content: userMessage, created_at: new Date().toISOString() },
      { phone, role: 'assistant', content: assistantMessage, created_at: new Date().toISOString() }
    ])
  } catch { }
}

export async function GET() {
  return NextResponse.json({
    status: 'WhatsApp webhook ready',
    sandbox: 'Send "join <code>" to +1 415 523 8886'
  })
}
