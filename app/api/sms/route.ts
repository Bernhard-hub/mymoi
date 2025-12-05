import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabase } from '@/lib/supabase'
import { sendSMS } from '@/lib/twilio-deliver'

const MessagingResponse = twilio.twiml.MessagingResponse

// ============================================
// SMS WEBHOOK - Eingehende SMS verarbeiten
// ============================================
// Twilio ruft diese URL wenn jemand eine SMS an die MOI-Nummer sendet

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const from = formData.get('From') as string
    const body = formData.get('Body') as string
    const messageSid = formData.get('MessageSid') as string

    console.log(`📱 SMS von ${from}: ${body}`)

    const response = new MessagingResponse()
    const lowerBody = body.toLowerCase().trim()

    // ============================================
    // STANDARD TWILIO COMMANDS
    // ============================================
    if (lowerBody === 'stop' || lowerBody === 'unsubscribe') {
      response.message('Du wurdest abgemeldet. Sende START um dich wieder anzumelden.')
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    if (lowerBody === 'start' || lowerBody === 'subscribe') {
      response.message('Willkommen bei MOI! 📞 Ruf an unter +1 (888) 664-2970 oder sende mir eine Nachricht.')
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    if (lowerBody === 'help') {
      response.message(
        '📞 MOI Voice Assistant\n\n' +
        '• Anrufen: +1 (888) 664-2970\n' +
        '• SMS: Fragen stellen, Befehle geben\n\n' +
        'Befehle:\n' +
        '• "Meine Emails" - E-Mails checken\n' +
        '• "Status" - Letzte Aufgaben\n' +
        '• STOP - Abmelden'
      )
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // ============================================
    // FOLLOW-UP ANTWORTEN
    // ============================================
    // Antworten auf Follow-Up Erinnerungen
    if (lowerBody === 'ja' || lowerBody === 'yes' || lowerBody === 'send') {
      // Prüfe ob es eine ausstehende Follow-Up Aktion gibt
      const { data: pendingFollowUp } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('phone', from)
        .eq('status', 'awaiting_user')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (pendingFollowUp) {
        // Follow-Up senden
        const { sendFollowUpEmail } = await import('@/lib/moi-autonomous')
        await sendFollowUpEmail(pendingFollowUp.id)
        response.message('✅ Follow-Up E-Mail wurde gesendet!')
      } else {
        response.message('👍 OK!')
      }

      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    if (lowerBody === 'nein' || lowerBody === 'no' || lowerBody === 'stop follow-up') {
      // Follow-Up abbrechen
      await supabase
        .from('follow_ups')
        .update({ status: 'cancelled' })
        .eq('phone', from)
        .eq('status', 'awaiting_user')

      response.message('✅ Follow-Up wurde abgebrochen.')
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // Zeit-Antwort für Follow-Up (z.B. "3d", "1w", "morgen")
    const timeMatch = lowerBody.match(/^(\d+)\s*(d|t|w|h|tage?|wochen?|stunden?)$/i)
    if (timeMatch) {
      const num = parseInt(timeMatch[1])
      const unit = timeMatch[2].toLowerCase()

      let hours = 0
      if (unit.startsWith('d') || unit.startsWith('t')) hours = num * 24
      else if (unit.startsWith('w')) hours = num * 24 * 7
      else if (unit.startsWith('h') || unit.startsWith('s')) hours = num

      if (hours > 0) {
        await supabase
          .from('follow_ups')
          .update({
            status: 'pending',
            next_follow_up_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
          })
          .eq('phone', from)
          .eq('status', 'awaiting_user')

        response.message(`✅ Erinnerung in ${num} ${unit} neu gesetzt.`)
        return new NextResponse(response.toString(), {
          headers: { 'Content-Type': 'text/xml' }
        })
      }
    }

    // ============================================
    // CLARIFICATION ANTWORTEN
    // ============================================
    // Antworten auf Rückfragen
    const { data: pendingClarification } = await supabase
      .from('pending_clarifications')
      .select('*')
      .eq('phone', from)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (pendingClarification) {
      // Antwort speichern und Original-Anfrage verarbeiten
      const answers = pendingClarification.answers || {}
      const questions = pendingClarification.questions || []

      // Finde nächste unbeantwortete Frage
      const nextUnanswered = questions.findIndex((q: string, i: number) => !answers[i])

      if (nextUnanswered !== -1) {
        answers[nextUnanswered] = body.trim()

        await supabase
          .from('pending_clarifications')
          .update({ answers })
          .eq('id', pendingClarification.id)

        // Alle Fragen beantwortet?
        if (Object.keys(answers).length >= questions.length) {
          // Clarification abschließen
          await supabase
            .from('pending_clarifications')
            .update({ status: 'completed' })
            .eq('id', pendingClarification.id)

          response.message('✅ Danke! Ich verarbeite deinen Auftrag jetzt.')

          // TODO: Original-Auftrag mit Antworten verarbeiten
        } else {
          // Nächste Frage stellen
          response.message(`Danke! Noch eine Frage:\n\n${questions[nextUnanswered + 1]}`)
        }

        return new NextResponse(response.toString(), {
          headers: { 'Content-Type': 'text/xml' }
        })
      }
    }

    // ============================================
    // ALLGEMEINE SMS-BEFEHLE
    // ============================================

    // Status abfragen
    if (lowerBody.includes('status') || lowerBody.includes('aufgaben')) {
      const { getRecentTasks } = await import('@/lib/moi-autonomous')
      const numericUserId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
      const tasks = await getRecentTasks(numericUserId, 5)

      if (tasks.length > 0) {
        const taskList = tasks.map((t, i) =>
          `${i + 1}. ${t.task_type}: ${t.recipient || t.subject || 'Kein Titel'}`
        ).join('\n')
        response.message(`📋 Letzte Aufgaben:\n\n${taskList}`)
      } else {
        response.message('📋 Keine Aufgaben in den letzten 24 Stunden.')
      }

      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // E-Mails checken
    if (lowerBody.includes('email') || lowerBody.includes('mail')) {
      const { fetchUserEmails } = await import('@/lib/email-voice')
      const numericUserId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
      const emails = await fetchUserEmails(numericUserId, 5)

      if (emails.length > 0) {
        const emailList = emails.map((e, i) =>
          `${i + 1}. ${e.fromName || e.from.split('@')[0]}: ${e.subject}`
        ).join('\n')
        response.message(`📧 ${emails.length} ungelesene E-Mails:\n\n${emailList}\n\n📞 Ruf an um sie vorzulesen!`)
      } else {
        response.message('📭 Keine ungelesenen E-Mails.')
      }

      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // ============================================
    // RÜCKRUF ANFORDERN
    // ============================================
    if (lowerBody.includes('rückruf') || lowerBody.includes('ruf mich an') || lowerBody.includes('call me') || lowerBody === 'anrufen') {
      const { callWithVoiceResponse } = await import('@/lib/voice-response')

      await callWithVoiceResponse(from, 'Hallo! Du hast einen Rückruf angefordert. Was kann ich für dich tun?', { continueRecording: true })

      response.message('📞 Ich rufe dich gleich an!')
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // ============================================
    // AI-VERARBEITUNG FÜR KOMPLEXE ANFRAGEN
    // ============================================
    // Wenn die Nachricht wie ein Auftrag aussieht, verarbeite sie
    const actionKeywords = ['email', 'schreib', 'send', 'erstell', 'mach', 'such', 'find', 'erinner']
    const isActionRequest = actionKeywords.some(k => lowerBody.includes(k))

    if (isActionRequest && body.length > 10) {
      // Per Rückruf bestätigen und ausführen
      const { callWithVoiceResponse } = await import('@/lib/voice-response')

      response.message(
        `📝 Ich habe deinen Auftrag erhalten:\n\n` +
        `"${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"\n\n` +
        `Antworte "Rückruf" und ich rufe dich an um das zu besprechen, oder "OK" und ich führe es direkt aus.`
      )

      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // ============================================
    // DEFAULT RESPONSE
    // ============================================
    response.message(
      `📞 MOI hier!\n\n` +
      `Befehle:\n` +
      `• "Rückruf" - Ich rufe dich an\n` +
      `• "Emails" - Posteingang checken\n` +
      `• "Status" - Letzte Aufgaben\n\n` +
      `Oder ruf direkt an:\n` +
      `+1 (888) 664-2970`
    )

    // Log für Debugging
    try {
      await supabase.from('sms_logs').insert({
        phone: from,
        message_sid: messageSid,
        body: body,
        direction: 'inbound',
        created_at: new Date().toISOString()
      })
    } catch {
      // Tabelle existiert vielleicht nicht
    }

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (error) {
    console.error('SMS webhook error:', error)

    const response = new MessagingResponse()
    response.message('Ein Fehler ist aufgetreten. Bitte versuche es später erneut.')

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}

// GET für Twilio-Validierung
export async function GET() {
  return NextResponse.json({ status: 'SMS webhook ready' })
}
