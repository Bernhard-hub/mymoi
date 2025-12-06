import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { sendSMS } from '@/lib/twilio-deliver'
import { sendEmail, extractEmailFromText } from '@/lib/email'

const MessagingResponse = twilio.twiml.MessagingResponse
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ============================================
// WELTBESTES SMS FEATURE - Revolution!
// ============================================
// HYBRID-MODELL: SMS nur für Admin, Telegram für alle anderen
// So hält das $94 Twilio-Guthaben JAHRE!

// Admin-Nummern die SMS nutzen dürfen (Whitelist)
const ADMIN_PHONES = [
  '+436769271800',  // Bernhard
  '+43676927180',
  '436769271800',
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
    const body = formData.get('Body') as string
    const messageSid = formData.get('MessageSid') as string

    console.log(`📱 SMS von ${from}: ${body}`)

    const response = new MessagingResponse()

    // Check ob Admin
    if (!isAdmin(from)) {
      console.log(`⛔ Nicht-Admin SMS von ${from}`)
      response.message('MOI SMS ist für Premium-Nutzer. Nutze kostenlos: Telegram @jo_my_moi_bot - Alle Features gratis!')
      return xml(response)
    }

    console.log(`✅ Admin-SMS von ${from}`)

    const lowerBody = body.toLowerCase().trim()
    const userId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

    // ============================================
    // STANDARD TWILIO COMMANDS (müssen zuerst sein!)
    // ============================================
    if (lowerBody === 'stop' || lowerBody === 'unsubscribe') {
      response.message('Abgemeldet. Sende START um dich wieder anzumelden.')
      return xml(response)
    }

    if (lowerBody === 'start' || lowerBody === 'subscribe') {
      response.message(`🚀 Willkommen bei MOI!

Ich bin dein AI-Assistent per SMS. Frag mich was du willst:

📧 "Email an max@test.de Treffen morgen"
📅 "Termin Zahnarzt morgen 14 Uhr"
🔍 "Was ist die Hauptstadt von Japan?"
🌤 "Wetter Berlin"
📞 "Ruf mich an"

Einfach schreiben - ich handle! 💪`)
      return xml(response)
    }

    // ============================================
    // KONTEXT LADEN - Vorherige Nachrichten
    // ============================================
    let conversationContext = ''
    try {
      const { data: history } = await supabase
        .from('sms_conversations')
        .select('role, content')
        .eq('phone', from)
        .order('created_at', { ascending: false })
        .limit(6)

      if (history && history.length > 0) {
        conversationContext = history.reverse().map(h =>
          `${h.role === 'user' ? 'User' : 'MOI'}: ${h.content}`
        ).join('\n')
      }
    } catch {
      // Tabelle existiert vielleicht nicht
    }

    // ============================================
    // QUICK COMMANDS - Sofortige Antworten
    // ============================================

    // RÜCKRUF
    if (lowerBody.includes('rückruf') || lowerBody.includes('ruf mich an') ||
        lowerBody.includes('call me') || lowerBody === 'anrufen' || lowerBody === 'call') {
      try {
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!
        )

        await twilioClient.calls.create({
          to: from,
          from: process.env.TWILIO_PHONE_NUMBER!,
          url: 'https://mymoi-bot.vercel.app/api/voice'
        })

        response.message('📞 Ich rufe dich JETZT an!')
      } catch (e) {
        response.message('📞 Ruf mich an: +1 (888) 664-2970')
      }
      return xml(response)
    }

    // HILFE
    if (lowerBody === 'help' || lowerBody === 'hilfe' || lowerBody === '?') {
      response.message(`🤖 MOI SMS-Assistent

📧 E-MAIL:
"Email an max@firma.de Meeting morgen"
→ Wird sofort gesendet!

📅 KALENDER:
"Termin Zahnarzt morgen 14 Uhr"
→ Details per SMS

🔍 FRAGEN:
"Wie groß ist der Mond?"
→ AI-Antwort sofort

🌤 WETTER:
"Wetter Wien"

📞 ANRUF:
"Ruf mich an"

💡 Tipp: Einfach natürlich schreiben!`)
      return xml(response)
    }

    // ============================================
    // DIREKTE E-MAIL ERKENNUNG
    // ============================================
    const emailAddress = extractEmailFromText(body)
    if (emailAddress) {
      // E-Mail senden!
      const textWithoutEmail = body.replace(emailAddress, '').trim()

      // AI generiert professionelle E-Mail
      const emailGen = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `Generiere eine kurze, professionelle E-Mail.
Antworte NUR mit JSON: {"subject": "Betreff", "body": "E-Mail Text"}
Halte es kurz und freundlich. Keine Markdown.`,
        messages: [{ role: 'user', content: textWithoutEmail || 'Kurze Nachricht' }]
      })

      try {
        const emailText = emailGen.content[0].type === 'text' ? emailGen.content[0].text : '{}'
        const parsed = JSON.parse(emailText.match(/\{[\s\S]*\}/)?.[0] || '{}')

        const result = await sendEmail({
          to: emailAddress,
          subject: parsed.subject || 'Nachricht von MOI',
          body: parsed.body || textWithoutEmail
        })

        if (result.success) {
          response.message(`✅ Email gesendet an ${emailAddress}!

📋 ${parsed.subject || 'Nachricht'}

"${(parsed.body || textWithoutEmail).substring(0, 100)}..."`)
          await saveConversation(from, body, `Email an ${emailAddress} gesendet`)
        } else {
          response.message(`❌ Email fehlgeschlagen: ${result.error}`)
        }
      } catch {
        response.message(`❌ Konnte Email nicht senden. Versuch es nochmal.`)
      }
      return xml(response)
    }

    // ============================================
    // WETTER ERKENNUNG
    // ============================================
    if (lowerBody.includes('wetter') || lowerBody.includes('weather')) {
      const cityMatch = body.match(/(?:wetter|weather)\s+(?:in\s+)?(\w+)/i)
      const city = cityMatch?.[1] || 'Berlin'

      try {
        const { getWeather } = await import('@/lib/web-search')
        const weather = await getWeather(city)

        if (weather) {
          response.message(`🌤 Wetter ${city}:

🌡 ${weather.temp}°C - ${weather.description}
💧 Feuchtigkeit: ${weather.humidity}%
💨 Wind: ${weather.wind} km/h`)
        } else {
          response.message(`Wetter für ${city} nicht gefunden.`)
        }
      } catch {
        response.message(`Wetter-Abfrage fehlgeschlagen.`)
      }
      await saveConversation(from, body, `Wetter ${city}`)
      return xml(response)
    }

    // ============================================
    // TERMIN ERKENNUNG
    // ============================================
    if (lowerBody.includes('termin') || lowerBody.includes('kalender') ||
        lowerBody.includes('meeting') || lowerBody.includes('eintrag')) {

      const calendarParse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: `Extrahiere Termin-Details. Heute: ${new Date().toISOString().split('T')[0]}
Antworte NUR: TITEL|DATUM|UHRZEIT
Beispiel: Zahnarzt|2024-12-10|14:00
Falls "morgen", berechne das Datum.`,
        messages: [{ role: 'user', content: body }]
      })

      const parts = (calendarParse.content[0].type === 'text' ? calendarParse.content[0].text : '').split('|')

      if (parts.length >= 2) {
        const [title, date, time] = parts.map(p => p.trim())

        // Speichere in lokaler DB
        try {
          await supabase.from('calendar_events').insert({
            id: `cal_${Date.now()}_${userId}`,
            user_id: userId,
            title: title,
            start_time: `${date}T${time || '09:00'}:00`,
            end_time: `${date}T${time ? (parseInt(time.split(':')[0]) + 1).toString().padStart(2, '0') + ':00' : '10:00'}:00`
          })
        } catch { /* ignore */ }

        const displayDate = new Date(date).toLocaleDateString('de-DE', {
          weekday: 'long', day: 'numeric', month: 'long'
        })

        response.message(`📅 Termin gespeichert!

📌 ${title}
📆 ${displayDate}
🕐 ${time || 'Ganztägig'}

💡 Ruf an für Google/Outlook-Link!`)
        await saveConversation(from, body, `Termin: ${title}`)
      } else {
        response.message(`📅 Welcher Termin? Schreib z.B.:
"Termin Zahnarzt morgen 14 Uhr"`)
      }
      return xml(response)
    }

    // ============================================
    // STATUS / AUFGABEN
    // ============================================
    if (lowerBody.includes('status') || lowerBody.includes('aufgaben') || lowerBody === 'tasks') {
      try {
        const { data: tasks } = await supabase
          .from('task_records')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (tasks && tasks.length > 0) {
          const taskList = tasks.map((t, i) =>
            `${i + 1}. ${t.task_type}: ${t.recipient || t.subject || 'Task'}`
          ).join('\n')
          response.message(`📋 Letzte Aufgaben:\n\n${taskList}`)
        } else {
          response.message('📋 Keine Aufgaben gefunden. Leg los!')
        }
      } catch {
        response.message('📋 Noch keine Aufgaben. Schreib mir was!')
      }
      return xml(response)
    }

    // ============================================
    // EMAILS CHECKEN
    // ============================================
    if (lowerBody.includes('email') || lowerBody.includes('mail') || lowerBody.includes('inbox')) {
      try {
        const { fetchUserEmails } = await import('@/lib/email-voice')
        const emails = await fetchUserEmails(userId, 5)

        if (emails.length > 0) {
          const emailList = emails.slice(0, 3).map((e, i) =>
            `${i + 1}. ${e.fromName || e.from.split('@')[0]}: ${e.subject.substring(0, 30)}`
          ).join('\n')
          response.message(`📧 ${emails.length} ungelesene E-Mails:

${emailList}

📞 Ruf an um sie vorzulesen!`)
        } else {
          response.message('📭 Keine neuen E-Mails.')
        }
      } catch {
        response.message(`📧 E-Mail nicht verbunden.

Verbinde dein Konto:
mymoi-bot.vercel.app/api/connect?phone=${encodeURIComponent(from)}`)
      }
      return xml(response)
    }

    // ============================================
    // FOLLOW-UP ANTWORTEN
    // ============================================
    if (lowerBody === 'ja' || lowerBody === 'yes' || lowerBody === 'ok' || lowerBody === 'send') {
      const { data: pendingFollowUp } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('phone', from)
        .eq('status', 'awaiting_user')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (pendingFollowUp) {
        try {
          const { sendFollowUpEmail } = await import('@/lib/moi-autonomous')
          await sendFollowUpEmail(pendingFollowUp.id)
          response.message('✅ Follow-Up gesendet!')
        } catch {
          response.message('✅ Wird erledigt!')
        }
      } else {
        response.message('👍 Alles klar!')
      }
      return xml(response)
    }

    if (lowerBody === 'nein' || lowerBody === 'no' || lowerBody === 'stop') {
      await supabase
        .from('follow_ups')
        .update({ status: 'cancelled' })
        .eq('phone', from)
        .eq('status', 'awaiting_user')

      response.message('✅ Abgebrochen.')
      return xml(response)
    }

    // ============================================
    // AI CONVERSATION - Die Weltneuheit!
    // ============================================
    // Jede andere Nachricht wird von AI beantwortet

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 250,
      system: `Du bist MOI, ein SMS-Assistent. Antworte KURZ (max 160 Zeichen wenn möglich, max 300).
Heute: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
Zeit: ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}

STIL:
- Direkt, freundlich, hilfreich
- Keine Markdown, keine Emojis überall
- Beantworte Fragen präzise
- Bei Aufgaben: Bestätige was du tust

KONTEXT DER KONVERSATION:
${conversationContext || 'Neuer Chat'}

FÄHIGKEITEN:
- Fragen beantworten (Allgemeinwissen, Fakten)
- Texte schreiben, übersetzen
- Rechnen, konvertieren
- Tipps geben

Für E-Mail/Termin/Wetter sag dem User wie er es formulieren soll.`,
      messages: [{ role: 'user', content: body }]
    })

    let aiAnswer = aiResponse.content[0].type === 'text'
      ? aiResponse.content[0].text
      : 'Verstanden!'

    // Kürzen wenn zu lang (SMS Limit)
    if (aiAnswer.length > 320) {
      aiAnswer = aiAnswer.substring(0, 317) + '...'
    }

    response.message(aiAnswer)
    await saveConversation(from, body, aiAnswer)

    return xml(response)

  } catch (error) {
    console.error('SMS webhook error:', error)

    const response = new MessagingResponse()
    response.message('Fehler aufgetreten. Versuch es nochmal!')

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

async function saveConversation(phone: string, userMessage: string, assistantMessage: string) {
  try {
    await supabase.from('sms_conversations').insert([
      { phone, role: 'user', content: userMessage, created_at: new Date().toISOString() },
      { phone, role: 'assistant', content: assistantMessage, created_at: new Date().toISOString() }
    ])
  } catch {
    // Tabelle existiert vielleicht nicht - kein Problem
  }
}

// GET für Twilio-Validierung
export async function GET() {
  return NextResponse.json({
    status: 'SMS webhook ready',
    features: [
      'AI Conversation',
      'Direct Email Sending',
      'Calendar Events',
      'Weather',
      'Callback Requests',
      'Follow-up Management'
    ]
  })
}
