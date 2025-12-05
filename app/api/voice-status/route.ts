import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateAsset } from '@/lib/ai-engine'
import { createPresentation } from '@/lib/pptx'
import { sendSMS, sendWhatsApp } from '@/lib/twilio-deliver'

// ============================================
// VOICE STATUS - Die Haupt-Verarbeitung!
// ============================================
// Twilio ruft diese URL wenn die Aufnahme fertig hochgeladen ist
// Hier passiert die Magie: Transkription → AI → Delivery

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const recordingUrl = formData.get('RecordingUrl') as string
    const from = formData.get('From') as string // Telefonnummer des Anrufers
    const callSid = formData.get('CallSid') as string
    const duration = formData.get('RecordingDuration') as string

    console.log(`🎤 Verarbeite Aufnahme von ${from}: ${duration}s`)

    // ============================================
    // 1. User anlegen/holen (Telefonnummer = ID)
    // ============================================
    const user = await getOrCreateVoiceUser(from)

    // Credits prüfen
    if (user.credits <= 0) {
      await sendSMS(from, '⚠️ Deine Credits sind aufgebraucht. Mehr unter: moi.app/buy')
      return NextResponse.json({ success: false, error: 'No credits' })
    }

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
    // 4. Falls Präsentation: PPTX erstellen & Upload
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

    // ============================================
    // 5. Ausliefern per SMS (oder WhatsApp falls eingestellt)
    // ============================================
    const deliveryMethod = user.delivery_preference || 'sms'
    const message = formatDeliveryMessage(asset, fileUrl)

    if (deliveryMethod === 'whatsapp' && process.env.TWILIO_WHATSAPP_NUMBER) {
      await sendWhatsApp(from, message, fileUrl)
    } else {
      await sendSMS(from, message)
    }

    // ============================================
    // 6. Credit abziehen & Interaktion speichern
    // ============================================
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
      asset_content: asset.content.substring(0, 5000), // Limit für DB
      file_url: fileUrl,
      delivery_method: deliveryMethod,
      duration: parseInt(duration) || 0,
      created_at: new Date().toISOString()
    })

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

// Voice User anlegen/holen (separate Tabelle für Telefon-basierte User)
async function getOrCreateVoiceUser(phone: string) {
  const { data: existing } = await supabase
    .from('voice_users')
    .select('*')
    .eq('phone', phone)
    .single()

  if (existing) return existing

  const { data: newUser } = await supabase
    .from('voice_users')
    .insert({
      phone,
      credits: 3, // 3 kostenlose Assets
      delivery_preference: 'sms',
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  return newUser || { phone, credits: 3, delivery_preference: 'sms' }
}

// Nachricht für Delivery formatieren
function formatDeliveryMessage(asset: any, fileUrl: string | null): string {
  const emojis: Record<string, string> = {
    text: '📝', listing: '🏷️', presentation: '📊', email: '📧',
    social: '📱', code: '💻', document: '📄', default: '✨'
  }
  const emoji = emojis[asset.type] || emojis.default

  let message = ''

  switch (asset.type) {
    case 'listing':
      message = `${emoji} Listing fertig:\n\n${asset.content.substring(0, 1400)}`
      break
    case 'presentation':
      message = `${emoji} Präsentation "${asset.title}" fertig!\n\n${fileUrl || 'Download folgt per E-Mail'}`
      break
    case 'email':
      message = `${emoji} E-Mail:\n\n${asset.content.substring(0, 1400)}`
      break
    default:
      message = asset.title
        ? `${emoji} ${asset.title}\n\n${asset.content.substring(0, 1400)}`
        : `${emoji} ${asset.content.substring(0, 1500)}`
  }

  // SMS Limit beachten (1600 Zeichen für Twilio)
  return message.length > 1550
    ? message.substring(0, 1550) + '...'
    : message
}
