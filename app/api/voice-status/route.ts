import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateAsset } from '@/lib/ai-engine'
import { createPresentation } from '@/lib/pptx'
import { sendSMS, sendWhatsApp } from '@/lib/twilio-deliver'
import { sendEmail, extractEmailFromText } from '@/lib/email'
import { generateImages, uploadImageToStorage, generateImagePrompts } from '@/lib/image-gen'
import { processWithBrain, enrichWithKnowledge, saveUserKnowledge } from '@/lib/moi-brain'
import {
  createFollowUp,
  saveCustomerUpdate,
  addToConversationThread,
  analyzeDeal,
  checkForDuplicateTask,
  recordCompletedTask,
  getTaskStatus,
  getRecentTasks
} from '@/lib/moi-autonomous'
import {
  callWithVoiceResponse,
  formatVoiceResponse,
  isQuestion,
  categorizeQuestion
} from '@/lib/voice-response'
import {
  researchArticle,
  formatArticleForVoice
} from '@/lib/research-access'
import {
  parseEmailCommand,
  fetchUserEmails,
  formatEmailsForVoice,
  formatSingleEmailForVoice,
  getEmailFromSession,
  setEmailSession,
  getEmailSession,
  generateEmailReply,
  sendEmailReply
} from '@/lib/email-voice'
import {
  isCalendarRequest,
  parseCalendarRequest,
  fetchUserCalendarEvents,
  formatCalendarForVoice,
  formatSingleEventForVoice,
  createLocalCalendarEvent
} from '@/lib/calendar-voice'

// ============================================
// VOICE STATUS - Die Haupt-Verarbeitung!
// ============================================
// Twilio ruft diese URL wenn die Aufnahme fertig hochgeladen ist
// Hier passiert die Magie: Transkription → AI → Delivery

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const recordingUrl = formData.get('RecordingUrl') as string
    const callSid = formData.get('CallSid') as string
    const duration = formData.get('RecordingDuration') as string

    // From ist nicht im recordingStatusCallback - hole es vom Call
    const twilioClient = (await import('twilio')).default(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )
    const call = await twilioClient.calls(callSid).fetch()
    const from = call.from

    console.log(`🎤 Verarbeite Aufnahme von ${from}: ${duration}s`)

    // ============================================
    // 1. User anlegen/holen (Telefonnummer = ID)
    // ============================================
    const user = await getOrCreateVoiceUser(from)

    // Credits prüfen - DEAKTIVIERT für Beta-Phase
    // if (user.credits <= 0) {
    //   await sendSMS(from, '⚠️ Deine Credits sind aufgebraucht. Mehr unter: moi.app/buy')
    //   return NextResponse.json({ success: false, error: 'No credits' })
    // }

    // ============================================
    // 2. Audio herunterladen und transkribieren
    // ============================================
    const audioUrl = `${recordingUrl}.mp3`
    const transcript = await transcribeWithWhisper(audioUrl)

    console.log(`📝 Transkript: ${transcript}`)

    if (!transcript || transcript.length < 3) {
      await sendSMS(from, '❌ Konnte nichts verstehen. Bitte nochmal versuchen!')
      return NextResponse.json({ success: false, error: 'Empty transcript' })
    }

    // Cleanup: "fertig/erledigt/senden" am Ende entfernen
    const cleanedTranscript = transcript
      .replace(/\b(fertig|erledigt|senden|stopp|ende|danke|tschüss|ciao)\b[.!?]?$/i, '')
      .trim()

    // ============================================
    // 2.5 MOI BRAIN - Verstehen, Lernen, Nachfragen
    // ============================================
    // Verwende Phone als User-ID für Voice (vereinfacht)
    const numericUserId = Math.abs(from.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

    const brainResult = await processWithBrain(cleanedTranscript, numericUserId, from)

    // Wenn Klärung nötig: SMS mit Fragen senden und warten
    if (brainResult.status === 'clarify' && brainResult.clarificationQuestions) {
      const questions = brainResult.clarificationQuestions.join('\n• ')
      await sendSMS(from, `🤔 Kurze Rückfrage:\n\n• ${questions}\n\nAntworte per SMS oder ruf nochmal an!`)

      console.log(`❓ Klärung angefordert für ${from}`)
      return NextResponse.json({ success: true, status: 'clarification_needed' })
    }

    // Text mit User-Wissen anreichern
    const enrichedTranscript = await enrichWithKnowledge(cleanedTranscript, numericUserId)
    console.log(`🧠 Angereicherter Text: ${enrichedTranscript}`)

    // Wissen aus der Anfrage lernen (wenn User explizit sagt "X bedeutet Y")
    const learnMatch = cleanedTranscript.match(/(\w+)\s+(?:bedeutet|heißt|ist|steht für)\s+(.+)/i)
    if (learnMatch) {
      await saveUserKnowledge(numericUserId, learnMatch[1], learnMatch[2])
      await sendSMS(from, `🧠 Gemerkt: "${learnMatch[1]}" = "${learnMatch[2]}"`)
    }

    // ============================================
    // 2.6 EMAIL VOICE - E-Mails vorlesen & beantworten
    // ============================================
    const emailCommand = parseEmailCommand(cleanedTranscript)

    if (emailCommand.action !== 'unknown') {
      console.log(`📧 Email-Befehl erkannt: ${emailCommand.action}`)

      // E-MAILS AUFLISTEN
      if (emailCommand.action === 'list') {
        const emails = await fetchUserEmails(numericUserId, 5)
        setEmailSession(from, emails)

        const voiceResponse = formatEmailsForVoice(emails)
        await callWithVoiceResponse(from, formatVoiceResponse(voiceResponse, 500))

        // SMS mit Übersicht
        const smsText = emails.length > 0
          ? `📧 ${emails.length} neue E-Mails:\n\n` +
            emails.slice(0, 5).map((e, i) =>
              `${i + 1}. ${e.fromName || e.from.split('@')[0]}: ${e.subject}`
            ).join('\n')
          : '📭 Keine ungelesenen E-Mails'

        await sendSMS(from, smsText)

        return NextResponse.json({ success: true, type: 'email_list', count: emails.length })
      }

      // EINZELNE E-MAIL LESEN
      if (emailCommand.action === 'read' && emailCommand.emailIndex) {
        // Session prüfen oder neu laden
        let session = getEmailSession(from)
        if (!session) {
          const emails = await fetchUserEmails(numericUserId, 5)
          setEmailSession(from, emails)
          session = getEmailSession(from)
        }

        const email = getEmailFromSession(from, emailCommand.emailIndex)

        if (email) {
          const voiceResponse = formatSingleEmailForVoice(email)
          await callWithVoiceResponse(from, formatVoiceResponse(voiceResponse, 600))

          // Volltext per SMS
          await sendSMS(from,
            `📧 Von: ${email.fromName || email.from}\n` +
            `📌 ${email.subject}\n\n` +
            `${email.body.substring(0, 1200)}\n\n` +
            `💬 Sage "antworte auf E-Mail ${emailCommand.emailIndex}" um zu antworten`
          )

          return NextResponse.json({ success: true, type: 'email_read', email })
        } else {
          await callWithVoiceResponse(from, `E-Mail Nummer ${emailCommand.emailIndex} nicht gefunden.`)
          return NextResponse.json({ success: false, type: 'email_read', error: 'Not found' })
        }
      }

      // AUF E-MAIL ANTWORTEN
      if (emailCommand.action === 'reply') {
        const email = getEmailFromSession(from, emailCommand.emailIndex || 1)

        if (email) {
          // AI generiert Antwort
          const reply = await generateEmailReply(email, emailCommand.content || 'Danke für die E-Mail')

          // Per Stimme vorlesen was gesendet wird
          await callWithVoiceResponse(from,
            `Ich antworte auf die E-Mail von ${email.fromName || email.from}. ` +
            `Betreff: ${reply.subject}. ` +
            `Inhalt: ${reply.body.substring(0, 200)}... ` +
            `Wird jetzt gesendet.`
          )

          // E-Mail senden
          const sent = await sendEmailReply(email, reply.body)

          if (sent) {
            await sendSMS(from,
              `✅ Antwort gesendet an ${email.from}\n\n` +
              `📌 ${reply.subject}\n\n` +
              `${reply.body}`
            )

            // Task recorden
            await recordCompletedTask({
              userId: numericUserId,
              type: 'email',
              recipient: email.from,
              subject: reply.subject,
              originalText: cleanedTranscript,
              resultSummary: `Antwort auf "${email.subject}" gesendet`
            })

            return NextResponse.json({ success: true, type: 'email_reply', sent: true })
          } else {
            await sendSMS(from, `❌ E-Mail konnte nicht gesendet werden. Versuche es später nochmal.`)
            return NextResponse.json({ success: false, type: 'email_reply', error: 'Send failed' })
          }
        } else {
          await callWithVoiceResponse(from, 'Keine E-Mail zum Antworten gefunden. Sage zuerst "meine E-Mails" um sie zu laden.')
          return NextResponse.json({ success: false, type: 'email_reply', error: 'No email' })
        }
      }
    }

    // ============================================
    // 2.7 CALENDAR VOICE - Termine per Stimme
    // ============================================
    if (isCalendarRequest(cleanedTranscript)) {
      console.log(`📅 Kalender-Anfrage erkannt: ${cleanedTranscript}`)

      const calendarRequest = await parseCalendarRequest(cleanedTranscript)

      // TERMINE AUFLISTEN
      if (calendarRequest.action === 'list' || !calendarRequest.action || calendarRequest.action === 'unknown') {
        const events = await fetchUserCalendarEvents(numericUserId, 7)

        const voiceResponse = formatCalendarForVoice(events, 7)
        await callWithVoiceResponse(from, formatVoiceResponse(voiceResponse, 500))

        // SMS mit Übersicht
        if (events.length > 0) {
          const smsText = `📅 Deine Termine:\n\n` +
            events.slice(0, 5).map(e => {
              const day = e.start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
              const time = e.isAllDay ? '(ganztags)' : e.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
              return `• ${day} ${time}: ${e.title}`
            }).join('\n')

          await sendSMS(from, smsText)
        } else {
          await sendSMS(from, '📅 Keine Termine in den nächsten 7 Tagen')
        }

        return NextResponse.json({ success: true, type: 'calendar_list', count: events.length })
      }

      // TERMIN ERSTELLEN
      if (calendarRequest.action === 'create' && calendarRequest.title) {
        // Datum und Zeit berechnen
        let startDate = calendarRequest.date || new Date()
        if (calendarRequest.time) {
          const [hours, minutes] = calendarRequest.time.split(':').map(Number)
          startDate.setHours(hours, minutes, 0, 0)
        }

        const duration = calendarRequest.duration || 60
        const endDate = new Date(startDate.getTime() + duration * 60 * 1000)

        const event = await createLocalCalendarEvent(numericUserId, {
          title: calendarRequest.title,
          start: startDate,
          end: endDate,
          location: calendarRequest.location,
          isAllDay: !calendarRequest.time
        })

        if (event) {
          const dayName = startDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
          const timeStr = calendarRequest.time || 'ganztägig'

          await callWithVoiceResponse(from,
            `Termin erstellt: ${calendarRequest.title}, am ${dayName} um ${timeStr}. ` +
            (calendarRequest.location ? `Ort: ${calendarRequest.location}.` : '')
          )

          await sendSMS(from,
            `✅ Termin erstellt:\n\n` +
            `📌 ${calendarRequest.title}\n` +
            `📅 ${dayName}\n` +
            `⏰ ${timeStr}\n` +
            (calendarRequest.location ? `📍 ${calendarRequest.location}` : '')
          )

          // Task recorden
          await recordCompletedTask({
            userId: numericUserId,
            type: 'other',
            subject: `Termin: ${calendarRequest.title}`,
            originalText: cleanedTranscript,
            resultSummary: `Termin am ${dayName} erstellt`
          })

          return NextResponse.json({ success: true, type: 'calendar_create', event })
        }
      }
    }

    // ============================================
    // 2.8 RESEARCH - Wissenschaftliche Artikel suchen
    // ============================================
    const researchKeywords = ['artikel', 'paper', 'studie', 'forschung', 'research', 'zenodo', 'arxiv', 'pubmed', 'doi', 'lies', 'finde artikel', 'suche artikel']
    const hasResearchKeyword = researchKeywords.some(k => cleanedTranscript.toLowerCase().includes(k))
    const hasUrl = cleanedTranscript.includes('http') || cleanedTranscript.includes('10.') // DOI

    if (hasResearchKeyword || hasUrl) {
      console.log(`📚 Research-Anfrage erkannt: ${cleanedTranscript}`)

      const research = await researchArticle(cleanedTranscript)

      if (research.success && research.article) {
        const voiceResponse = formatArticleForVoice(research.article, research.summary || '')
        console.log(`📞 Rufe zurück mit Artikel-Summary`)

        // Per Stimme vorlesen
        await callWithVoiceResponse(from, formatVoiceResponse(voiceResponse, 400))

        // Vollständige Info per SMS
        const smsText = `📚 ${research.article.title}\n\n` +
          `👥 ${research.article.authors?.slice(0, 3).join(', ')}\n\n` +
          `📝 ${research.summary?.substring(0, 400) || research.article.abstract?.substring(0, 400)}\n\n` +
          `🔗 ${research.article.url}`

        await sendSMS(from, smsText)

        return NextResponse.json({
          success: true,
          type: 'research',
          article: research.article,
          summary: research.summary
        })
      } else {
        // Nichts gefunden - per Stimme mitteilen
        await callWithVoiceResponse(from, `Ich konnte leider keinen passenden Artikel finden. ${research.error || ''}`)
        await sendSMS(from, `❌ Kein Artikel gefunden: ${research.error || 'Versuche es mit anderen Suchbegriffen'}`)

        return NextResponse.json({ success: false, type: 'research', error: research.error })
      }
    }

    // ============================================
    // 2.7 FRAGEN ERKENNEN & BEANTWORTEN
    // ============================================
    if (isQuestion(cleanedTranscript)) {
      const questionCategory = categorizeQuestion(cleanedTranscript)
      console.log(`❓ Frage erkannt (${questionCategory}): ${cleanedTranscript}`)

      let voiceAnswer: string | null = null

      // STATUS-FRAGEN: "Habe ich schon...?", "Wurde... gesendet?"
      if (questionCategory === 'status') {
        // Suche nach dem Thema der Frage
        const searchTerms = cleanedTranscript
          .replace(/\?/g, '')
          .replace(/(schon|bereits|erledigt|gesendet|gemacht|habe ich|wurde|status)/gi, '')
          .trim()

        const taskStatus = await getTaskStatus(numericUserId, searchTerms)

        if (taskStatus) {
          voiceAnswer = `Ja, das wurde erledigt. ${taskStatus.result_summary || ''}`
        } else {
          // Letzte Tasks durchsuchen
          const recentTasks = await getRecentTasks(numericUserId, 5)
          if (recentTasks.length > 0) {
            const relevant = recentTasks.find(t =>
              t.recipient?.toLowerCase().includes(searchTerms.toLowerCase()) ||
              t.subject?.toLowerCase().includes(searchTerms.toLowerCase())
            )
            if (relevant) {
              voiceAnswer = `Ja, ${relevant.task_type} an ${relevant.recipient} wurde erledigt. ${relevant.result_summary || ''}`
            } else {
              voiceAnswer = `Ich habe keinen Auftrag zu "${searchTerms}" gefunden. Deine letzten Aktionen waren: ${recentTasks.slice(0, 3).map(t => t.task_type + ' an ' + (t.recipient || 'unbekannt')).join(', ')}.`
            }
          } else {
            voiceAnswer = `Dazu habe ich keine Aufzeichnung. Soll ich dir helfen, das zu erledigen?`
          }
        }
      }

      // INFO-FRAGEN: Wissen abrufen
      else if (questionCategory === 'info') {
        // AI für allgemeine Fragen nutzen
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: `Du bist MOI, ein hilfreicher Sprachassistent. Antworte kurz und prägnant (max 2-3 Sätze), da die Antwort vorgelesen wird. Keine Formatierung, kein Markdown.`,
          messages: [{ role: 'user', content: cleanedTranscript }]
        })

        voiceAnswer = response.content[0].type === 'text' ? response.content[0].text : null
      }

      // ALLGEMEINE FRAGEN: AI antwortet
      else if (questionCategory === 'general') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: `Du bist MOI, ein hilfreicher Sprachassistent. Antworte kurz und prägnant (max 2-3 Sätze), da die Antwort vorgelesen wird. Keine Formatierung, kein Markdown.`,
          messages: [{ role: 'user', content: cleanedTranscript }]
        })

        voiceAnswer = response.content[0].type === 'text' ? response.content[0].text : null
      }

      // Antwort per Rückruf vorlesen!
      if (voiceAnswer) {
        const formattedAnswer = formatVoiceResponse(voiceAnswer)
        console.log(`📞 Rufe zurück mit Antwort: ${formattedAnswer.substring(0, 100)}...`)

        // Sofort zurückrufen
        await callWithVoiceResponse(from, formattedAnswer)

        // Auch per SMS senden (als Backup/Referenz)
        await sendSMS(from, `💬 MOI: ${voiceAnswer}`)

        return NextResponse.json({ success: true, type: 'voice_answer', answer: voiceAnswer })
      }
    }

    // ============================================
    // 2.7 DUPLIKAT-CHECK: Schon erledigt?
    // ============================================
    const duplicateCheck = await checkForDuplicateTask(numericUserId, cleanedTranscript, 24)

    if (duplicateCheck.isDuplicate && duplicateCheck.similarity >= 85) {
      console.log(`🔄 Duplikat erkannt: ${duplicateCheck.message}`)

      // Per Stimme informieren
      const duplicateMessage = `Moment, das habe ich schon erledigt. ${duplicateCheck.existingTask?.result_summary || 'Der Auftrag wurde bereits ausgeführt.'}`
      await callWithVoiceResponse(from, duplicateMessage)

      // Auch SMS
      await sendSMS(from, `⚠️ ${duplicateCheck.message}`)

      return NextResponse.json({ success: true, type: 'duplicate', message: duplicateCheck.message })
    }

    // ============================================
    // 3. Asset generieren (MIT Brain-Insights!)
    // ============================================
    const asset = await generateAsset(enrichedTranscript)

    console.log(`✨ Asset erstellt: ${asset.type} - ${asset.title}`)

    // ============================================
    // 4. Falls Präsentation/Website: Datei erstellen & Upload
    // ============================================
    let fileUrl: string | null = null

    if (asset.type === 'presentation') {
      try {
        const slides = JSON.parse(asset.content)
        const pptxBuffer = await createPresentation(slides, asset.title || 'Präsentation')

        // Upload zu Supabase Storage
        const fileName = `voice_${Date.now()}_${asset.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'presentation'}.pptx`
        const { data, error } = await supabase.storage
          .from('assets')
          .upload(fileName, pptxBuffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          })

        if (!error) {
          const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName)
          fileUrl = urlData.publicUrl
        }
      } catch (e) {
        console.error('PPTX Fehler:', e)
      }
    }

    // Website/HTML mit AI-generierten Bildern!
    if (asset.type === 'website') {
      try {
        let htmlContent = asset.content
        const timestamp = Date.now()

        // 🎨 ECHTE BILDER GENERIEREN - Parallel!
        console.log('🎨 Generiere AI-Bilder...')
        const topic = asset.title || cleanedTranscript.substring(0, 50)
        const imagePrompts = generateImagePrompts(topic, 'landing')

        // Bilder parallel generieren (schnell!)
        const imageResults = await generateImages(imagePrompts)
        const generatedImages: string[] = []

        // Bilder hochladen und URLs sammeln
        for (let i = 0; i < imageResults.length; i++) {
          const result = imageResults[i]
          if (result.success && result.imageUrl) {
            // Wenn es eine externe URL ist, direkt nutzen
            if (result.imageUrl.startsWith('http')) {
              // Bild zu Supabase hochladen für permanente URL
              const imgFileName = `img_${timestamp}_${i}.png`
              const uploadedUrl = await uploadImageToStorage(result.imageUrl, imgFileName, supabase)
              generatedImages.push(uploadedUrl || result.imageUrl)
            } else {
              // Data URL direkt nutzen (Base64)
              generatedImages.push(result.imageUrl)
            }
          }
        }

        console.log(`✅ ${generatedImages.length} Bilder generiert`)

        // Unsplash-Platzhalter durch echte Bilder ersetzen
        if (generatedImages.length > 0) {
          // Ersetze source.unsplash.com URLs durch generierte Bilder
          let imgIndex = 0
          htmlContent = htmlContent.replace(
            /https:\/\/source\.unsplash\.com\/[^"'\s]+/g,
            () => {
              const img = generatedImages[imgIndex % generatedImages.length]
              imgIndex++
              return img
            }
          )

          // Falls keine Unsplash URLs, füge Hero-Bild ein
          if (imgIndex === 0 && generatedImages[0]) {
            // Suche nach erstem img Tag oder füge vor </head> ein
            if (htmlContent.includes('<img')) {
              htmlContent = htmlContent.replace(
                /<img([^>]*)src="[^"]*"([^>]*)>/,
                `<img$1src="${generatedImages[0]}"$2>`
              )
            }
          }
        }

        const fileName = `website_${timestamp}_${asset.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'page'}.html`

        const { error } = await supabase.storage
          .from('assets')
          .upload(fileName, htmlContent, {
            contentType: 'text/html'
          })

        if (!error) {
          const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName)
          fileUrl = urlData.publicUrl
          console.log(`🌐 Website mit AI-Bildern hochgeladen: ${fileUrl}`)
        }
      } catch (e) {
        console.error('HTML/Image Fehler:', e)
      }
    }

    // ============================================
    // 5. E-Mail senden falls E-Mail-Adresse im Transkript
    // ============================================
    const emailAddress = extractEmailFromText(cleanedTranscript)
    if (emailAddress) {
      console.log(`📧 E-Mail-Adresse erkannt: ${emailAddress}`)

      // E-Mail senden
      // DALL-E Prompts extrahieren falls Website
      let dallePrompts = ''
      if (asset.type === 'website') {
        const dalleMatch = asset.content.match(/<!--\s*DALL-E PROMPTS[^>]*:([\s\S]*?)-->/i)
        if (dalleMatch) {
          dallePrompts = dalleMatch[1].trim()
        }
      }

      const emailBody = asset.type === 'presentation'
        ? `Hier ist deine Präsentation "${asset.title}"!\n\nDownload: ${fileUrl || 'Datei wird verarbeitet...'}`
        : asset.type === 'website'
        ? `Hier ist deine Website "${asset.title}"!\n\nLink: ${fileUrl || 'Wird verarbeitet...'}\n\n${dallePrompts ? `--- DALL-E/Midjourney Prompts für Custom Bilder ---\n${dallePrompts}` : ''}`
        : asset.content

      const emailHtml = asset.type === 'presentation'
        ? `<p>Hier ist deine Präsentation "<strong>${asset.title}</strong>"!</p><p><a href="${fileUrl}">📥 Download PPTX</a></p>`
        : asset.type === 'website'
        ? `<p>Hier ist deine Website "<strong>${asset.title}</strong>"!</p>
           <p><a href="${fileUrl}" style="display:inline-block;padding:12px 24px;background:#667eea;color:white;text-decoration:none;border-radius:8px;">🌐 Website öffnen</a></p>
           ${dallePrompts ? `<hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
           <h3>🎨 Custom Bilder mit DALL-E/Midjourney:</h3>
           <pre style="background:#f5f5f5;padding:15px;border-radius:8px;white-space:pre-wrap;">${dallePrompts}</pre>
           <p><em>Kopiere diese Prompts für einzigartige Bilder!</em></p>` : ''}`
        : undefined

      const emailResult = await sendEmail({
        to: emailAddress,
        subject: asset.title || 'Dein MOI Ergebnis',
        body: emailBody,
        html: emailHtml
      })

      if (emailResult.success) {
        console.log(`✅ E-Mail gesendet an ${emailAddress}`)

        // 🔄 AUTO FOLLOW-UP aktivieren für E-Mails/Angebote
        if (asset.type === 'email' || cleanedTranscript.toLowerCase().includes('angebot')) {
          try {
            await createFollowUp({
              userId: numericUserId,
              phone: from,
              type: asset.type === 'email' ? 'email' : 'angebot',
              recipientEmail: emailAddress,
              subject: asset.title,
              content: asset.content.substring(0, 500),
              followUpAfterHours: 72, // 3 Tage
              maxFollowUps: 3
            })
            console.log(`📅 Follow-Up für ${emailAddress} erstellt`)
          } catch (e) {
            console.log('Follow-Up erstellen übersprungen:', e)
          }
        }

        // 📋 Multi-Channel Sync: E-Mail tracken
        try {
          await addToConversationThread(
            numericUserId,
            'email',
            emailAddress,
            'out',
            `${asset.title}: ${asset.content.substring(0, 200)}...`
          )
        } catch (e) {
          console.log('Thread-Sync übersprungen:', e)
        }
      } else {
        console.error(`❌ E-Mail Fehler: ${emailResult.error}`)
      }
    }

    // ============================================
    // 5.5 VOICE-TO-CRM: Kunden-Updates erkennen
    // ============================================
    const crmKeywords = ['update', 'kunde', 'gespräch', 'meeting', 'angebot', 'preis', 'rabatt', 'deal']
    const hasCrmKeyword = crmKeywords.some(k => cleanedTranscript.toLowerCase().includes(k))

    if (hasCrmKeyword && !emailAddress) {
      // Könnte ein CRM-Update sein
      try {
        const customerUpdate = await saveCustomerUpdate(numericUserId, cleanedTranscript)
        if (customerUpdate) {
          console.log(`📋 CRM Update: ${customerUpdate.customer_name}`)

          // Deal Intelligence: Wenn Preis genannt
          if (customerUpdate.deal_value) {
            const dealAnalysis = await analyzeDeal(
              numericUserId,
              cleanedTranscript,
              customerUpdate.deal_value
            )
            if (dealAnalysis.suggestedPrice && dealAnalysis.suggestedPrice !== customerUpdate.deal_value) {
              // Preisempfehlung per SMS
              await sendSMS(from,
                `💡 Deal-Tipp: Statt ${customerUpdate.deal_value}€ könntest du ${dealAnalysis.suggestedPrice}€ verlangen.\n\n` +
                `Grund: ${dealAnalysis.reasoning?.substring(0, 100) || 'Basierend auf vergangenen Deals'}`
              )
            }
          }
        }
      } catch (e) {
        console.log('CRM-Update übersprungen:', e)
      }
    }

    // ============================================
    // 6. SMS senden (immer als Bestätigung)
    // ============================================
    const deliveryMethod = user.delivery_preference || 'sms'
    const message = formatDeliveryMessage(asset, fileUrl, emailAddress)

    if (deliveryMethod === 'whatsapp' && process.env.TWILIO_WHATSAPP_NUMBER) {
      await sendWhatsApp(from, message, fileUrl)
    } else {
      await sendSMS(from, message)
    }

    // ============================================
    // 6. Credit abziehen & Interaktion speichern (graceful fallback)
    // ============================================
    try {
      await supabase
        .from('voice_users')
        .update({ credits: user.credits - 1 })
        .eq('phone', from)

      // Interaktion für Lernen/Analytics speichern
      await supabase.from('voice_interactions').insert({
        phone: from,
        call_sid: callSid,
        transcript: cleanedTranscript,
        asset_type: asset.type,
        asset_title: asset.title,
        asset_content: asset.content.substring(0, 5000),
        file_url: fileUrl,
        delivery_method: deliveryMethod,
        duration: parseInt(duration) || 0,
        created_at: new Date().toISOString()
      })
    } catch (dbError) {
      // Tabellen existieren noch nicht - ignorieren, SMS wurde trotzdem gesendet
      console.log('⚠️ DB save failed (tables may not exist):', dbError)
    }

    // ============================================
    // 7. TASK RECORDING - Erledigten Auftrag speichern
    // ============================================
    try {
      const taskType = asset.type === 'email' ? 'email'
        : asset.type === 'presentation' ? 'other'
        : asset.type === 'website' ? 'website'
        : asset.type === 'social' ? 'sms'
        : 'other'

      await recordCompletedTask({
        userId: numericUserId,
        type: taskType as any,
        recipient: emailAddress || undefined,
        subject: asset.title,
        originalText: cleanedTranscript,
        resultSummary: emailAddress
          ? `${asset.type} an ${emailAddress} gesendet`
          : `${asset.type} erstellt: ${asset.title}`
      })
      console.log(`📝 Task recorded: ${asset.type}`)
    } catch (e) {
      console.log('Task recording skipped:', e)
    }

    console.log(`✅ Erfolgreich an ${from} geliefert`)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Voice processing error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Transkribiert Audio mit Groq Whisper (kostenlos!)
async function transcribeWithWhisper(audioUrl: string): Promise<string> {
  // Audio von Twilio herunterladen (braucht Auth)
  const audioResponse = await fetch(audioUrl, {
    headers: {
      'Authorization': `Basic ${Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64')}`
    }
  })

  const audioBuffer = await audioResponse.arrayBuffer()

  // An Groq Whisper senden - MULTILINGUAL!
  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer]), 'audio.mp3')
  formData.append('model', 'whisper-large-v3')
  // KEIN language Parameter = Auto-Detect für ALLE Sprachen!
  // Whisper erkennt automatisch: Deutsch, Englisch, Spanisch, Französisch, etc.

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: formData
  })

  const result = await response.json()

  if (result.error) {
    console.error('Whisper error:', result.error)
    throw new Error('Transcription failed')
  }

  return result.text || ''
}

// Voice User anlegen/holen - mit Fallback wenn Tabelle nicht existiert
async function getOrCreateVoiceUser(phone: string) {
  try {
    const { data: existing, error } = await supabase
      .from('voice_users')
      .select('*')
      .eq('phone', phone)
      .single()

    if (error && error.code === 'PGRST205') {
      // Tabelle existiert nicht - Fallback: unbegrenzte Credits
      console.log('⚠️ voice_users table not found, using fallback')
      return { phone, credits: 999, delivery_preference: 'sms' }
    }

    if (existing) return existing

    const { data: newUser } = await supabase
      .from('voice_users')
      .insert({
        phone,
        credits: 3,
        delivery_preference: 'sms',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    return newUser || { phone, credits: 3, delivery_preference: 'sms' }
  } catch (e) {
    console.log('⚠️ voice_users error, using fallback:', e)
    return { phone, credits: 999, delivery_preference: 'sms' }
  }
}

// Nachricht für Delivery formatieren
function formatDeliveryMessage(asset: any, fileUrl: string | null, emailSentTo?: string | null): string {
  const emojis: Record<string, string> = {
    text: '📝', listing: '🏷️', presentation: '📊', email: '📧',
    social: '📱', code: '💻', document: '📄', website: '🌐', default: '✨'
  }
  const emoji = emojis[asset.type] || emojis.default

  let message = ''

  switch (asset.type) {
    case 'listing':
      message = `${emoji} Listing fertig:\n\n${asset.content.substring(0, 1400)}`
      break
    case 'presentation':
      message = emailSentTo
        ? `${emoji} Präsentation "${asset.title}" fertig!\n\n📧 E-Mail gesendet an ${emailSentTo}\n\n${fileUrl || ''}`
        : `${emoji} Präsentation "${asset.title}" fertig!\n\n${fileUrl || 'Download folgt per E-Mail'}`
      break
    case 'website':
      message = emailSentTo
        ? `${emoji} Website "${asset.title}" fertig!\n\n📧 E-Mail gesendet an ${emailSentTo}\n\n🔗 ${fileUrl || ''}`
        : `${emoji} Website "${asset.title}" fertig!\n\n🔗 ${fileUrl || 'Link folgt...'}`
      break
    case 'email':
      message = emailSentTo
        ? `${emoji} E-Mail gesendet an ${emailSentTo}!`
        : `${emoji} E-Mail:\n\n${asset.content.substring(0, 1400)}`
      break
    default:
      message = asset.title
        ? `${emoji} ${asset.title}\n\n${asset.content.substring(0, 1400)}`
        : `${emoji} ${asset.content.substring(0, 1500)}`
  }

  // E-Mail-Hinweis anhängen wenn gesendet
  if (emailSentTo && asset.type !== 'presentation' && asset.type !== 'email') {
    message += `\n\n📧 Auch per E-Mail an ${emailSentTo} gesendet`
  }

  // SMS Limit beachten (1600 Zeichen für Twilio)
  return message.length > 1550
    ? message.substring(0, 1550) + '...'
    : message
}
