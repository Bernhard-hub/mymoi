import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, useCredit, uploadFile, saveAsset, supabase } from '@/lib/supabase'
import { generateAsset, AssetType } from '@/lib/ai-engine'
import { createPresentation } from '@/lib/pptx'
import { searchYouTube, searchWeb, getWeather, getNews, getMapLink } from '@/lib/web-search'
import { sendInvoice, answerPreCheckoutQuery, sendPaymentMenu, processSuccessfulPayment, CREDIT_PACKAGES } from '@/lib/payment'

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`

// ============================================
// TELEGRAM HELPER FUNCTIONS
// ============================================

async function sendMessage(chatId: number, text: string, options?: {
  parse_mode?: 'Markdown' | 'HTML'
  reply_markup?: object
  disable_web_page_preview?: boolean
}) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'Markdown',
      reply_markup: options?.reply_markup,
      disable_web_page_preview: options?.disable_web_page_preview
    })
  })
  return response.json()
}

async function sendDocument(chatId: number, fileUrl: string, fileName: string, caption?: string) {
  await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileUrl,
      filename: fileName,
      caption,
      parse_mode: 'Markdown'
    })
  })
}

// Datei direkt als Buffer senden (für PPTX, PDF, etc.)
async function sendDocumentBuffer(chatId: number, fileBuffer: Buffer, fileName: string, caption?: string) {
  const formData = new FormData()
  formData.append('chat_id', chatId.toString())
  // Buffer zu Uint8Array konvertieren für Blob-Kompatibilität
  const uint8Array = new Uint8Array(fileBuffer)
  formData.append('document', new Blob([uint8Array]), fileName)
  if (caption) {
    formData.append('caption', caption)
    formData.append('parse_mode', 'Markdown')
  }

  const response = await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    body: formData
  })
  return response.json()
}

async function sendChatAction(chatId: number, action: 'typing' | 'upload_document' | 'record_voice') {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action })
  })
}

// Voice in Text umwandeln (Groq Whisper)
async function transcribeVoice(fileId: string): Promise<string> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)
  const fileData = await fileRes.json()
  const filePath = fileData.result.file_path
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`

  const audioRes = await fetch(fileUrl)
  const audioBuffer = await audioRes.arrayBuffer()

  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer]), 'audio.ogg')
  formData.append('model', 'whisper-large-v3')

  const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: formData
  })

  const result = await whisperRes.json()
  return result.text || ''
}

// ============================================
// INTENT DETECTION - Was will der User?
// ============================================
function detectIntent(text: string): { type: 'youtube' | 'web' | 'weather' | 'news' | 'maps' | 'buy' | 'phone' | 'whatsapp' | 'sms' | 'asset', query: string } {
  const lower = text.toLowerCase()

  // TELEFONNUMMER ERKENNUNG - Die Killer-Feature!
  // Matches: +43 664 1234567, 0664/1234567, 0043-664-1234567, etc.
  const phoneRegex = /(\+?\d{1,4}[\s\-\/]?\(?\d{1,4}\)?[\s\-\/]?\d{2,4}[\s\-\/]?\d{2,4}[\s\-\/]?\d{0,4})/
  const phoneMatch = text.match(phoneRegex)
  if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 8) {
    return { type: 'phone', query: phoneMatch[0] }
  }

  // WhatsApp erwähnt
  if (lower.includes('whatsapp') || lower.includes('wa ') || lower.includes('whats app')) {
    return { type: 'whatsapp', query: text.replace(/whatsapp|wa |whats app/gi, '').trim() }
  }

  // SMS senden
  if (lower.includes('sms') || lower.includes('nachricht senden') || lower.includes('textnachricht')) {
    return { type: 'sms', query: text.replace(/sms|nachricht senden|textnachricht/gi, '').trim() }
  }

  // YouTube
  if (lower.includes('youtube') || lower.includes('video') || lower.includes('tutorial') ||
      lower.includes('zeig mir') || lower.includes('film') || lower.includes('musik video')) {
    const query = text.replace(/youtube|video|zeig mir|tutorial|film|musik/gi, '').trim()
    return { type: 'youtube', query: query || text }
  }

  // Wetter
  if (lower.includes('wetter') || lower.includes('temperatur') || lower.includes('regnet') ||
      lower.includes('weather') || lower.includes('sonnig') || lower.includes('kalt') ||
      lower.includes('warm') || lower.includes('grad')) {
    const cityMatch = text.match(/(?:in|für|bei)\s+(\w+)/i) || text.match(/wetter\s+(\w+)/i)
    return { type: 'weather', query: cityMatch?.[1] || 'Berlin' }
  }

  // News
  if (lower.includes('news') || lower.includes('nachrichten') || lower.includes('aktuell') ||
      lower.includes('neuigkeiten') || lower.includes('was gibt es neues')) {
    const query = text.replace(/news|nachrichten|aktuell|neuigkeiten|was gibt es neues/gi, '').trim()
    return { type: 'news', query: query || 'Deutschland' }
  }

  // Maps/Navigation
  if (lower.includes('karte') || lower.includes('map') || lower.includes('navigation') ||
      lower.includes('route') || lower.includes('weg zu') || lower.includes('wie komme ich')) {
    const query = text.replace(/karte|map|navigation|route|weg zu|wie komme ich/gi, '').trim()
    return { type: 'maps', query: query || 'Berlin' }
  }

  // Web Search
  if (lower.includes('such') || lower.includes('google') || lower.includes('find') ||
      lower.includes('link') || lower.includes('website') || lower.includes('seite')) {
    const query = text.replace(/such|google|find|link|website|seite/gi, '').trim()
    return { type: 'web', query: query || text }
  }

  // Kaufen
  if (lower.includes('kaufen') || lower.includes('credits') || lower.includes('bezahlen') ||
      lower.includes('payment') || lower.includes('premium') || lower.includes('upgrade')) {
    return { type: 'buy', query: '' }
  }

  // Default: AI Asset generieren
  return { type: 'asset', query: text }
}

// ============================================
// EMOJI MAPPING
// ============================================
const ASSET_EMOJIS: Record<string, string> = {
  text: '📝', listing: '🏷️', presentation: '📊', email: '📧',
  social: '📱', website: '🌐', code: '💻', document: '📄',
  script: '🎬', image_prompt: '🎨', research: '🔍', translate: '🌍',
  voice_script: '🎤', calendar: '📅', invoice: '🧾', contract: '📜',
  resume: '📋', business_plan: '💼', meal_plan: '🍽️', workout: '💪',
  study_plan: '📚', budget: '💰', todo_list: '✅', travel_plan: '✈️',
  weather: '🌦️', reminder: '⏰', video_script: '🎬', qr_code: '📱',
  meme: '😂', music_prompt: '🎵', map_route: '🗺️', gift_idea: '🎁',
  dream_journal: '🌙', poetry: '🎭', story: '📖', affirmation: '🌟',
  meditation: '🧘', joke: '😄', quiz: '❓', flashcards: '🃏',
  debate: '⚖️', swot: '📊', persona: '👤', pitch: '🚀', slogan: '✨',
  life_coach: '🧠', horoscope: '🔮', tarot: '🃏', playlist: '🎧',
  book_recommend: '📚', movie_recommend: '🎬', default: '✨'
}

// ============================================
// WELCOME MESSAGE
// ============================================
const WELCOME_MESSAGE = `Hey! 👋

Ich bin *MOI* - dein ultimativer AI-Assistent mit ECHTEN Links!

🎬 *YouTube Videos* - "Zeig mir ein Video über..."
🌦️ *Wetter* - "Wie ist das Wetter in Berlin?"
📰 *News* - "Nachrichten über..."
🗺️ *Maps* - "Route nach München"
🔍 *Web Suche* - "Such mir..."

📊 *200+ AI Assets:*
• Präsentationen & Dokumente
• E-Mails & Bewerbungen
• Business Plans & Pitch Decks
• Fitness & Ernährungspläne
• Horoskope & Tarot
... und vieles mehr!

💳 /buy - Credits kaufen
💰 /credits - Deine Credits

*Schick mir einfach eine Nachricht!* 🚀`

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = body.message
    const callbackQuery = body.callback_query
    const preCheckoutQuery = body.pre_checkout_query
    const successfulPayment = message?.successful_payment

    // ============================================
    // PAYMENT: Pre-Checkout Query
    // ============================================
    if (preCheckoutQuery) {
      // WICHTIG: Muss innerhalb 10 Sekunden beantwortet werden!
      await answerPreCheckoutQuery(preCheckoutQuery.id, true)
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // PAYMENT: Erfolgreiche Zahlung
    // ============================================
    if (successfulPayment) {
      const chatId = message.chat.id
      const userId = message.from.id
      const credits = await processSuccessfulPayment(userId, successfulPayment.invoice_payload)

      // Credits gutschreiben
      await supabase
        .from('users')
        .update({ credits: supabase.rpc('increment_credits', { amount: credits }) })
        .eq('telegram_id', userId)

      // Alternativ direkt:
      const { data: user } = await supabase
        .from('users')
        .select('credits')
        .eq('telegram_id', userId)
        .single()

      if (user) {
        await supabase
          .from('users')
          .update({ credits: user.credits + credits })
          .eq('telegram_id', userId)
      }

      await sendMessage(chatId, `🎉 *Zahlung erfolgreich!*

+${credits} Credits wurden gutgeschrieben!

Du hast jetzt *${(user?.credits || 0) + credits} Credits*.

Viel Spaß mit MOI! 🚀`)
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // CALLBACK QUERIES (Button Clicks)
    // ============================================
    if (callbackQuery) {
      const chatId = callbackQuery.message.chat.id
      const data = callbackQuery.data

      // Payment Buttons
      if (data.startsWith('buy_')) {
        const packageId = data.replace('buy_', '')
        await sendInvoice(chatId, packageId)
      }

      return NextResponse.json({ ok: true })
    }

    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const userId = message.from.id
    const userName = message.from.first_name || 'User'

    // User anlegen/holen
    const user = await getOrCreateUser(userId, userName)

    // Text oder Voice?
    let userText = ''

    if (message.voice) {
      await sendChatAction(chatId, 'typing')
      await sendMessage(chatId, '🎤 *Höre zu...*')
      userText = await transcribeVoice(message.voice.file_id)
      if (!userText) {
        await sendMessage(chatId, 'Konnte die Sprachnachricht nicht verstehen. Versuch es nochmal!')
        return NextResponse.json({ ok: true })
      }
      await sendMessage(chatId, `📝 _"${userText}"_`)
    } else if (message.text) {
      // COMMANDS
      if (message.text === '/start') {
        await sendMessage(chatId, WELCOME_MESSAGE)
        return NextResponse.json({ ok: true })
      }

      if (message.text === '/help') {
        await sendMessage(chatId, WELCOME_MESSAGE)
        return NextResponse.json({ ok: true })
      }

      if (message.text === '/credits') {
        await sendMessage(chatId, `💰 *Deine Credits:* ${user.credits}

/buy - Mehr Credits kaufen`)
        return NextResponse.json({ ok: true })
      }

      if (message.text === '/buy') {
        await sendPaymentMenu(chatId, userId)
        return NextResponse.json({ ok: true })
      }

      userText = message.text
    } else {
      return NextResponse.json({ ok: true })
    }

    // Intent erkennen
    const intent = detectIntent(userText)
    await sendChatAction(chatId, 'typing')

    // ============================================
    // YOUTUBE VIDEOS
    // ============================================
    if (intent.type === 'youtube') {
      const videos = await searchYouTube(intent.query)
      if (videos.length > 0) {
        let response = `🎬 *YouTube Videos für "${intent.query}":*\n\n`
        videos.forEach((v, i) => {
          response += `${i + 1}. [${v.title}](${v.url})\n_${v.channel}_\n\n`
        })
        await sendMessage(chatId, response, { disable_web_page_preview: false })
      } else {
        await sendMessage(chatId, `Keine Videos gefunden. Hier ist der YouTube Link:\nhttps://www.youtube.com/results?search_query=${encodeURIComponent(intent.query)}`)
      }
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // WETTER
    // ============================================
    if (intent.type === 'weather') {
      const weather = await getWeather(intent.query)
      if (weather) {
        const emojis: Record<string, string> = {
          'Klar': '☀️', 'Überwiegend klar': '🌤️', 'Teilweise bewölkt': '⛅',
          'Bewölkt': '☁️', 'Nebel': '🌫️', 'Regen': '🌧️', 'Schnee': '🌨️',
          'Gewitter': '⛈️', 'Leichter Regen': '🌦️'
        }
        const emoji = emojis[weather.description] || '🌡️'

        await sendMessage(chatId, `${emoji} *Wetter in ${intent.query}:*

🌡️ *${weather.temp}°C* - ${weather.description}
💧 Luftfeuchtigkeit: ${weather.humidity}%
💨 Wind: ${weather.wind} km/h

_Daten von Open-Meteo_`)
      } else {
        await sendMessage(chatId, `Konnte das Wetter für "${intent.query}" nicht abrufen.`)
      }
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // NEWS
    // ============================================
    if (intent.type === 'news') {
      const news = await getNews(intent.query)
      if (news.length > 0) {
        let response = `📰 *News zu "${intent.query}":*\n\n`
        news.forEach((n, i) => {
          response += `${i + 1}. [${n.title}](${n.url})\n_${n.source}_\n\n`
        })
        await sendMessage(chatId, response, { disable_web_page_preview: true })
      } else {
        await sendMessage(chatId, `Keine News gefunden zu "${intent.query}".`)
      }
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // MAPS
    // ============================================
    if (intent.type === 'maps') {
      const mapUrl = getMapLink(intent.query)
      await sendMessage(chatId, `🗺️ *Karte für "${intent.query}":*

[📍 Auf Google Maps öffnen](${mapUrl})`)
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // WEB SEARCH
    // ============================================
    if (intent.type === 'web') {
      const results = await searchWeb(intent.query)
      if (results.length > 0) {
        let response = `🔍 *Suchergebnisse für "${intent.query}":*\n\n`
        results.forEach((r, i) => {
          response += `${i + 1}. [${r.title}](${r.url})\n_${r.snippet.substring(0, 100)}..._\n\n`
        })
        await sendMessage(chatId, response, { disable_web_page_preview: true })
      } else {
        await sendMessage(chatId, `[🔍 Google Suche](https://www.google.com/search?q=${encodeURIComponent(intent.query)})`)
      }
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // TELEFONNUMMER - Die Killer-Feature!
    // ============================================
    if (intent.type === 'phone') {
      const phone = intent.query.replace(/\D/g, '')
      const formattedPhone = intent.query

      // Ländercode erkennen
      let countryCode = ''
      let countryName = ''
      let lookupLinks = ''

      if (phone.startsWith('43') || phone.startsWith('0043')) {
        countryCode = '43'
        countryName = 'Österreich'
        lookupLinks = `🔎 [Herold.at Suche](https://www.herold.at/telefonbuch/suche/?what=${phone})
🏢 [WKO Firmen-A-Z](https://firmen.wko.at/suche/?query=${phone})
📋 [Firmenbuch](https://www.firmenbuch.at)`
      } else if (phone.startsWith('49') || phone.startsWith('0049')) {
        countryCode = '49'
        countryName = 'Deutschland'
        lookupLinks = `🔎 [dasTelefonbuch](https://www.dastelefonbuch.de/R%C3%BCckw%C3%A4rtssuche/${phone})
🏢 [Handelsregister](https://www.handelsregister.de)
📋 [Unternehmensregister](https://www.unternehmensregister.de)`
      } else if (phone.startsWith('41') || phone.startsWith('0041')) {
        countryCode = '41'
        countryName = 'Schweiz'
        lookupLinks = `🔎 [local.ch](https://www.local.ch/de/q?what=${phone})
🏢 [Zefix Handelsregister](https://www.zefix.ch)`
      } else {
        lookupLinks = `🔎 [Google Suche](https://www.google.com/search?q=${phone})
📋 [Tellows Spam-Check](https://www.tellows.de/num/${phone})`
      }

      // WhatsApp Link
      const waLink = `https://wa.me/${phone}`
      const waBusinessLink = `https://wa.me/${phone}?text=${encodeURIComponent('Guten Tag! Ich habe Ihre Nummer gefunden und wollte mich kurz vorstellen...')}`

      await sendMessage(chatId, `📞 *Telefonnummer erkannt!*

Nummer: \`${formattedPhone}\`
${countryName ? `🌍 Land: ${countryName}` : ''}

📱 *Kontakt aufnehmen:*
• [WhatsApp Chat öffnen](${waLink})
• [WhatsApp mit Vorlage](${waBusinessLink})

🔍 *Nummer recherchieren:*
${lookupLinks}

💡 *Nächster Schritt:*
Schick mir den Kontext und ich erstelle die perfekte Nachricht!

_Beispiele:_
• _"Interesse an seinem BMW auf Willhaben"_
• _"Anfrage für Immobilien-Exposé"_
• _"B2B Kooperationsanfrage für sein Unternehmen"_`, { disable_web_page_preview: true })
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // WHATSAPP
    // ============================================
    if (intent.type === 'whatsapp') {
      await sendMessage(chatId, `📱 *WhatsApp Integration*

Schick mir eine Telefonnummer und ich:
1. Öffne direkt WhatsApp Chat
2. Erstelle personalisierte Nachricht
3. Suche die Nummer auf Plattformen (eBay, Willhaben, etc.)

_Beispiel: "+43 664 1234567 - interessiert an Auto auf Willhaben"_`)
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // SMS
    // ============================================
    if (intent.type === 'sms') {
      await sendMessage(chatId, `💬 *SMS Versand*

SMS-Feature kommt bald!

Für jetzt: Schick mir eine Telefonnummer und ich erstelle dir eine perfekte SMS-Vorlage die du kopieren kannst.

_Twilio Integration in Entwicklung..._`)
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // PAYMENT
    // ============================================
    if (intent.type === 'buy') {
      await sendPaymentMenu(chatId, userId)
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // AI ASSET GENERIEREN
    // ============================================

    // Credits prüfen
    const hasCredits = await useCredit(userId)
    if (!hasCredits) {
      await sendMessage(chatId, `⚠️ *Credits aufgebraucht!*

Deine kostenlosen Assets sind weg.

💳 /buy - Credits kaufen

💎 10 Credits für nur 1,99€!`)
      return NextResponse.json({ ok: true })
    }

    await sendMessage(chatId, '⚡ *Erstelle dein Asset...*')

    const asset = await generateAsset(userText)
    const emoji = ASSET_EMOJIS[asset.type] || ASSET_EMOJIS.default

    // Asset in DB speichern
    await saveAsset(userId, asset.type, asset.title || 'Untitled', asset.content)

    // Je nach Typ ausliefern
    if (asset.type === 'presentation') {
      try {
        await sendChatAction(chatId, 'upload_document')
        const slides = JSON.parse(asset.content)
        const pptxBuffer = await createPresentation(slides, asset.title || 'Präsentation')
        const fileName = `${asset.title?.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_') || 'Praesentation'}.pptx`

        // DIREKT als Datei senden - nicht über Supabase Storage!
        await sendDocumentBuffer(chatId, pptxBuffer, fileName, `${emoji} *${asset.title}*\n\n_Fertig zum Präsentieren!_`)
      } catch (e) {
        // Fallback: Wenn PowerPoint-Erstellung fehlschlägt, zeige lesbaren Text
        console.error('PPTX creation error:', e)
        let fallbackContent = asset.content
        // Sicherstellen dass kein [object Object] angezeigt wird
        if (typeof fallbackContent === 'object') {
          fallbackContent = JSON.stringify(fallbackContent, null, 2)
        }
        // Wenn es JSON ist, formatiere es lesbar als Slides
        try {
          const parsed = JSON.parse(fallbackContent)
          if (Array.isArray(parsed)) {
            fallbackContent = parsed.map((slide: any, i: number) =>
              `*Folie ${i + 1}: ${slide.title || 'Untitled'}*\n${(slide.bullets || []).map((b: string) => `• ${b}`).join('\n')}`
            ).join('\n\n')
          }
        } catch {
          // Keep fallbackContent as is
        }
        await sendMessage(chatId, `${emoji} *${asset.title || 'Präsentation'}*\n\n${fallbackContent}`)
      }
    } else if (asset.type === 'code') {
      const lang = asset.metadata?.codeLanguage || ''
      await sendMessage(chatId, `${emoji} *${asset.title || 'Code'}*\n\n\`\`\`${lang}\n${asset.content}\n\`\`\``)
    } else {
      // Standard: Text mit Emoji
      const prefix = asset.title ? `${emoji} *${asset.title}*\n\n` : `${emoji} `
      const fullMessage = prefix + asset.content

      if (fullMessage.length > 4000) {
        const chunks = asset.content.match(/.{1,3900}/g) || [asset.content]
        await sendMessage(chatId, prefix + chunks[0])
        for (let i = 1; i < chunks.length; i++) {
          await sendMessage(chatId, chunks[i])
        }
      } else {
        await sendMessage(chatId, fullMessage)
      }
    }

    // Credits Info
    const remainingCredits = user.credits - 1
    if (remainingCredits <= 3 && remainingCredits > 0) {
      await sendMessage(chatId, `💡 _Noch ${remainingCredits} Credits übrig_\n/buy - Mehr kaufen`)
    }

    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
