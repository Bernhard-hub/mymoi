import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateAsset } from '@/lib/ai-engine'
import { createPresentation } from '@/lib/pptx'
import { sendSMS, sendWhatsApp } from '@/lib/twilio-deliver'
import { sendEmail, extractEmailFromText } from '@/lib/email'

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
    // 3. Asset generieren (GLEICHE Engine wie Telegram!)
    // ============================================
    const asset = await generateAsset(cleanedTranscript)

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

    // Website/HTML als Datei hochladen
    if (asset.type === 'website') {
      try {
        const htmlContent = asset.content
        const fileName = `website_${Date.now()}_${asset.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'page'}.html`

        const { data, error } = await supabase.storage
          .from('assets')
          .upload(fileName, htmlContent, {
            contentType: 'text/html'
          })

        if (!error) {
          const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName)
          fileUrl = urlData.publicUrl
          console.log(`🌐 Website hochgeladen: ${fileUrl}`)
        }
      } catch (e) {
        console.error('HTML Upload Fehler:', e)
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
      } else {
        console.error(`❌ E-Mail Fehler: ${emailResult.error}`)
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

  // An Groq Whisper senden
  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer]), 'audio.mp3')
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'de') // Deutsch als Standard

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
