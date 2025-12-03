import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, useCredit, uploadFile } from '@/lib/supabase'
import { generateAsset } from '@/lib/claude'
import { createPresentation } from '@/lib/pptx'

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`

// Nachricht an User senden
async function sendMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  })
}

// Dokument senden
async function sendDocument(chatId: number, fileUrl: string, fileName: string, caption?: string) {
  await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileUrl,
      filename: fileName,
      caption
    })
  })
}

// Voice in Text umwandeln (Groq Whisper - kostenlos)
async function transcribeVoice(fileId: string): Promise<string> {
  // Telegram File URL holen
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)
  const fileData = await fileRes.json()
  const filePath = fileData.result.file_path
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`

  // Audio downloaden
  const audioRes = await fetch(fileUrl)
  const audioBuffer = await audioRes.arrayBuffer()

  // An Groq Whisper senden
  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer]), 'audio.ogg')
  formData.append('model', 'whisper-large-v3')

  const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: formData
  })

  const result = await whisperRes.json()
  return result.text || ''
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = body.message

    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const userId = message.from.id
    const userName = message.from.first_name || 'User'

    // User anlegen/holen
    const user = await getOrCreateUser(userId, userName)

    // Text oder Voice?
    let userText = ''

    if (message.voice) {
      await sendMessage(chatId, '🎤 Höre zu...')
      userText = await transcribeVoice(message.voice.file_id)
    } else if (message.text) {
      // /start Befehl
      if (message.text === '/start') {
        await sendMessage(chatId, 
          `Hey ${userName}! 👋\n\nIch bin *Moi*.\n\nSchick mir eine Sprachnachricht und sag was du brauchst:\n\n• Präsentation\n• eBay-Listing\n• E-Mail\n• Oder einfach eine Idee\n\nIch liefere. Fertig.\n\n_Erste 3 Assets kostenlos._`
        )
        return NextResponse.json({ ok: true })
      }
      userText = message.text
    }

    if (!userText) {
      await sendMessage(chatId, 'Schick mir eine Sprachnachricht oder Text.')
      return NextResponse.json({ ok: true })
    }

    // Credits prüfen
    const hasCredits = await useCredit(userId)
    if (!hasCredits) {
      await sendMessage(chatId,
        `Deine kostenlosen Assets sind aufgebraucht.\n\n💳 10 weitere für 2€?\n\n_Payment kommt bald – schreib mir wenn du weitermachen willst._`
      )
      return NextResponse.json({ ok: true })
    }

    // Asset generieren
    await sendMessage(chatId, '⚡ Erstelle...')
    const asset = await generateAsset(userText)

    // Je nach Typ ausliefern
    if (asset.type === 'presentation') {
      try {
        const slides = JSON.parse(asset.content)
        const pptxBuffer = await createPresentation(slides, asset.title || 'Präsentation')
        const fileName = `${asset.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'presentation'}_${Date.now()}.pptx`
        
        const fileUrl = await uploadFile(fileName, pptxBuffer, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        
        await sendDocument(chatId, fileUrl, fileName, `✅ ${asset.title}`)
      } catch (e) {
        await sendMessage(chatId, asset.content)
      }
    } else {
      // Text, Listing, Email direkt senden
      const prefix = asset.type === 'listing' ? '🏷️ *Listing:*\n\n' 
                   : asset.type === 'email' ? '📧 *E-Mail:*\n\n'
                   : ''
      await sendMessage(chatId, prefix + asset.content)
    }

    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
