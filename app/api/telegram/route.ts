import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, useCredit, uploadFile, saveAsset, supabase, addToHistory, getContextForAI } from '@/lib/supabase'
import { generateAsset, AssetType } from '@/lib/ai-engine'
import { createPresentation } from '@/lib/pptx'
import { createPDF } from '@/lib/pdf'
import { createICS, parseCalendarFromAI, createCalendarLinks } from '@/lib/ics'
import { searchYouTube, searchWeb, getWeather, getNews, getMapLink } from '@/lib/web-search'
import { sendInvoice, answerPreCheckoutQuery, sendPaymentMenu, processSuccessfulPayment, CREDIT_PACKAGES } from '@/lib/payment'
import { parseChainActions, executeChain, mightBeChain, ChainResult } from '@/lib/chain-actions'
import { actionHandlers } from '@/lib/action-handlers'
import { isIntegrationRequest, parseIntegrationRequest, executeIntegration, getAvailableIntegrations } from '@/lib/app-integrations'

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

async function sendChatAction(chatId: number, action: 'typing' | 'upload_document' | 'record_voice' | 'upload_video') {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action })
  })
}

// Video per URL senden (fuer Cloud-Videos)
async function sendVideo(chatId: number, videoUrl: string, caption?: string) {
  const response = await fetch(`${TELEGRAM_API}/sendVideo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoUrl,
      caption,
      parse_mode: 'Markdown',
      supports_streaming: true
    })
  })
  return response.json()
}

// Nachricht mit Inline Buttons senden (callback_data ODER url)
async function sendMessageWithButtons(
  chatId: number,
  text: string,
  buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>>
) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: buttons
      }
    })
  })
  return response.json()
}

// Answer Callback Query (für Button-Klicks)
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || ''
    })
  })
}

// Pending Discord Channel speichern (für mehrstufigen Flow)
const pendingDiscordChannels = new Map<number, string>()

// Pending AI Announcements (für Post-Buttons)
const pendingAnnouncements = new Map<number, string>()

// Pending Founding Member Input
const pendingFoundingInput = new Map<number, 'add' | 'set'>()

// Pending Outreach Input
const pendingOutreachInput = new Map<number, { type: 'intro' | 'add_server' | 'update_status', data?: any }>()

async function savePendingDiscordChannel(userId: number, channel: string) {
  pendingDiscordChannels.set(userId, channel)
  // Auto-expire nach 5 Minuten
  setTimeout(() => pendingDiscordChannels.delete(userId), 5 * 60 * 1000)
}

function getPendingDiscordChannel(userId: number): string | undefined {
  return pendingDiscordChannels.get(userId)
}

function clearPendingDiscordChannel(userId: number) {
  pendingDiscordChannels.delete(userId)
}

// Text-to-Speech - Hochwertige deutsche Stimme
// Nutzt OpenAI TTS (beste Qualität) mit Fallback auf Google
async function sendVoiceResponse(chatId: number, text: string) {
  try {
    // Kürze den Text auf max 1000 Zeichen für Voice
    const shortText = text.substring(0, 1000)

    await sendChatAction(chatId, 'record_voice')

    // Versuche OpenAI TTS (beste Qualität)
    if (process.env.OPENAI_API_KEY) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: 'nova', // Weibliche Stimme, klingt natürlich
            input: shortText,
            response_format: 'opus'
          })
        })

        if (openaiRes.ok) {
          const audioBuffer = await openaiRes.arrayBuffer()
          const formData = new FormData()
          formData.append('chat_id', chatId.toString())
          formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg')

          const response = await fetch(`${TELEGRAM_API}/sendVoice`, {
            method: 'POST',
            body: formData
          })
          const result = await response.json()
          if (result.ok) return true
        }
      } catch (e) {
        console.log('OpenAI TTS failed, using fallback')
      }
    }

    // Fallback: Google TTS (kostenlos)
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(shortText.substring(0, 200))}&tl=de&client=tw-ob`

    const response = await fetch(`${TELEGRAM_API}/sendVoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        voice: ttsUrl,
        caption: text.length > 200 ? '_Text gekürzt_' : undefined
      })
    })

    const result = await response.json()
    return result.ok
  } catch (error) {
    console.error('TTS error:', error)
    return false
  }
}

// Voice/Video in Text umwandeln (Groq Whisper)
async function transcribeAudio(fileId: string, fileType: 'voice' | 'video' = 'voice'): Promise<string> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)
  const fileData = await fileRes.json()
  const filePath = fileData.result.file_path
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`

  const audioRes = await fetch(fileUrl)
  const audioBuffer = await audioRes.arrayBuffer()

  // Dateiname basierend auf Typ
  const fileName = fileType === 'video' ? 'video.mp4' : 'audio.ogg'

  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer]), fileName)
  formData.append('model', 'whisper-large-v3')

  const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: formData
  })

  const result = await whisperRes.json()
  return result.text || ''
}

// Alias für Rückwärtskompatibilität
async function transcribeVoice(fileId: string): Promise<string> {
  return transcribeAudio(fileId, 'voice')
}

// ============================================
// INTENT DETECTION - Was will der User?
// ============================================
function detectIntent(text: string): { type: 'youtube' | 'web' | 'weather' | 'news' | 'maps' | 'buy' | 'phone' | 'whatsapp' | 'sms' | 'pdf' | 'ics' | 'email' | 'asset' | 'voiceover' | 'avatar', query: string } {
  const lower = text.toLowerCase().trim()

  // KAUFEN - MUSS VOR ALLEM ANDEREN KOMMEN (weil "buy" sonst als "such" erkannt wird)
  if (lower === 'buy' || lower === '/buy' || lower.includes('credits kaufen') ||
      lower.includes('kaufen') || lower.includes('credits') || lower.includes('bezahlen') ||
      lower.includes('payment') || lower.includes('premium') || lower.includes('upgrade') ||
      lower.includes('guthaben') || lower.includes('aufladen')) {
    return { type: 'buy', query: '' }
  }

  // E-MAIL SENDEN - Direkt versenden wenn E-Mail-Adresse erkannt wird
  // SEHR WICHTIG: Wenn eine E-Mail-Adresse im Text ist, ist es fast IMMER ein E-Mail Intent!
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/
  const emailMatch = text.match(emailRegex)
  if (emailMatch) {
    // E-Mail-Adresse gefunden - das ist AUTOMATISCH ein E-Mail Intent
    // Außer es ist explizit was anderes (z.B. "Kontakt speichern mit email@test.de")
    const notEmailIntent = lower.includes('speicher') && lower.includes('kontakt') ||
                           lower.includes('save') && lower.includes('contact')

    if (!notEmailIntent) {
      // E-Mail Adresse = E-Mail senden!
      return { type: 'email', query: text }
    }
  }

  // PDF Export
  if (lower.includes('als pdf') || lower.includes('pdf export') || lower.includes('pdf erstellen') ||
      lower.includes('als dokument') || lower.includes('exportiere als pdf')) {
    const query = text.replace(/als pdf|pdf export|pdf erstellen|als dokument|exportiere als pdf/gi, '').trim()
    return { type: 'pdf', query: query || 'Dokument' }
  }

  // ICS/Kalender Export - Erweiterte Erkennung
  if (lower.includes('kalender') || lower.includes('ics') || lower.includes('termin') ||
      lower.includes('trag ein') || lower.includes('trag es ein') || lower.includes('eintragen') ||
      lower.includes('meeting') || lower.includes('besprechung') ||
      lower.includes('in meinen kalender') || lower.includes('calendar')) {
    const query = text.replace(/kalender|ics|termin|trag ein|trag es ein|eintragen|in meinen kalender|calendar/gi, '').trim()
    return { type: 'ics', query: query || 'Event' }
  }

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

  // WERBUNG AUTOMATION - Kompletter Workflow mit Video, YouTube, Twitter
  // Viele Trigger-Phrasen für bessere Erkennung (Bot Training)
  const werbungTriggers = [
    // Direkte Werbung-Befehle
    'werbung', 'werbespot', 'werbevideo', 'werbe clip', 'promo', 'promotion',
    // Marketing-bezogen
    'marketing video', 'marketing clip', 'marketing erstellen',
    // EVIDENRA-spezifisch
    'evidenra video', 'evidenra werbung', 'evidenra promo', 'evidenra clip',
    // Genesis Engine
    'genesis video', 'genesis engine', 'neues video erstellen',
    // Aktionen
    'posten', 'teilen', 'veröffentlichen', 'publishen', 'publizieren',
    // Social Media Workflow
    'youtube hochladen', 'auf youtube', 'twitter posten', 'social media',
    // Kombinationen
    'video über', 'clip über', 'spot über'
  ]

  const hasWerbungTrigger = werbungTriggers.some(t => lower.includes(t))
  const hasVideoContext = lower.includes('video') || lower.includes('clip') || lower.includes('spot')
  const hasTopicIndicator = lower.includes('über') || lower.includes('zu') || lower.includes('thema')

  if (hasWerbungTrigger || (hasVideoContext && hasTopicIndicator && lower.includes('evidenra'))) {
    // Thema extrahieren
    let topic = text
    const extractTriggers = [
      'werbung mit video über', 'werbung über', 'werbung posten über', 'marketing video über',
      'werbe video über', 'werbung mit video', 'marketing video', 'werbung posten', 'werbung erstellen',
      'video über', 'clip über', 'spot über', 'promo über', 'promo zu', 'video zu',
      'evidenra video über', 'evidenra werbung', 'genesis video', 'neues video'
    ]
    for (const trigger of extractTriggers) {
      const idx = lower.indexOf(trigger)
      if (idx !== -1) {
        topic = text.substring(idx + trigger.length).trim()
        topic = topic.replace(/^[.:,!\s]+/, '').trim()
        break
      }
    }
    return { type: 'werbung' as any, query: topic || 'EVIDENRA qualitative Forschung' }
  }

  // AVATAR VIDEO (HeyGen) - MUSS VOR YouTube kommen weil "video" sonst YouTube triggert!
  if (lower.includes('avatar') || lower.includes('heygen') ||
      (lower.includes('video') && (lower.includes('mach ein') || lower.includes('erstell') || lower.includes('generier'))) ||
      lower.includes('sprechendes video') || lower.includes('avatar video')) {
    // Extrahiere das Script (alles nach dem Trigger-Wort)
    let script = text
    const triggers = ['avatar video', 'avatar', 'heygen', 'mach ein video', 'erstell ein video', 'generier ein video', 'sprechendes video']
    for (const trigger of triggers) {
      const idx = lower.indexOf(trigger)
      if (idx !== -1) {
        script = text.substring(idx + trigger.length).trim()
        // Entferne führende Satzzeichen
        script = script.replace(/^[.:,!\s]+/, '').trim()
        break
      }
    }
    return { type: 'avatar', query: script || text }
  }

  // VOICEOVER (ElevenLabs TTS)
  if (lower.includes('voiceover') || lower.includes('tts') || lower.includes('sprich') ||
      lower.includes('vorlesen') || lower.includes('stimme') || lower.includes('audio erstellen') ||
      lower.includes('sag') && (lower.includes('text') || lower.includes('mir'))) {
    let script = text
    const triggers = ['voiceover', 'tts', 'sprich', 'vorlesen', 'lies vor', 'audio erstellen', 'sag mir', 'sag den text']
    for (const trigger of triggers) {
      const idx = lower.indexOf(trigger)
      if (idx !== -1) {
        script = text.substring(idx + trigger.length).trim()
        script = script.replace(/^[.:,!\s]+/, '').trim()
        break
      }
    }
    return { type: 'voiceover', query: script || text }
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

Ich bin *MOI* - dein AI-Assistent der HANDELT!

🚀 *EVIDENRA Marketing:*
/werbung - Video → YouTube → Twitter → Share
/video - Neues Video erstellen
/youtube - YouTube Upload
/twitter - Twitter Post
/share - Share-Links
Oder einfach: "werbung posten"

🎮 *Discord Multi-Channel:*
\`#announcements Nachricht\`
→ Postet als "Andi | EVIDENRA Support"

🔗 *Chain Actions:*
"Erstell Angebot und schick per Mail"

📱 *App Integrationen:*
Notion, Trello, Todoist, Slack, GitHub...

📊 *200+ AI Assets:*
Praesentationen, E-Mails, Websites...

🌐 *Live-Daten:*
YouTube, Wetter, News, Maps

📄 *Exports:*
PDF, PowerPoint, Kalender (.ics)

📧 *E-Mail direkt:*
"max@firma.de Treffen morgen um 10"

🎤 *Voice & Video:*
/voiceover - ElevenLabs Stimme
/avatar - HeyGen Avatar Video
/voices - Alle Stimmen
Sprachnachricht = Voice Command!

💳 /buy - Credits
📜 /history - Gespraeche
🎮 /discord - Discord Channels
📊 /mstatus - Marketing Status

🧠 _Ich erinnere mich!_

*Sag mir was du brauchst!* 🚀`

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

      // Telegram Stars Payment Buttons
      if (data.startsWith('stars_')) {
        const packageId = data.replace('stars_', '')
        const { sendStarsInvoice } = await import('@/lib/payment')
        await sendStarsInvoice(chatId, packageId)
      }

      // Legacy Payment Buttons
      if (data.startsWith('buy_')) {
        const packageId = data.replace('buy_', '')
        await sendInvoice(chatId, packageId)
      }

      // Discord Channel Buttons
      if (data.startsWith('discord_')) {
        const channelMap: Record<string, string> = {
          'discord_announcements': 'announcements',
          'discord_support': 'help-and-support',
          'discord_founding': 'founding-lounge',
          'discord_success': 'success-stories',
          'discord_tutorials': 'tutorials',
          'discord_welcome': 'welcome'
        }

        const channel = channelMap[data]
        if (channel) {
          const odataUserId = callbackQuery.from.id
          await savePendingDiscordChannel(odataUserId, channel)
          await sendMessage(chatId, `📝 *Nachricht für #${channel}*

Schreib jetzt deine Nachricht (mit Emojis!):

_Beispiel: 🎉 Neues Feature ist live!_`)
        }
      }

      // AI Announcement Buttons
      if (data.startsWith('ai_')) {
        const aiUserId = callbackQuery.from.id

        // Typ-Auswahl Buttons
        if (data === 'ai_feature') {
          await sendMessage(chatId, `🚀 *Neues Feature ankündigen*

Beschreib das Feature kurz:
_z.B. "Auto-Export für PDF und Word"_`)
          pendingAnnouncements.set(aiUserId, 'pending_feature')
        } else if (data === 'ai_maintenance') {
          await sendMessage(chatId, `🔧 *Wartung ankündigen*

Schreib Datum und Dauer:
_z.B. "morgen 10-12 Uhr Server-Update"_`)
          pendingAnnouncements.set(aiUserId, 'pending_maintenance')
        } else if (data === 'ai_milestone') {
          await sendMessage(chatId, `🏆 *Milestone ankündigen*

Welchen Milestone?
_z.B. "50 Founding Members erreicht"_`)
          pendingAnnouncements.set(aiUserId, 'pending_milestone')
        } else if (data === 'ai_general') {
          await sendMessage(chatId, `📢 *Allgemeine Ankündigung*

Was möchtest du ankündigen?`)
          pendingAnnouncements.set(aiUserId, 'pending_general')
        }

        // Post Buttons - Ankündigung an Discord senden
        if (data === 'ai_post_announcements' || data === 'ai_post_founding') {
          const announcement = pendingAnnouncements.get(aiUserId)
          if (announcement && !announcement.startsWith('pending_')) {
            const channel = data === 'ai_post_founding' ? 'founding-lounge' : 'announcements'
            const { sendToDiscordChannel } = await import('@/lib/app-integrations')
            const result = await sendToDiscordChannel(channel, announcement)

            if (result.success) {
              await sendMessage(chatId, `✅ *Gepostet in #${result.channel}!*`)
              pendingAnnouncements.delete(aiUserId)
            } else {
              await sendMessage(chatId, `❌ Fehler: ${result.error}`)
            }
          }
        }

        // Regenerate Button
        if (data.startsWith('ai_regenerate_')) {
          const topic = decodeURIComponent(data.replace('ai_regenerate_', ''))
          await sendChatAction(chatId, 'typing')
          const { generateAnnouncement } = await import('@/lib/discord-ai')
          const announcement = await generateAnnouncement(topic)
          pendingAnnouncements.set(aiUserId, announcement)

          await sendMessageWithButtons(chatId, `🧠 *Neue Version:*

${announcement}`, [
            [
              { text: '✅ So posten', callback_data: 'ai_post_announcements' },
              { text: '🔄 Nochmal', callback_data: `ai_regenerate_${encodeURIComponent(topic)}` }
            ]
          ])
        }
      }

      // Founding Member Buttons
      if (data.startsWith('founding_')) {
        const foundingUserId = callbackQuery.from.id

        if (data === 'founding_add') {
          const { incrementFoundingMember, formatFoundingMemberStats } = await import('@/lib/discord-ai')
          const stats = await incrementFoundingMember()
          await sendMessage(chatId, `✅ *+1 Founding Member!*

${formatFoundingMemberStats(stats)}`)
        } else if (data === 'founding_set') {
          pendingFoundingInput.set(foundingUserId, 'set')
          await sendMessage(chatId, `📝 *Founding Member Anzahl setzen*

Schreib die aktuelle Anzahl (0-100):`)
        } else if (data === 'founding_announce') {
          const { getFoundingMemberStats, generateAnnouncement } = await import('@/lib/discord-ai')
          const stats = await getFoundingMemberStats()

          await sendChatAction(chatId, 'typing')
          const announcement = await generateAnnouncement(
            `Founding Member Update: ${stats.current} von ${stats.total} Plätzen vergeben, nur noch ${stats.remaining} verfügbar!`,
            'urgent'
          )

          pendingAnnouncements.set(foundingUserId, announcement)

          await sendMessageWithButtons(chatId, `🧠 *Generierte Ankündigung:*

${announcement}`, [
            [
              { text: '📢 Posten', callback_data: 'ai_post_announcements' },
              { text: '🔄 Neu', callback_data: 'founding_announce' }
            ]
          ])
        }
      }

      // Outreach Buttons
      if (data.startsWith('outreach_')) {
        const outreachUserId = callbackQuery.from.id

        if (data === 'outreach_find') {
          await sendMessage(chatId, `🔍 *Server suchen*

Gib einen Suchbegriff ein:
_z.B. "qualitative Forschung" oder "Wien Studenten"_`)
          pendingOutreachInput.set(outreachUserId, { type: 'add_server' })
        } else if (data === 'outreach_list') {
          const { getOutreachEntries, formatOutreachList } = await import('@/lib/discord-outreach')
          const entries = await getOutreachEntries()
          await sendMessage(chatId, `📋 *Outreach Liste*

${formatOutreachList(entries)}`)
        } else if (data === 'outreach_stats') {
          const { getOutreachStats, formatOutreachStats } = await import('@/lib/discord-outreach')
          const stats = await getOutreachStats()
          await sendMessage(chatId, formatOutreachStats(stats))
        } else if (data === 'outreach_report') {
          await sendChatAction(chatId, 'typing')
          const { generateWeeklyReport } = await import('@/lib/discord-outreach')
          const report = await generateWeeklyReport()
          await sendMessage(chatId, report)
        } else if (data.startsWith('outreach_intro_')) {
          const template = data.replace('outreach_intro_', '') as 'student' | 'researcher' | 'phd'
          const pending = pendingOutreachInput.get(outreachUserId)
          if (pending?.data?.serverName) {
            await sendChatAction(chatId, 'typing')
            const { generateQuickIntro, getInviteLink } = await import('@/lib/discord-outreach')
            const intro = await generateQuickIntro(pending.data.serverName, template)
            const joinLink = await getInviteLink(pending.data.serverName)

            // Sende Intro als separaten Text zum einfachen Weiterleiten
            await sendMessage(chatId, intro)

            // Dann Buttons zum Öffnen von Discord
            const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = []
            if (joinLink) {
              buttons.push([{ text: '🚀 Discord öffnen & posten', url: joinLink }])
            }
            buttons.push([{ text: '✅ Gepostet!', callback_data: `outreach_posted_${encodeURIComponent(pending.data.serverName)}` }])

            await sendMessageWithButtons(chatId, `👆 *Intro bereit!*

1. Tippe lange auf die Nachricht oben
2. Wähle "Weiterleiten" oder "Kopieren"
3. Öffne Discord und paste!`, buttons)

            pendingOutreachInput.delete(outreachUserId)
          }
        } else if (data.startsWith('outreach_add_')) {
          const serverName = decodeURIComponent(data.replace('outreach_add_', ''))
          const { addOutreachEntry, getInviteLink, getServerSearchLinks } = await import('@/lib/discord-outreach')

          // Zeige "Suche Invite..." Nachricht
          await sendMessage(chatId, `🔍 *Suche Invite-Link für ${serverName}...*`)
          await sendChatAction(chatId, 'typing')

          // Versuche Invite-Link automatisch zu finden
          const inviteLink = await getInviteLink(serverName)

          await addOutreachEntry({
            server_name: serverName,
            status: 'discovered',
            server_invite: inviteLink || undefined
          })

          if (inviteLink) {
            // ERFOLG! Direkter Beitreten-Button
            await sendMessageWithButtons(chatId, `✅ *${serverName}* gefunden!

🔗 Invite-Link: ${inviteLink}

Klick auf "Beitreten" - Discord öffnet sich automatisch!`, [
              [
                { text: '🚀 BEITRETEN', url: inviteLink }
              ],
              [
                { text: '✅ Bin beigetreten!', callback_data: `outreach_joined_${encodeURIComponent(serverName)}` }
              ]
            ])
          } else {
            // Kein Link gefunden - zeige Suche
            const searchLinks = getServerSearchLinks(serverName)
            await sendMessageWithButtons(chatId, `✅ *${serverName}* zur Liste hinzugefügt!

⚠️ Kein direkter Invite gefunden.

Suche manuell auf Disboard:`, [
              [
                { text: '🔍 Auf Disboard suchen', url: searchLinks.disboard }
              ],
              [
                { text: '✅ Bin beigetreten!', callback_data: `outreach_joined_${encodeURIComponent(serverName)}` }
              ]
            ])
          }
        } else if (data.startsWith('outreach_intro_for_')) {
          const serverName = decodeURIComponent(data.replace('outreach_intro_for_', ''))
          pendingOutreachInput.set(callbackQuery.from.id, { type: 'intro', data: { serverName } })

          await sendMessageWithButtons(chatId, `📝 *Intro für:* ${serverName}

Wähle den Stil:`, [
            [
              { text: '👨‍🎓 Student', callback_data: 'outreach_intro_student' },
              { text: '🔬 Researcher', callback_data: 'outreach_intro_researcher' }
            ],
            [
              { text: '🎓 PhD/Doktorand', callback_data: 'outreach_intro_phd' }
            ]
          ])
        } else if (data.startsWith('outreach_join_')) {
          const serverName = decodeURIComponent(data.replace('outreach_join_', ''))
          const { formatInviteHelp } = await import('@/lib/discord-outreach')
          await sendMessage(chatId, formatInviteHelp(serverName), { disable_web_page_preview: true })
        } else if (data.startsWith('outreach_joined_')) {
          // User hat auf "Bin beigetreten!" geklickt
          const serverName = decodeURIComponent(data.replace('outreach_joined_', ''))
          const { markServerAsJoined } = await import('@/lib/discord-outreach')
          const entry = await markServerAsJoined(serverName)

          if (entry) {
            await sendMessageWithButtons(chatId, `🎉 *Super! ${serverName}* als beigetreten markiert!

*Nächster Schritt:* Stell dich im Server vor!

Ich generiere dir ein passendes Intro:`, [
              [
                { text: '👨‍🎓 Student-Intro', callback_data: 'outreach_intro_student' },
                { text: '🔬 Researcher-Intro', callback_data: 'outreach_intro_researcher' }
              ],
              [
                { text: '🎓 PhD-Intro', callback_data: 'outreach_intro_phd' }
              ]
            ])
            // Speichere Server-Name für Intro-Generierung
            pendingOutreachInput.set(callbackQuery.from.id, { type: 'intro', data: { serverName } })
          }
        }
      }

      // Answer callback to remove loading state
      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id })
      })

      return NextResponse.json({ ok: true })
    }

    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const userId = message.from.id
    const userName = message.from.first_name || 'User'

    // User anlegen/holen
    const user = await getOrCreateUser(userId, userName)

    // Text, Voice, Video oder Video Note?
    let userText = ''
    let respondWithVoice = false // Wenn User Voice schickt, antworten wir auch mit Voice

    if (message.voice) {
      await sendChatAction(chatId, 'typing')
      userText = await transcribeVoice(message.voice.file_id)
      if (!userText) {
        await sendMessage(chatId, '❌ Nicht verstanden. Nochmal versuchen!')
        return NextResponse.json({ ok: true })
      }

      // 🚗 AUTO-MODUS: Bei E-Mail keine Bestätigung, direkt ausführen!
      const hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(userText)
      if (!hasEmail) {
        // Nur bei Nicht-E-Mails das Transkript zeigen
        await sendMessage(chatId, `🎤 _"${userText}"_`)
      }
      respondWithVoice = true
    } else if (message.video || message.video_note) {
      // Video oder Kreis-Video empfangen - Audio transkribieren
      await sendChatAction(chatId, 'typing')
      const isCircle = !!message.video_note
      const videoData = message.video || message.video_note
      const fileId = videoData.file_id

      await sendMessage(chatId, `🎬 *${isCircle ? 'Kreis-Video' : 'Video'} empfangen!*

📊 Dauer: ${videoData.duration || '?'} Sekunden
${videoData.file_size ? `💾 ${Math.round(videoData.file_size / 1024)} KB` : ''}

🎤 *Extrahiere Audio...*`)

      try {
        // Audio aus Video transkribieren
        const transcript = await transcribeAudio(fileId, 'video')

        if (transcript && transcript.trim()) {
          await sendMessage(chatId, `📝 *Transkript:*\n\n_"${transcript}"_`)

          // Caption falls vorhanden
          const caption = message.caption || ''

          // In History speichern
          await addToHistory(userId, 'user', `[Video-Transkript]: ${transcript}`)

          // Jetzt kann der User mit dem Transkript arbeiten
          userText = caption || transcript

        } else {
          await sendMessage(chatId, `🎬 *Video empfangen*

_Kein Audio erkannt oder Video ohne Ton._

${message.caption ? `📝 Caption: "${message.caption}"` : 'Schreib mir was ich mit dem Video machen soll!'}`)

          if (message.caption) {
            userText = message.caption
          } else {
            await addToHistory(userId, 'user', `[Video ohne Audio gesendet]`)
            return NextResponse.json({ ok: true })
          }
        }
      } catch (error) {
        console.error('Video transcription error:', error)
        await sendMessage(chatId, `🎬 *Video empfangen*

⚠️ _Konnte Audio nicht extrahieren._

${message.caption ? `📝 Caption: "${message.caption}"` : 'Schreib mir was ich mit dem Video machen soll!'}`)

        if (message.caption) {
          userText = message.caption
        } else {
          return NextResponse.json({ ok: true })
        }
      }
    } else if (message.contact) {
      // Contact shared - Telefonnummer speichern und anrufen
      const phone = message.contact.phone_number
      const phoneFormatted = phone.startsWith('+') ? phone : `+${phone}`

      // Speichere Nummer
      try {
        await supabase.from('telegram_users').upsert({
          telegram_id: chatId,
          phone: phoneFormatted,
          updated_at: new Date().toISOString()
        }, { onConflict: 'telegram_id' })
      } catch {}

      await sendMessage(chatId, `📞 *Perfekt!* Ich rufe dich jetzt an...\n\n📱 ${phoneFormatted}`)

      // Anrufen!
      try {
        const twilio = (await import('twilio')).default
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!
        )

        await twilioClient.calls.create({
          to: phoneFormatted,
          from: process.env.TWILIO_PHONE_NUMBER!,
          url: 'https://mymoi-bot.vercel.app/api/voice'
        })

        await sendMessage(chatId, `✅ *Anruf gestartet!*\n\nNimm ab - MOI wartet auf dich! 🎤`, {
          reply_markup: { remove_keyboard: true }
        })
      } catch (e: any) {
        console.error('Twilio call error:', e)
        await sendMessage(chatId, `❌ Anruf fehlgeschlagen.\n\nRuf mich direkt an: *+1 (888) 664-2970*`, {
          reply_markup: { remove_keyboard: true }
        })
      }
      return NextResponse.json({ ok: true })

    } else if (message.text) {
      // PENDING FOUNDING MEMBER INPUT
      const foundingInput = pendingFoundingInput.get(userId)
      if (foundingInput === 'set' && !message.text.startsWith('/')) {
        const count = parseInt(message.text.trim())
        if (!isNaN(count) && count >= 0 && count <= 100) {
          const { setFoundingMemberCount, getFoundingMemberStats, formatFoundingMemberStats } = await import('@/lib/discord-ai')
          await setFoundingMemberCount(count)
          const stats = await getFoundingMemberStats()
          pendingFoundingInput.delete(userId)
          await sendMessage(chatId, `✅ *Founding Members auf ${count} gesetzt!*

${formatFoundingMemberStats(stats)}`)
        } else {
          await sendMessage(chatId, `❌ Ungültige Zahl. Bitte eine Zahl zwischen 0 und 100 eingeben.`)
        }
        return NextResponse.json({ ok: true })
      }

      // PENDING OUTREACH INPUT
      const outreachInput = pendingOutreachInput.get(userId)
      if (outreachInput && !message.text.startsWith('/')) {
        if (outreachInput.type === 'add_server') {
          // User hat Suchbegriff eingegeben
          await sendChatAction(chatId, 'typing')
          const { discoverServers, formatServerList } = await import('@/lib/discord-outreach')
          const servers = await discoverServers(message.text.trim())

          if (servers.length === 0) {
            await sendMessage(chatId, `❌ Keine Server gefunden für "${message.text}"

Versuche andere Begriffe wie:
• qualitative Forschung
• uni wien
• sozialwissenschaft
• phd life`)
          } else {
            // Server mit Buttons zum Hinzufügen
            let serverList = `🔍 *${servers.length} Server gefunden:*\n\n`
            serverList += formatServerList(servers)

            const buttons = servers.slice(0, 4).map(s => [{
              text: `➕ ${s.name.substring(0, 20)}`,
              callback_data: `outreach_add_${encodeURIComponent(s.name)}`
            }])

            await sendMessageWithButtons(chatId, serverList, buttons)
          }
          pendingOutreachInput.delete(userId)
          return NextResponse.json({ ok: true })
        } else if (outreachInput.type === 'intro') {
          // User hat Server-Namen für Intro eingegeben
          pendingOutreachInput.set(userId, { type: 'intro', data: { serverName: message.text.trim() } })

          await sendMessageWithButtons(chatId, `📝 *Intro generieren für:* ${message.text}

Wähle den Stil:`, [
            [
              { text: '👨‍🎓 Student', callback_data: 'outreach_intro_student' },
              { text: '🔬 Researcher', callback_data: 'outreach_intro_researcher' }
            ],
            [
              { text: '🎓 PhD/Doktorand', callback_data: 'outreach_intro_phd' }
            ]
          ])
          return NextResponse.json({ ok: true })
        }
      }

      // PENDING AI ANNOUNCEMENT INPUT
      const pendingAI = pendingAnnouncements.get(userId)
      if (pendingAI && pendingAI.startsWith('pending_') && !message.text.startsWith('/')) {
        const type = pendingAI.replace('pending_', '')
        await sendChatAction(chatId, 'typing')

        const { generateAnnouncement } = await import('@/lib/discord-ai')
        let style: 'professional' | 'celebration' | 'urgent' = 'professional'
        if (type === 'feature' || type === 'milestone') style = 'celebration'
        if (type === 'maintenance') style = 'urgent'

        const announcement = await generateAnnouncement(message.text, style)
        pendingAnnouncements.set(userId, announcement)

        await sendMessageWithButtons(chatId, `🧠 *AI-Ankündigung:*

${announcement}`, [
          [
            { text: '✅ So posten', callback_data: 'ai_post_announcements' },
            { text: '🔄 Neu generieren', callback_data: `ai_regenerate_${encodeURIComponent(message.text)}` }
          ],
          [
            { text: '📢 → Announcements', callback_data: 'ai_post_announcements' },
            { text: '🏆 → Founding', callback_data: 'ai_post_founding' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // PENDING DISCORD MESSAGE - Wenn User auf Button geklickt hat
      const pendingChannel = getPendingDiscordChannel(userId)
      if (pendingChannel && !message.text.startsWith('/')) {
        // User hat Nachricht geschrieben nach Button-Klick
        const { sendToDiscordChannel } = await import('@/lib/app-integrations')
        await sendChatAction(chatId, 'typing')
        const result = await sendToDiscordChannel(pendingChannel, message.text)
        clearPendingDiscordChannel(userId)

        if (result.success) {
          await sendMessage(chatId, `✅ *Discord #${result.channel}*

_Gesendet als "Andi | EVIDENRA Support"_

📝 ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`)
        } else {
          await sendMessage(chatId, `❌ *Fehler:* ${result.error}`)
        }
        return NextResponse.json({ ok: true })
      }

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

      // /email Command - fragt nach E-Mail-Adresse
      if (message.text === '/email') {
        await sendMessage(chatId, `📧 *E-Mail senden*

Schreib mir die E-Mail so:
_"test@beispiel.de Betreff: Hallo"_

Oder ausführlicher:
_"Schick an max@firma.de Betreff: Meeting - Wir treffen uns morgen um 10 Uhr"_`)
        return NextResponse.json({ ok: true })
      }

      // /termin Command
      if (message.text === '/termin') {
        await sendMessage(chatId, `📅 *Termin erstellen*

Schreib mir z.B.:
_"Termin morgen 14 Uhr Zahnarzt"_
_"Meeting am Freitag 10:00 mit Team"_

Ich erstelle einen Kalender-Eintrag mit Google/Outlook Links!`)
        return NextResponse.json({ ok: true })
      }

      // ============================================
      // EVIDENRA MARKETING COMMANDS
      // ============================================

      // /werbung - Full Marketing Automation
      // /werbung neu - Neues HeyGen Video erstellen
      const isWerbungCommand = message.text === '/werbung' || message.text.toLowerCase().includes('werbung posten')
      const isWerbungNeu = message.text?.toLowerCase().includes('/werbung neu') || message.text?.toLowerCase().includes('neues werbevideo')

      if (isWerbungCommand || isWerbungNeu) {
        await sendChatAction(chatId, 'typing')

        const createNew = isWerbungNeu
        const statusText = createNew
          ? `🎬 *NEUES Video wird erstellt...*\n\n_HeyGen AI Avatar generiert neues Video (ca. 2-5 Min)_`
          : `🚀 *EVIDENRA Werbung Pipeline startet...*\n\n1️⃣ Video suchen/erstellen\n2️⃣ YouTube Upload\n3️⃣ Twitter Post\n4️⃣ Share-Links generieren\n\n_Bitte warten..._`

        await sendMessage(chatId, statusText)

        try {
          const { runFullAutomation, generateShareLinks } = await import('@/lib/evidenra-marketing')
          const result = await runFullAutomation({ createNewVideo: createNew })

          if (result.success) {
            let successMessage = `✅ *EVIDENRA Werbung gepostet!*\n\n`

            if (result.youtube?.success) {
              successMessage += `📺 *YouTube:* ${result.youtube.url}\n`
            } else {
              successMessage += `📺 YouTube: ${result.youtube?.error || 'Uebersprungen'}\n`
            }

            if (result.twitter?.success) {
              successMessage += `🐦 *Twitter:* ${result.twitter.url}\n`
            } else {
              successMessage += `🐦 Twitter: ${result.twitter?.error || 'Uebersprungen'}\n`
            }

            if (result.shareLinks) {
              successMessage += `\n📤 *Jetzt teilen (1 Klick):*\n\n`
              successMessage += `LinkedIn: ${result.shareLinks.linkedin}\n\n`
              successMessage += `Facebook: ${result.shareLinks.facebook}\n\n`
              successMessage += `Reddit: ${result.shareLinks.reddit}\n\n`
              successMessage += `Instagram: ${result.shareLinks.instagram}\n\n`
              successMessage += `TikTok: ${result.shareLinks.tiktok}\n\n`
              successMessage += `_Eingeloggt = KEIN Captcha!_`
            }

            await sendMessage(chatId, successMessage, { disable_web_page_preview: true })

            // Video direkt in Telegram senden
            if (result.video?.path) {
              await sendChatAction(chatId, 'upload_video')
              try {
                await sendVideo(chatId, result.video.path, '🎬 EVIDENRA AI Video')
              } catch (videoErr: any) {
                console.log('[Telegram] Video senden fehlgeschlagen:', videoErr?.message || videoErr)
              }
            }
          } else {
            await sendMessage(chatId, `❌ *Fehler:* ${result.error}`)
          }
        } catch (e: any) {
          await sendMessage(chatId, `❌ *Fehler:* ${e?.message || String(e)}`)
        }
        return NextResponse.json({ ok: true })
      }

      // /video - Create new video with Genesis Engine
      if (message.text === '/video' || message.text === '/neues-video') {
        await sendChatAction(chatId, 'typing')
        await sendMessage(chatId, `🎬 *Video erstellen...*\n\n_Genesis Engine wird gestartet..._`)

        try {
          const { createVideo } = await import('@/lib/evidenra-marketing')
          const result = await createVideo()

          if (result.success && result.videoPath) {
            const fileName = result.videoPath.split('\\').pop() || 'video.mp4'
            await sendMessage(chatId, `✅ *Video erstellt!*\n\n📁 ${fileName}\n\n_Verwende /youtube zum Hochladen_`)
          } else {
            await sendMessage(chatId, `❌ Video-Erstellung fehlgeschlagen: ${result.error}`)
          }
        } catch (e: any) {
          await sendMessage(chatId, `❌ *Fehler:* ${e.message}`)
        }
        return NextResponse.json({ ok: true })
      }

      // /youtube - Upload to YouTube
      if (message.text === '/youtube' || message.text.toLowerCase().includes('youtube hochladen')) {
        await sendChatAction(chatId, 'typing')

        try {
          const { findLatestVideo, uploadToYouTube } = await import('@/lib/evidenra-marketing')
          const videoPath = findLatestVideo()

          if (!videoPath) {
            await sendMessage(chatId, `❌ Kein Video gefunden. Erstelle zuerst eines mit /video`)
            return NextResponse.json({ ok: true })
          }

          const fileName = videoPath.split('\\').pop() || 'video.mp4'
          await sendMessage(chatId, `📺 *YouTube Upload...*\n\n📁 ${fileName}\n\n_Lade hoch..._`)

          const result = await uploadToYouTube(videoPath)

          if (result.success) {
            await sendMessage(chatId, `✅ *YouTube Upload erfolgreich!*\n\n🔗 ${result.url}`)
          } else {
            await sendMessage(chatId, `❌ Upload fehlgeschlagen: ${result.error}`)
          }
        } catch (e: any) {
          await sendMessage(chatId, `❌ *Fehler:* ${e.message}`)
        }
        return NextResponse.json({ ok: true })
      }

      // /twitter - Post to Twitter
      if (message.text === '/twitter' || message.text.toLowerCase().includes('twitter posten')) {
        await sendChatAction(chatId, 'typing')

        try {
          const { findLatestVideo, uploadVideoToTwitter, postToTwitter } = await import('@/lib/evidenra-marketing')
          const videoPath = findLatestVideo()

          if (!videoPath) {
            await sendMessage(chatId, `❌ Kein Video gefunden.`)
            return NextResponse.json({ ok: true })
          }

          const fileName = videoPath.split('\\').pop() || 'video.mp4'
          await sendMessage(chatId, `🐦 *Twitter Post...*\n\n📁 ${fileName}\n\n_Lade hoch..._`)

          const mediaId = await uploadVideoToTwitter(videoPath)

          if (mediaId) {
            const tweetText = `EVIDENRA - Qualitative Forschung mit KI

Interviews 10x schneller analysieren!
60% Founding Members Rabatt!

#QualitativeForschung #EVIDENRA #KI`

            const result = await postToTwitter(tweetText, mediaId)

            if (result.success) {
              await sendMessage(chatId, `✅ *Tweet gepostet!*\n\n🔗 ${result.url}`)
            } else {
              await sendMessage(chatId, `❌ Tweet fehlgeschlagen: ${result.error}`)
            }
          } else {
            await sendMessage(chatId, `❌ Video-Upload fehlgeschlagen`)
          }
        } catch (e: any) {
          await sendMessage(chatId, `❌ *Fehler:* ${e.message}`)
        }
        return NextResponse.json({ ok: true })
      }

      // /share - Send share links
      if (message.text === '/share' || message.text === '/teilen') {
        const { generateShareLinks } = await import('@/lib/evidenra-marketing')
        const links = generateShareLinks()

        await sendMessage(chatId, `📤 *EVIDENRA Share-Links*

*LinkedIn:*
${links.linkedin}

*Facebook:*
${links.facebook}

*Reddit:*
${links.reddit}

*Instagram:*
${links.instagram}

_Eingeloggt = KEIN Captcha!_`, { disable_web_page_preview: true })
        return NextResponse.json({ ok: true })
      }

      // /marketing-status - Check marketing setup status
      if (message.text === '/marketing-status' || message.text === '/mstatus') {
        const { getMarketingStatus } = await import('@/lib/evidenra-marketing')
        const status = getMarketingStatus()

        await sendMessage(chatId, `📊 *EVIDENRA Marketing Status*

📺 YouTube API: ${status.youtube ? '✅ Konfiguriert' : '❌ Nicht konfiguriert'}
🐦 Twitter API: ${status.twitter ? '✅ Aktiv' : '❌ Nicht aktiv'}
🎬 Genesis Engine: ${status.genesisEngine ? '✅ Vorhanden' : '❌ Nicht gefunden'}
📁 Letztes Video: ${status.latestVideo ? status.latestVideo.split('\\').pop() : 'Keins'}

*Befehle:*
/werbung - Komplette Automation
/video - Neues Video erstellen
/youtube - YouTube Upload
/twitter - Twitter Post
/share - Share-Links
/voiceover - ElevenLabs Voiceover
/avatar - HeyGen Avatar Video`)
        return NextResponse.json({ ok: true })
      }

      // ============================================
      // AI VIDEO & VOICE COMMANDS
      // ============================================

      // /voiceover - ElevenLabs Text-to-Speech
      if (message.text === '/voiceover' || message.text === '/tts' || message.text === '/stimme') {
        await sendMessageWithButtons(chatId, `🎤 *ElevenLabs Voiceover*

Erstelle professionelle deutsche Voiceovers!

*Verwendung:*
\`/voiceover Dein Text hier\`

*Oder waehle einen Preset:*`, [
          [
            { text: '📢 EVIDENRA Werbung', callback_data: 'voice_evidenra' },
            { text: '👋 Begruesssung', callback_data: 'voice_greeting' }
          ],
          [
            { text: '📊 Produkt-Demo', callback_data: 'voice_demo' },
            { text: '🎯 Call-to-Action', callback_data: 'voice_cta' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // /voiceover mit Text
      if (message.text.startsWith('/voiceover ') || message.text.startsWith('/tts ')) {
        const text = message.text.replace(/^\/(voiceover|tts)\s+/, '').trim()

        if (!text) {
          await sendMessage(chatId, `Bitte gib einen Text an:\n\`/voiceover Dein Text hier\``)
          return NextResponse.json({ ok: true })
        }

        await sendChatAction(chatId, 'record_voice')
        await sendMessage(chatId, `🎤 *Generiere Voiceover...*\n\n_"${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"_`)

        try {
          const { textToSpeech } = await import('@/lib/elevenlabs')
          const result = await textToSpeech(text, {
            voice: 'sarah',
            model: 'multilingual_v2',
            language: 'de'
          })

          if (result.success && result.audio) {
            // Audio als Voice Message senden
            // Buffer zu ArrayBuffer kopieren für Blob-Kompatibilität (TypeScript strict mode)
            const audioBuffer = result.audio.buffer.slice(result.audio.byteOffset, result.audio.byteOffset + result.audio.byteLength) as ArrayBuffer
            const formData = new FormData()
            formData.append('chat_id', chatId.toString())
            formData.append('voice', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voiceover.mp3')
            formData.append('caption', '🎤 ElevenLabs Voiceover')

            await fetch(`${TELEGRAM_API}/sendVoice`, {
              method: 'POST',
              body: formData
            })
          } else {
            await sendMessage(chatId, `❌ Voiceover fehlgeschlagen: ${result.error}\n\n_Hast du ELEVENLABS_API_KEY in den Environment Variables?_`)
          }
        } catch (e: any) {
          await sendMessage(chatId, `❌ Fehler: ${e.message}`)
        }
        return NextResponse.json({ ok: true })
      }

      // /avatar - HeyGen Avatar Video
      if (message.text === '/avatar' || message.text === '/heygen') {
        await sendMessageWithButtons(chatId, `🎬 *HeyGen Avatar Video*

Erstelle Videos mit sprechenden AI-Avataren!

*Verwendung:*
\`/avatar Dein Script hier\`

*Oder waehle einen Preset:*`, [
          [
            { text: '👩 Anna (Professionell)', callback_data: 'avatar_anna' },
            { text: '👨 Josh (Business)', callback_data: 'avatar_josh' }
          ],
          [
            { text: '📢 EVIDENRA Werbung', callback_data: 'avatar_evidenra' },
            { text: '📊 Status pruefen', callback_data: 'avatar_status' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // /avatar mit Script - OHNE WARTEN um Telegram-Retries zu vermeiden
      if (message.text.startsWith('/avatar ') || message.text.startsWith('/heygen ')) {
        const script = message.text.replace(/^\/(avatar|heygen)\s+/, '').trim()

        if (!script) {
          await sendMessage(chatId, `Bitte gib ein Script an:\n\`/avatar Dein Script hier\``)
          return NextResponse.json({ ok: true })
        }

        await sendChatAction(chatId, 'typing')

        try {
          const { createAvatarVideo } = await import('@/lib/heygen')
          const createResult = await createAvatarVideo({
            script,
            avatar: 'anna',
            voice: 'german_female',
            aspectRatio: '16:9'
          })

          if (!createResult.success || !createResult.video_id) {
            await sendMessage(chatId, `❌ Video-Erstellung fehlgeschlagen: ${createResult.error}`)
            return NextResponse.json({ ok: true })
          }

          // SOFORT antworten mit Video ID
          await sendMessage(chatId, `🎬 *Avatar Video gestartet!*

📝 _"${script.substring(0, 80)}${script.length > 80 ? '...' : ''}"_
🆔 Video ID: \`${createResult.video_id}\`

⏳ Fertig in 2-5 Minuten.
👉 Status: /videostatus ${createResult.video_id}`)

        } catch (e: any) {
          await sendMessage(chatId, `❌ Fehler: ${e.message}`)
        }
        return NextResponse.json({ ok: true })
      }

      // /videostatus - HeyGen Video Status prüfen
      if (message.text === '/videostatus' || message.text.startsWith('/videostatus ')) {
        const videoId = message.text.replace('/videostatus', '').trim()

        if (!videoId) {
          await sendMessage(chatId, `Bitte gib eine Video ID an:\n\`/videostatus abc123\``)
          return NextResponse.json({ ok: true })
        }

        try {
          const { getVideoStatus } = await import('@/lib/heygen')
          const status = await getVideoStatus(videoId)

          if (status.status === 'completed' && status.video_url) {
            // Share Links generieren
            const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(status.video_url)}`
            const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent('EVIDENRA - KI für qualitative Forschung')}&url=${encodeURIComponent(status.video_url)}`
            const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(status.video_url)}`

            await sendMessage(chatId, `✅ *VIDEO FERTIG!*

🎬 [Video ansehen](${status.video_url})
⏱️ Dauer: ${status.duration ? Math.round(status.duration) + 's' : 'N/A'}

📤 *Jetzt teilen:*
• [LinkedIn](${linkedinUrl})
• [Twitter](${twitterUrl})
• [Facebook](${facebookUrl})

📋 *Compositing mit Genesis Video:*
\`\`\`
cd "D:\\EVIDENRA-Videos"
node composite-video.js "${status.video_url}" "D:\\Genesis Engine\\video-generator\\output\\EVIDENRA-Professional-v7.6-Demo.mp4"
\`\`\`

🔗 [evidenra.com/pricing](https://evidenra.com/pricing)`)
          } else if (status.status === 'failed') {
            await sendMessage(chatId, `❌ Video fehlgeschlagen: ${status.error || 'Unbekannter Fehler'}`)
          } else if (status.status === 'processing' || status.status === 'pending') {
            await sendMessage(chatId, `⏳ *Video wird noch generiert...*\n\nStatus: ${status.status}\n\n_Versuche es in 1-2 Minuten nochmal._\n\n👉 /videostatus ${videoId}`)
          } else {
            await sendMessage(chatId, `❓ Status: ${status.status}`)
          }
        } catch (e: any) {
          await sendMessage(chatId, `❌ Fehler: ${e.message}`)
        }
        return NextResponse.json({ ok: true })
      }

      // /voices - Verfuegbare Stimmen anzeigen
      if (message.text === '/voices' || message.text === '/stimmen') {
        const voices = `🎤 *Verfuegbare Stimmen*

*ElevenLabs (Voiceover):*
• Sarah - Warm und professionell
• Bella - Jung und energisch
• Adam - Tief und vertrauenswuerdig
• Josh - Jung und dynamisch

*HeyGen (Avatar Videos):*
• de-DE-KatjaNeural - Deutsche Frau
• de-DE-ConradNeural - Deutscher Mann

*Verwendung:*
\`/voiceover [text]\` - Audio generieren
\`/avatar [script]\` - Video mit Avatar`

        await sendMessage(chatId, voices)
        return NextResponse.json({ ok: true })
      }

      // /anruf Command - Twilio ruft User an!
      if (message.text === '/anruf' || message.text === '/call' || message.text.toLowerCase().includes('ruf mich an')) {
        // Admin-Nummer direkt anrufen (Bernhard)
        const ADMIN_PHONE = '+436769271800'

        await sendMessage(chatId, `📞 *MOI ruft dich an...*\n\nDein Telefon klingelt gleich!`)

        try {
          const twilio = (await import('twilio')).default
          const twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID!,
            process.env.TWILIO_AUTH_TOKEN!
          )

          await twilioClient.calls.create({
            to: ADMIN_PHONE,
            from: process.env.TWILIO_PHONE_NUMBER!,
            url: 'https://mymoi-bot.vercel.app/api/voice'
          })

          await sendMessage(chatId, `✅ *Anruf gestartet!*\n\nNimm ab - MOI wartet! 🎤`)
        } catch (e: any) {
          console.error('Twilio call error:', e)
          await sendMessage(chatId, `❌ Anruf fehlgeschlagen.\n\nRuf mich an: *+1 (888) 664-2970*`)
        }
        return NextResponse.json({ ok: true })
      }

      // /pdf Command
      if (message.text === '/pdf') {
        await sendMessage(chatId, `📄 *PDF erstellen*

Schreib mir was du brauchst:
_"Angebot für Webdesign als PDF"_
_"Rechnung über 500€ als PDF"_
_"Businessplan für Café als PDF"_`)
        return NextResponse.json({ ok: true })
      }

      // /wetter Command
      if (message.text === '/wetter') {
        await sendMessage(chatId, `🌤️ *Wetter abfragen*

Schreib mir eine Stadt:
_"Wetter Wien"_
_"Wetter in Berlin"_`)
        return NextResponse.json({ ok: true })
      }

      // ============================================
      // DISCORD AI FEATURES
      // ============================================

      // /ai oder /ai-announce - AI-generierte Ankündigung
      if (message.text === '/ai' || message.text === '/ai-announce') {
        await sendMessageWithButtons(chatId, `🧠 *AI-Announcement Generator*

Wähle einen Typ oder schreib:
\`/ai Neues Feature: Auto-Export\`

Claude generiert eine professionelle Ankündigung!`, [
          [
            { text: '🚀 Neues Feature', callback_data: 'ai_feature' },
            { text: '🔧 Wartung', callback_data: 'ai_maintenance' }
          ],
          [
            { text: '🏆 Milestone', callback_data: 'ai_milestone' },
            { text: '📢 Allgemein', callback_data: 'ai_general' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // /ai mit Text - Direkt generieren
      if (message.text.startsWith('/ai ')) {
        const topic = message.text.replace('/ai ', '').trim()
        if (topic) {
          await sendChatAction(chatId, 'typing')
          const { generateAnnouncement } = await import('@/lib/discord-ai')
          const announcement = await generateAnnouncement(topic)

          // Speichere generierte Ankündigung für Buttons
          pendingAnnouncements.set(userId, announcement)

          await sendMessageWithButtons(chatId, `🧠 *AI-Ankündigung:*

${announcement}`, [
            [
              { text: '✅ So posten', callback_data: 'ai_post_announcements' },
              { text: '🔄 Neu generieren', callback_data: `ai_regenerate_${encodeURIComponent(topic)}` }
            ],
            [
              { text: '📢 → Announcements', callback_data: 'ai_post_announcements' },
              { text: '🏆 → Founding', callback_data: 'ai_post_founding' }
            ]
          ])
          return NextResponse.json({ ok: true })
        }
      }

      // /founding - Founding Member Status
      if (message.text === '/founding') {
        const { getFoundingMemberStats, formatFoundingMemberStats } = await import('@/lib/discord-ai')
        const stats = await getFoundingMemberStats()
        const formatted = formatFoundingMemberStats(stats)

        await sendMessageWithButtons(chatId, formatted, [
          [
            { text: '➕ Member hinzufügen', callback_data: 'founding_add' },
            { text: '📝 Zahl setzen', callback_data: 'founding_set' }
          ],
          [
            { text: '📢 Announcement posten', callback_data: 'founding_announce' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // /stats - Discord Statistiken
      if (message.text === '/stats') {
        await sendChatAction(chatId, 'typing')
        const { getDiscordStats, formatDiscordStats, getFoundingMemberStats } = await import('@/lib/discord-ai')

        const discordStats = await getDiscordStats()
        const foundingStats = await getFoundingMemberStats()

        let statsMessage = `📊 *EVIDENRA Discord Stats*
━━━━━━━━━━━━━━━━━━━━━`

        if (discordStats && discordStats.memberCount > 0) {
          statsMessage += `

👥 *Member:* ${discordStats.memberCount}
├ Diese Woche: +${discordStats.newMembersWeek}
└ Heute: +${discordStats.newMembersToday}`
        }

        statsMessage += `

🏆 *Founding Members:*
├ Vergeben: ${foundingStats.current}/${foundingStats.total}
├ Verfügbar: ${foundingStats.remaining}
└ Fortschritt: ${foundingStats.percentage}%`

        if (foundingStats.projectedSelloutDays) {
          statsMessage += `

⏳ *Prognose:* Ausverkauft in ~${foundingStats.projectedSelloutDays} Tagen`
        }

        await sendMessage(chatId, statsMessage)
        return NextResponse.json({ ok: true })
      }

      // ============================================
      // UNI-OUTREACH COMMANDS
      // ============================================

      // /find oder /servers - Server Discovery
      if (message.text === '/find' || message.text === '/servers') {
        await sendMessageWithButtons(chatId, `🎓 *Uni-Outreach Tool*

Finde Discord-Server von Universitäten, Forschungs-Communities und Studenten-Gruppen.

*Optionen:*`, [
          [
            { text: '🔍 Server suchen', callback_data: 'outreach_find' },
            { text: '📋 Meine Liste', callback_data: 'outreach_list' }
          ],
          [
            { text: '📊 Statistiken', callback_data: 'outreach_stats' },
            { text: '📅 Wochenreport', callback_data: 'outreach_report' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // /find mit Suchbegriff - DISCORD DISCOVERY API + FERTIGES INTRO!
      if (message.text.startsWith('/find ')) {
        const query = message.text.replace('/find ', '').trim()
        if (query) {
          await sendChatAction(chatId, 'typing')
          const { searchDiscordDiscovery, formatDiscoveryResults, getDiscoveryJoinLink } = await import('@/lib/discord-outreach')
          const servers = await searchDiscordDiscovery(query, 10)

          if (servers.length === 0) {
            await sendMessage(chatId, `❌ Keine Server gefunden für "${query}"

Versuche:
• research, study, university
• psychology, sociology, science
• academic, phd, student`)
          } else {
            // 1. Server-Liste mit Join-Buttons
            let serverList = `🎯 *${servers.length} Server für "${query}":*\n\n`
            serverList += formatDiscoveryResults(servers)

            const buttons = servers.slice(0, 5).map(s => [{
              text: `🚀 ${s.name.substring(0, 22)} (${s.memberCount >= 1000 ? Math.round(s.memberCount/1000) + 'k' : s.memberCount})`,
              url: getDiscoveryJoinLink(s)
            }])

            await sendMessageWithButtons(chatId, serverList, buttons)

            // 2. Fertiges Intro zum Kopieren/Weiterleiten
            const intro = `👋 Hi everyone!

I'm working on EVIDENRA - a tool for qualitative research.

🔬 What it does:
• Auto-transcription of interviews
• AI-assisted coding & analysis
• Export to NVivo, ATLAS.ti, MAXQDA

🎓 Great for theses, dissertations & qualitative studies.

Currently in beta - happy to answer questions!
🔗 https://evidenra.com`

            await sendMessage(chatId, intro)

            await sendMessage(chatId, `👆 *Fertige Nachricht!*

1. Tritt einem Server bei (Buttons oben)
2. Leite diese Nachricht weiter oder kopiere sie
3. Poste im #introductions Channel`)
          }
          return NextResponse.json({ ok: true })
        }
      }

      // /outreach - Outreach Dashboard
      if (message.text === '/outreach') {
        const { getOutreachStats, formatOutreachStats, getOutreachEntries, formatOutreachList } = await import('@/lib/discord-outreach')
        const stats = await getOutreachStats()
        const entries = await getOutreachEntries()
        const recentEntries = entries.slice(-5)

        await sendMessageWithButtons(chatId, `${formatOutreachStats(stats)}

📋 *Letzte Einträge:*
${formatOutreachList(recentEntries)}`, [
          [
            { text: '🔍 Neue Server finden', callback_data: 'outreach_find' },
            { text: '📅 Wochenreport', callback_data: 'outreach_report' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // /intro - Auto-Intro Generator
      if (message.text === '/intro') {
        await sendMessage(chatId, `📝 *Auto-Intro Generator*

Für welchen Server soll ich eine Vorstellung schreiben?

_Schreib den Server-Namen:_`)
        pendingOutreachInput.set(userId, { type: 'intro' })
        return NextResponse.json({ ok: true })
      }

      // /intro mit Server-Name
      if (message.text.startsWith('/intro ')) {
        const serverName = message.text.replace('/intro ', '').trim()
        if (serverName) {
          pendingOutreachInput.set(userId, { type: 'intro', data: { serverName } })

          await sendMessageWithButtons(chatId, `📝 *Intro für:* ${serverName}

Wähle den Stil:`, [
            [
              { text: '👨‍🎓 Student', callback_data: 'outreach_intro_student' },
              { text: '🔬 Researcher', callback_data: 'outreach_intro_researcher' }
            ],
            [
              { text: '🎓 PhD/Doktorand', callback_data: 'outreach_intro_phd' }
            ]
          ])
          return NextResponse.json({ ok: true })
        }
      }

      // /report - Weekly Report
      if (message.text === '/report') {
        await sendChatAction(chatId, 'typing')
        const { generateWeeklyReport } = await import('@/lib/discord-outreach')
        const report = await generateWeeklyReport()
        await sendMessage(chatId, report)
        return NextResponse.json({ ok: true })
      }

      // /join - Zeigt wie man einem Server beitritt
      if (message.text === '/join') {
        await sendMessage(chatId, `🔗 *Server beitreten*

Schreib: \`/join Servername\`

_Beispiel: /join Uni Wien Students_

Ich zeige dir dann Links um den Invite zu finden!`)
        return NextResponse.json({ ok: true })
      }

      // /join <server> - Zeige Invite-Links
      if (message.text.startsWith('/join ')) {
        const serverName = message.text.replace('/join ', '').trim()
        if (serverName) {
          const { formatInviteHelp } = await import('@/lib/discord-outreach')
          await sendMessage(chatId, formatInviteHelp(serverName), { disable_web_page_preview: true })
          return NextResponse.json({ ok: true })
        }
      }

      // /joined - Server als beigetreten markieren
      if (message.text === '/joined') {
        await sendMessage(chatId, `✅ *Server als beigetreten markieren*

Schreib: \`/joined Servername\`

_Beispiel: /joined Uni Wien Students_

Der Server wird dann in deiner Outreach-Liste aktualisiert!`)
        return NextResponse.json({ ok: true })
      }

      // /joined <server> - Markiere als beigetreten
      if (message.text.startsWith('/joined ')) {
        const serverName = message.text.replace('/joined ', '').trim()
        if (serverName) {
          const { markServerAsJoined } = await import('@/lib/discord-outreach')
          const entry = await markServerAsJoined(serverName)

          if (entry) {
            await sendMessageWithButtons(chatId, `✅ *${serverName}* als beigetreten markiert!

📊 Status: joined
📅 Beigetreten: ${new Date().toLocaleDateString('de-AT')}

*Nächster Schritt:* Intro posten!`, [
              [
                { text: '📝 Intro generieren', callback_data: `outreach_intro_for_${encodeURIComponent(serverName)}` }
              ]
            ])
          } else {
            await sendMessage(chatId, `❌ Fehler beim Aktualisieren.`)
          }
          return NextResponse.json({ ok: true })
        }
      }

      // /discord Command - Multi-Channel Support mit Buttons
      if (message.text === '/discord') {
        await sendMessageWithButtons(chatId, `🎮 *Discord Multi-Channel*

Wähle einen Channel oder schreib direkt:
\`#announcements 🎉 Nachricht\`

Postet als: *Andi | EVIDENRA Support*
✨ KEIN BOT-Badge!`, [
          [
            { text: '📢 Announcements', callback_data: 'discord_announcements' },
            { text: '💬 Support', callback_data: 'discord_support' }
          ],
          [
            { text: '🏆 Founding', callback_data: 'discord_founding' },
            { text: '⭐ Success', callback_data: 'discord_success' }
          ],
          [
            { text: '📚 Tutorials', callback_data: 'discord_tutorials' },
            { text: '👋 Welcome', callback_data: 'discord_welcome' }
          ]
        ])
        return NextResponse.json({ ok: true })
      }

      // Discord Channel Commands - Direkt posten
      const discordChannelCommands: Record<string, string> = {
        '/announcements': 'announcements',
        '/support': 'help-and-support',
        '/founding': 'founding-lounge',
        '/success': 'success-stories',
        '/tutorials': 'tutorials',
        '/welcome': 'welcome'
      }

      for (const [cmd, channel] of Object.entries(discordChannelCommands)) {
        if (message.text.startsWith(cmd)) {
          const msgContent = message.text.replace(cmd, '').trim()

          if (!msgContent) {
            // Keine Nachricht - frage nach
            await sendMessage(chatId, `📝 *Was soll ich in #${channel} posten?*

Schreib deine Nachricht (mit Emojis!):`)
            // Speichere pending channel für nächste Nachricht
            await savePendingDiscordChannel(userId, channel)
            return NextResponse.json({ ok: true })
          }

          // Nachricht direkt senden
          const { sendToDiscordChannel } = await import('@/lib/app-integrations')
          await sendChatAction(chatId, 'typing')
          const result = await sendToDiscordChannel(channel, msgContent)

          if (result.success) {
            await sendMessage(chatId, `✅ *Discord #${result.channel}*

_Gesendet als "Andi | EVIDENRA Support"_

📝 ${msgContent.substring(0, 100)}${msgContent.length > 100 ? '...' : ''}`)
          } else {
            await sendMessage(chatId, `❌ *Fehler:* ${result.error}`)
          }
          return NextResponse.json({ ok: true })
        }
      }

      // Direkter Discord Channel Post: #channel Nachricht
      if (message.text.startsWith('#') || message.text.toLowerCase().startsWith('discord')) {
        const { sendToDiscordChannel, parseDiscordMessage } = await import('@/lib/app-integrations')
        const textWithoutPrefix = message.text.toLowerCase().startsWith('discord')
          ? message.text.replace(/^discord[:\s]*/i, '').trim()
          : message.text

        const { channel, message: discordMsg } = parseDiscordMessage(textWithoutPrefix)

        if (discordMsg) {
          await sendChatAction(chatId, 'typing')
          const result = await sendToDiscordChannel(channel, discordMsg)

          if (result.success) {
            await sendMessage(chatId, `✅ *Discord #${result.channel}*

_Gesendet als "Andi | EVIDENRA Support"_

📝 ${discordMsg.substring(0, 100)}${discordMsg.length > 100 ? '...' : ''}`)
          } else {
            await sendMessage(chatId, `❌ *Fehler:* ${result.error}`)
          }
          return NextResponse.json({ ok: true })
        }
      }

      if (message.text === '/history') {
        const { getConversationHistory } = await import('@/lib/supabase')
        const history = await getConversationHistory(userId, 10)
        if (history.length === 0) {
          await sendMessage(chatId, `📜 *Deine History ist leer*\n\nSchick mir eine Nachricht um loszulegen!`)
        } else {
          let historyText = `📜 *Deine letzten Gespräche:*\n\n`
          history.forEach((msg, i) => {
            const role = msg.role === 'user' ? '👤' : '🤖'
            const content = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
            historyText += `${role} ${content}\n\n`
          })
          historyText += `_MOI erinnert sich automatisch an deine letzten Gespräche für bessere Antworten!_`
          await sendMessage(chatId, historyText)
        }
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
    // AVATAR VIDEO (HeyGen) - Via Voice Command
    // WICHTIG: Nicht auf Video warten! Sofort antworten um Telegram-Retries zu vermeiden
    // ============================================
    if (intent.type === 'avatar') {
      const script = intent.query
      if (!script || script.length < 10) {
        await sendMessage(chatId, `🎬 *Avatar Video erstellen*

Bitte gib ein Script an (min. 10 Zeichen):
• "Mach ein Avatar Video: Hallo, ich bin Anna..."
• "Avatar: Willkommen bei EVIDENRA!"

Oder nutze: /avatar Dein Text hier`)
        return NextResponse.json({ ok: true })
      }

      try {
        const { createAvatarVideo } = await import('@/lib/heygen')
        const result = await createAvatarVideo({
          script,
          avatar: 'anna',
          voice: 'german_female',
          aspectRatio: '16:9'
        })

        if (!result.success || !result.video_id) {
          await sendMessage(chatId, `❌ Video-Erstellung fehlgeschlagen: ${result.error}`)
          return NextResponse.json({ ok: true })
        }

        // SOFORT antworten - NICHT auf Video warten!
        await sendMessage(chatId, `🎬 *Avatar Video gestartet!*

📝 Script: "${script.substring(0, 80)}${script.length > 80 ? '...' : ''}"
🆔 Video ID: \`${result.video_id}\`

⏳ Das Video wird in 2-5 Minuten fertig.

👉 Status prüfen: /videostatus ${result.video_id}

_Oder warte - ich schicke dir den Link wenn es fertig ist!_`)

        // KEIN Background-Polling auf Vercel (serverless terminiert nach Response)
        // User muss /videostatus nutzen oder 2-5 Min warten

      } catch (e: any) {
        await sendMessage(chatId, `❌ Fehler: ${e.message}`)
      }
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // WERBUNG AUTOMATION - Kompletter Workflow
    // Sprachbefehl: "Werbung mit Video über qualitative Forschung"
    // Genesis Engine Videos + HeyGen Avatar + Social Media
    // ============================================
    if ((intent as any).type === 'werbung') {
      const topic = intent.query || 'EVIDENRA qualitative Forschung'
      const topicLower = topic.toLowerCase()

      // Genesis Engine Videos (verfügbar in D:\Genesis Engine\video-generator\output)
      const genesisVideos: Record<string, { file: string, title: string }> = {
        'dashboard': { file: 'EVIDENRA-Dashboard-Tutorial.mp4', title: 'Dashboard Tutorial' },
        'analyse': { file: 'EVIDENRA-Analyse-AKIH-Score.mp4', title: 'AKIH Analyse' },
        'kodierung': { file: 'EVIDENRA-Kodierung-Analyse.mp4', title: 'Kodierung & Analyse' },
        'kategorien': { file: 'EVIDENRA-Kategorien-7Persona.mp4', title: '7-Persona System' },
        'interview': { file: 'EVIDENRA-Kodierung-Analyse.mp4', title: 'Interview Analyse' },
        'export': { file: 'EVIDENRA-Export-Formate.mp4', title: 'Export Formate' },
        'bericht': { file: 'EVIDENRA-Bericht-Dokumentation.mp4', title: 'Berichte' },
        'fragen': { file: 'EVIDENRA-Forschungsfragen.mp4', title: 'Forschungsfragen' },
        'muster': { file: 'EVIDENRA-Mustererkennung.mp4', title: 'Mustererkennung' },
        'wissen': { file: 'EVIDENRA-Wissensintegration.mp4', title: 'Wissensintegration' },
        'omniscience': { file: 'EVIDENRA-Omniscience.mp4', title: 'Omniscience KI' },
        'genesis': { file: 'EVIDENRA-Genesis-Engine.mp4', title: 'Genesis Engine' },
        'lizenz': { file: 'EVIDENRA-Lizenz-Aktivierung.mp4', title: 'Lizenz & Aktivierung' },
        'upload': { file: 'EVIDENRA-Dokumente-Upload.mp4', title: 'Dokumente Upload' },
        'api': { file: 'EVIDENRA-Einstellungen-API-Bridge.mp4', title: 'API Bridge' },
        'default': { file: 'EVIDENRA-Professional-v7.6-Demo.mp4', title: 'Professional Demo' }
      }

      // Passendes Genesis Video finden
      let genesisVideo = genesisVideos.default
      for (const [key, video] of Object.entries(genesisVideos)) {
        if (topicLower.includes(key)) {
          genesisVideo = video
          break
        }
      }

      await sendMessage(chatId, `🚀 *EVIDENRA Werbung Automation*

📌 *Thema:* "${topic}"
🎬 *Genesis Video:* ${genesisVideo.title}

Starte kompletten Workflow:
1️⃣ Script generieren (themenbasiert)
2️⃣ HeyGen Avatar Video erstellen
3️⃣ Genesis Engine Video: \`${genesisVideo.file}\`
4️⃣ Videos zusammenfügen (FFmpeg Chromakey)
5️⃣ YouTube Upload + Twitter Post
6️⃣ Share-Links generieren

⏳ Avatar-Erstellung dauert ca. 2-5 Minuten...`)

      try {
        // Schritt 1: Script generieren basierend auf Thema
        // Erweiterte Scripts für verschiedene EVIDENRA-Features
        const scripts: Record<string, string> = {
          'qualitative forschung': 'Hallo! EVIDENRA ist die führende Software für qualitative Forschung mit künstlicher Intelligenz. Mit unserer AKIH-Methode analysieren Sie Interviews zehnmal schneller. Unser 7-Persona-System garantiert höchste wissenschaftliche Qualität. Besuchen Sie evidenra punkt com!',
          'founding member': 'Werden Sie jetzt Founding Member bei EVIDENRA! Als einer der ersten Nutzer erhalten Sie 60 Prozent Rabatt auf Lebenszeit. Plus exklusiven Zugang zu neuen Features und direkten Kontakt zum Entwicklerteam. Nur begrenzte Plätze verfügbar auf evidenra punkt com.',
          'interview': 'Müde von stundenlanger manueller Interview-Analyse? EVIDENRA analysiert Ihre Interviews automatisch mit künstlicher Intelligenz. Transkription, Kodierung und Themenanalyse in Minuten statt Tagen. Wissenschaftlich validiert. Testen Sie kostenlos auf evidenra punkt com.',
          'dashboard': 'Das EVIDENRA Dashboard zeigt alle Ihre Forschungsprojekte auf einen Blick. Verwalten Sie Interviews, analysieren Sie Muster und erstellen Sie Berichte. Alles übersichtlich organisiert. Entdecken Sie es auf evidenra punkt com.',
          'analyse': 'Die EVIDENRA AKIH-Methode revolutioniert qualitative Analyse. Sieben KI-Personas analysieren Ihre Daten aus verschiedenen wissenschaftlichen Perspektiven. Das Ergebnis: Tiefere Erkenntnisse in kürzerer Zeit. Mehr auf evidenra punkt com.',
          'kodierung': 'Automatische Kodierung mit EVIDENRA. Unsere KI erkennt Themen, Kategorien und Muster in Ihren Interviews. Sie behalten die volle Kontrolle und können jederzeit anpassen. Testen Sie es auf evidenra punkt com.',
          'kategorien': 'Das 7-Persona-System von EVIDENRA. Sieben verschiedene KI-Perspektiven analysieren Ihre Daten: Wissenschaftlich, kritisch, kreativ und mehr. So erhalten Sie ein vollständiges Bild. Jetzt auf evidenra punkt com.',
          'export': 'EVIDENRA exportiert in alle gängigen Formate. PDF-Berichte, Word-Dokumente, Excel-Tabellen und wissenschaftliche Formate wie MAXQDA. Flexibel für Ihre Anforderungen auf evidenra punkt com.',
          'omniscience': 'EVIDENRA Omniscience - unsere fortschrittlichste KI. Stellen Sie Fragen zu Ihren Daten in natürlicher Sprache und erhalten Sie fundierte Antworten mit Quellenangaben. Die Zukunft der Forschung auf evidenra punkt com.',
          'genesis': 'Die Genesis Engine von EVIDENRA. Automatische Videogenerierung für Ihre Forschungsergebnisse. Präsentieren Sie Erkenntnisse visuell und überzeugend. Entdecken Sie die Möglichkeiten auf evidenra punkt com.',
          'muster': 'Mustererkennung mit EVIDENRA. Unsere KI findet wiederkehrende Themen und Zusammenhänge in Ihren qualitativen Daten. Was würde Stunden dauern, erledigt EVIDENRA in Minuten. Testen Sie es auf evidenra punkt com.',
          'bericht': 'Professionelle Berichte mit EVIDENRA. Von der Analyse zum fertigen Dokument in Minuten. Wissenschaftlich fundiert, professionell formatiert. Ihr Forschungsergebnis verdient die beste Präsentation. Jetzt auf evidenra punkt com.',
          'default': 'Entdecken Sie EVIDENRA - die Revolution in der qualitativen Forschung. KI-gestützte Analyse mit höchsten wissenschaftlichen Standards. Jetzt mit 60 Prozent Founding Member Rabatt. Mehr auf evidenra punkt com.'
        }

        let script = scripts.default
        for (const [key, value] of Object.entries(scripts)) {
          if (topicLower.includes(key)) {
            script = value
            break
          }
        }

        // Avatar automatisch basierend auf Thema auswählen
        // Verwendet aktualisierte HeyGen Avatar-IDs (Dezember 2024)
        const avatarSelection: Record<string, { avatar: string, voice: string, description: string }> = {
          // Wissenschaftliche/Analyse Themen -> professionelle weibliche Stimme
          'analyse': { avatar: 'abigail', voice: 'german_female', description: 'Abigail (Professional)' },
          'forschung': { avatar: 'abigail', voice: 'german_female', description: 'Abigail (Professional)' },
          'interview': { avatar: 'adriana', voice: 'german_female', description: 'Adriana (Business)' },
          'kodierung': { avatar: 'amelia', voice: 'german_female', description: 'Amelia (Training)' },
          'kategorien': { avatar: 'abigail', voice: 'german_female', description: 'Abigail (Professional)' },
          // Business/Sales Themen -> männliche oder dynamische weibliche Stimme
          'founding': { avatar: 'adrian', voice: 'german_male', description: 'Adrian (Business)' },
          'member': { avatar: 'adrian', voice: 'german_male', description: 'Adrian (Business)' },
          'rabatt': { avatar: 'albert', voice: 'german_male', description: 'Albert (Business)' },
          'preis': { avatar: 'aditya', voice: 'german_male', description: 'Aditya (Professional)' },
          // Technische Themen
          'api': { avatar: 'aditya', voice: 'german_male', description: 'Aditya (Tech)' },
          'export': { avatar: 'aditya', voice: 'german_male', description: 'Aditya (Friendly)' },
          'genesis': { avatar: 'albert', voice: 'german_male', description: 'Albert (Tech)' },
          // Tutorial/Erklärung Themen
          'dashboard': { avatar: 'amanda', voice: 'german_female', description: 'Amanda (Tutorial)' },
          'bericht': { avatar: 'amelia', voice: 'german_female', description: 'Amelia (Friendly)' },
          'default': { avatar: 'abigail', voice: 'german_female', description: 'Abigail (Professional)' }
        }

        let selectedAvatar = avatarSelection.default
        for (const [key, config] of Object.entries(avatarSelection)) {
          if (topicLower.includes(key)) {
            selectedAvatar = config
            break
          }
        }

        await sendMessage(chatId, `📝 *Schritt 1/6: Script erstellt*

🎭 *Avatar:* ${selectedAvatar.description}
_"${script.substring(0, 80)}..."_`)

        // Schritt 2: HeyGen Avatar Video erstellen
        const { createAvatarVideo, getVideoStatus } = await import('@/lib/heygen')
        const avatarResult = await createAvatarVideo({
          script,
          avatar: selectedAvatar.avatar as any,
          voice: selectedAvatar.voice as any,
          aspectRatio: '16:9',
          background: { type: 'color', value: '#00FF00' }
        })

        if (!avatarResult.success || !avatarResult.video_id) {
          await sendMessage(chatId, `❌ HeyGen Fehler: ${avatarResult.error}`)
          return NextResponse.json({ ok: true })
        }

        // SOFORT antworten - NICHT auf Video warten (Vercel Timeout!)
        await sendMessage(chatId, `✅ *WERBUNG GESTARTET!*

🎭 *Avatar:* ${selectedAvatar.description}
🆔 *Video ID:* \`${avatarResult.video_id}\`

⏳ *Video wird erstellt (2-5 Min)*

👉 *Status prüfen:* /videostatus ${avatarResult.video_id}

━━━━━━━━━━━━━━━━━━━━━━

📋 *Wenn Video fertig - Compositing:*
\`\`\`
cd "D:\\EVIDENRA-Videos"
node composite-video.js [VIDEO_URL] "D:\\Genesis Engine\\video-generator\\output\\${genesisVideo.file}"
\`\`\`

💡 *Oder kompletter Workflow:*
\`node werbung-automation.js "${topic}"\`

🔗 [evidenra.com/pricing](https://evidenra.com/pricing)`)

      } catch (e: any) {
        await sendMessage(chatId, `❌ Fehler: ${e.message}`)
      }
      return NextResponse.json({ ok: true })
    }

    // ============================================
    // VOICEOVER (ElevenLabs) - Via Voice Command
    // ============================================
    if (intent.type === 'voiceover') {
      const text = intent.query
      if (!text || text.length < 5) {
        await sendMessage(chatId, `🎤 *Voiceover erstellen*

Bitte gib einen Text an:
• "Voiceover: Willkommen bei EVIDENRA!"
• "Sprich: Das ist ein Test"

Oder nutze: /voiceover Dein Text hier`)
        return NextResponse.json({ ok: true })
      }

      await sendChatAction(chatId, 'record_voice')

      try {
        const { textToSpeech } = await import('@/lib/elevenlabs')
        const result = await textToSpeech(text, {
          voice: 'sarah',
          model: 'multilingual_v2',
          language: 'de'
        })

        if (result.success && result.audio) {
          const audioBuffer = result.audio.buffer.slice(result.audio.byteOffset, result.audio.byteOffset + result.audio.byteLength) as ArrayBuffer
          const formData = new FormData()
          formData.append('chat_id', chatId.toString())
          formData.append('voice', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voiceover.mp3')
          formData.append('caption', `🎤 "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)

          await fetch(`${TELEGRAM_API}/sendVoice`, {
            method: 'POST',
            body: formData
          })
        } else {
          await sendMessage(chatId, `❌ Voiceover fehlgeschlagen: ${result.error}`)
        }
      } catch (e: any) {
        await sendMessage(chatId, `❌ Fehler: ${e.message}`)
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
    // PDF EXPORT
    // ============================================
    if (intent.type === 'pdf') {
      const hasCredits = await useCredit(userId)
      if (!hasCredits) {
        await sendMessage(chatId, `⚠️ *Credits aufgebraucht!*\n\n/buy - Credits kaufen`)
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chatId, '📄 *Erstelle PDF...*')
      await sendChatAction(chatId, 'upload_document')

      // Kontext für bessere Ergebnisse
      const context = await getContextForAI(userId)
      const asset = await generateAsset(intent.query + context)

      // User-Nachricht speichern
      await addToHistory(userId, 'user', userText)

      try {
        const pdfBuffer = await createPDF(asset.title || 'Dokument', asset.content)
        const fileName = `${asset.title?.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_') || 'Dokument'}.pdf`
        await sendDocumentBuffer(chatId, pdfBuffer, fileName, `📄 *${asset.title}*\n\n_Dein PDF ist fertig!_`)

        // Antwort speichern
        await addToHistory(userId, 'assistant', `PDF erstellt: ${asset.title}`)
        await saveAsset(userId, 'document', asset.title || 'PDF', asset.content)
      } catch (e) {
        console.error('PDF creation error:', e)
        await sendMessage(chatId, `📄 *${asset.title}*\n\n${asset.content}`)
      }

      return NextResponse.json({ ok: true })
    }

    // ============================================
    // E-MAIL DIREKT VERSENDEN - AUTO-SEND! 🚗
    // Perfekt für Autofahren: Einfach diktieren, wird sofort gesendet!
    // ============================================
    if (intent.type === 'email') {
      const hasCredits = await useCredit(userId)
      if (!hasCredits) {
        await sendMessage(chatId, `⚠️ *Credits aufgebraucht!*\n\n/buy - Credits kaufen`)
        return NextResponse.json({ ok: true })
      }

      // E-Mail-Adresse extrahieren
      const emailRegex = /[\w.-]+@[\w.-]+\.\w+/
      const emailMatch = intent.query.match(emailRegex)
      const toEmail = emailMatch ? emailMatch[0] : null

      if (!toEmail) {
        await sendMessage(chatId, `❌ Keine gültige E-Mail-Adresse gefunden.\n\n_Beispiel: "max@firma.de Treffen morgen um 10"_`)
        return NextResponse.json({ ok: true })
      }

      // Check ob nur Entwurf gewünscht
      const lower = intent.query.toLowerCase()
      const isDraft = lower.includes('entwurf') || lower.includes('draft') || lower.includes('vorschau')

      // Text ohne E-Mail-Adresse
      const textWithoutEmail = intent.query.replace(emailRegex, '').trim()

      // SMART PARSING: Betreff und Body intelligent extrahieren
      let subject = ''
      let body = ''

      // Pattern 1: "Betreff: xyz" explizit
      const subjectMatch = textWithoutEmail.match(/(?:betreff|subject|thema)[:\s]+([^.\n]+)/i)
      if (subjectMatch) {
        subject = subjectMatch[1].trim()
        body = textWithoutEmail.replace(subjectMatch[0], '').trim()
      } else {
        // Pattern 2: Erste Phrase = Betreff, Rest = Body
        // z.B. "Treffen morgen - ich komme um 10 Uhr"
        const parts = textWithoutEmail.split(/[-–—:]/)
        if (parts.length >= 2 && parts[0].length < 50) {
          subject = parts[0].trim()
          body = parts.slice(1).join(' ').trim()
        } else {
          // Pattern 3: Alles ist der Inhalt, Betreff auto-generieren
          body = textWithoutEmail
          // Ersten paar Wörter als Betreff
          const words = textWithoutEmail.split(' ').slice(0, 5).join(' ')
          subject = words.length > 40 ? words.substring(0, 40) + '...' : words
        }
      }

      // Cleanup
      body = body
        .replace(/schick|send|mail|e-mail|an |eine? |entwurf|draft|vorschau/gi, '')
        .trim()
      subject = subject
        .replace(/schick|send|mail|e-mail|an |eine? /gi, '')
        .trim() || 'Nachricht'

      // Wenn Body zu kurz, AI generieren lassen
      if (!body || body.length < 5) {
        const asset = await generateAsset(`Schreibe eine sehr kurze E-Mail (2-3 Sätze max). Thema: ${subject}. Professionell aber freundlich.`)
        body = asset.content
      }

      // NUR ENTWURF?
      if (isDraft) {
        await sendMessage(chatId, `📝 *E-Mail Entwurf:*

📬 An: \`${toEmail}\`
📋 Betreff: ${subject}

${body}

_Sag "senden" um abzuschicken, oder ändere den Text._`)
        await addToHistory(userId, 'assistant', `E-Mail Entwurf für ${toEmail}`)
        return NextResponse.json({ ok: true })
      }

      // SOFORT SENDEN! 🚀
      const { sendEmail } = await import('@/lib/email')
      const result = await sendEmail({
        to: toEmail,
        subject: subject,
        body: body
      })

      if (result.success) {
        // Kurze, klare Bestätigung - perfekt für Autofahren!
        await sendMessage(chatId, `✅ *Gesendet an ${toEmail}*

📋 ${subject}

_${body.substring(0, 100)}${body.length > 100 ? '...' : ''}_`)
        await addToHistory(userId, 'assistant', `E-Mail gesendet an ${toEmail}: ${subject}`)
      } else {
        await sendMessage(chatId, `❌ *Fehler:* ${result.error || 'E-Mail nicht gesendet'}

_Prüfe die Adresse: ${toEmail}_`)
      }

      return NextResponse.json({ ok: true })
    }

    // ============================================
    // ICS KALENDER EXPORT
    // ============================================
    if (intent.type === 'ics') {
      const hasCredits = await useCredit(userId)
      if (!hasCredits) {
        await sendMessage(chatId, `⚠️ *Credits aufgebraucht!*\n\n/buy - Credits kaufen`)
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chatId, '📅 *Erstelle Kalender-Event...*')
      await sendChatAction(chatId, 'upload_document')

      // Generiere Kalender-Event mit AI - Sehr spezifischer Prompt
      const today = new Date()
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]

      const asset = await generateAsset(`Erstelle ein Kalender-Event. User sagt: "${intent.query}"

WICHTIG: Antworte NUR mit diesem JSON-Format, nichts anderes:
[{"title": "Event Titel", "date": "${tomorrowStr}", "time": "10:00", "duration": "1h", "description": "Beschreibung", "location": ""}]

Falls "morgen" erwähnt wird, nutze: ${tomorrowStr}
Falls "heute" erwähnt wird, nutze: ${today.toISOString().split('T')[0]}

NUR DAS JSON AUSGEBEN!`)

      await addToHistory(userId, 'user', userText)

      try {
        const events = parseCalendarFromAI(asset.content)
        const icsContent = createICS(events)
        const icsBuffer = Buffer.from(icsContent, 'utf-8')
        const fileName = `${events[0]?.title?.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_') || 'Event'}.ics`

        // Kalender-Links erstellen
        const calLinks = createCalendarLinks(events[0])

        // ICS auf Supabase hochladen für direkten Download-Link
        let icsDownloadUrl = ''
        try {
          const uploadFileName = `calendar_${Date.now()}_${fileName}`
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('assets')
            .upload(uploadFileName, icsBuffer, {
              contentType: 'text/calendar',
              upsert: true
            })

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('assets').getPublicUrl(uploadFileName)
            icsDownloadUrl = urlData.publicUrl
          }
        } catch (uploadErr) {
          console.log('ICS upload optional:', uploadErr)
        }

        // ICS Datei senden
        await sendDocumentBuffer(chatId, icsBuffer, fileName, `📅 *${events[0]?.title || 'Event'}*

📆 ${events[0]?.date} ${events[0]?.time ? `um ${events[0].time}` : ''}
${events[0]?.location ? `📍 ${events[0].location}` : ''}`)

        // Direkte Kalender-Links senden mit Inline-Buttons
        // Apple/iPhone: webcal Link für direktes Hinzufügen
        const webcalUrl = icsDownloadUrl ? icsDownloadUrl.replace('https://', 'webcal://') : ''

        const calendarKeyboard = {
          inline_keyboard: [
            [{ text: '📱 Google Calendar', url: calLinks.google }],
            [{ text: '📧 Outlook.com', url: calLinks.outlook }],
            ...(icsDownloadUrl ? [[{ text: '🍎 iPhone/iPad (Safari öffnen)', url: icsDownloadUrl }]] : [])
          ]
        }

        await sendMessage(chatId, `📲 *Termin eintragen:*

*Klicke auf deinen Kalender:*
↓ Buttons unten ↓

*iPhone/iPad Tipp:*
"iPhone/iPad" Button → Safari öffnet → Oben rechts "Öffnen mit" → Kalender → *Hinzufügen*`, {
          disable_web_page_preview: true,
          reply_markup: calendarKeyboard
        })

        await addToHistory(userId, 'assistant', `Kalender-Event erstellt: ${events[0]?.title}`)
        await saveAsset(userId, 'calendar', events[0]?.title || 'Event', JSON.stringify(events))
      } catch (e) {
        console.error('ICS creation error:', e)
        await sendMessage(chatId, `📅 *Kalender*\n\n${asset.content}`)
      }

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
    // APP INTEGRATIONS - Notion, Trello, Todoist, etc.
    // ============================================
    if (isIntegrationRequest(userText)) {
      const hasCredits = await useCredit(userId)
      if (!hasCredits) {
        await sendMessage(chatId, `⚠️ *Credits aufgebraucht!*\n\n/buy - Credits kaufen`)
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chatId, '🔗 *Verbinde mit App...*')
      await addToHistory(userId, 'user', userText)

      try {
        const request = await parseIntegrationRequest(userText)

        if (request.type === 'unknown') {
          // Zeige verfügbare Integrationen
          const available = getAvailableIntegrations()
          if (available.length > 0) {
            await sendMessage(chatId, `🔗 *Verfügbare Integrationen:*\n\n${available.map(a => `• ${a}`).join('\n')}\n\n_Sag z.B. "Speicher in Notion: Meine Idee"_`)
          } else {
            await sendMessage(chatId, `🔗 *Keine Integrationen konfiguriert*\n\nKontaktiere den Admin um Apps zu verbinden!`)
          }
          return NextResponse.json({ ok: true })
        }

        const result = await executeIntegration(request)

        if (result.success) {
          let message = `✅ *${result.message}*`
          if (result.url) {
            message += `\n\n[🔗 Öffnen](${result.url})`
          }
          await sendMessage(chatId, message, { disable_web_page_preview: true })
          await addToHistory(userId, 'assistant', result.message)
        } else {
          await sendMessage(chatId, `❌ *Fehler:* ${result.message}`)
        }

        return NextResponse.json({ ok: true })
      } catch (e) {
        console.error('Integration error:', e)
        // Fallback zu normaler Verarbeitung
      }
    }

    // ============================================
    // CHAIN ACTIONS - Mehrere Aktionen aus einem Satz
    // ============================================
    if (mightBeChain(userText)) {
      const hasCredits = await useCredit(userId)
      if (!hasCredits) {
        await sendMessage(chatId, `⚠️ *Credits aufgebraucht!*\n\n/buy - Credits kaufen`)
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chatId, '⚡ *Analysiere Aktionen...*')
      await addToHistory(userId, 'user', userText)

      try {
        // Chain parsen
        const plan = await parseChainActions(userText)

        if (plan.actions.length > 1) {
          await sendMessage(chatId, `🔗 *${plan.actions.length} Aktionen erkannt:*\n${plan.actions.map((a, i) => `${i + 1}. ${a.type}`).join('\n')}`)
        }

        // Chain ausführen
        const result = await executeChain(plan, { userId, chatId, userName }, actionHandlers)

        // Ergebnisse senden
        for (const actionResult of result.results) {
          if (actionResult.success && actionResult.result) {
            const r = actionResult.result

            // Dokumente senden
            if (r.buffer && (r.type === 'pdf' || r.type === 'pptx')) {
              await sendChatAction(chatId, 'upload_document')
              const fileName = `${r.title?.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_') || 'Dokument'}.${r.type}`
              await sendDocumentBuffer(chatId, r.buffer, fileName, `📄 *${r.title}*`)
            }

            // ICS senden
            if (r.buffer && r.type === 'ics') {
              await sendDocumentBuffer(chatId, r.buffer, `${r.events?.[0]?.title || 'Event'}.ics`, `📅 *Termin erstellt*`)
            }

            // WhatsApp Link
            if (r.type === 'whatsapp_link') {
              await sendMessage(chatId, `📱 [WhatsApp öffnen](${r.link})`, { disable_web_page_preview: true })
            }

            // E-Mail Bestätigung
            if (r.success && actionResult.action.type === 'send_email') {
              await sendMessage(chatId, `✅ E-Mail gesendet!`)
            }
          }
        }

        // Zusammenfassung
        const successCount = result.results.filter(r => r.success).length
        const emoji = result.allSuccessful ? '✅' : '⚠️'
        await sendMessage(chatId, `${emoji} *${result.summary}*\n\n_${successCount}/${result.results.length} Aktionen erfolgreich_`)

        await addToHistory(userId, 'assistant', result.summary)
        return NextResponse.json({ ok: true })

      } catch (e) {
        console.error('Chain execution error:', e)
        // Fallback zu normaler Asset-Generierung
      }
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

    // User-Nachricht zur History hinzufügen
    await addToHistory(userId, 'user', userText)

    // Kontext aus vorherigen Gesprächen holen
    const conversationContext = await getContextForAI(userId)

    // Asset generieren MIT Kontext
    const asset = await generateAsset(userText + conversationContext)
    const emoji = ASSET_EMOJIS[asset.type] || ASSET_EMOJIS.default

    // Asset und Antwort speichern
    await saveAsset(userId, asset.type, asset.title || 'Untitled', asset.content)
    await addToHistory(userId, 'assistant', `${asset.type}: ${asset.title || 'Asset'} - ${asset.content.substring(0, 100)}...`)

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
    } else if (asset.type === 'website') {
      // Website/HTML als Datei hochladen und Link senden
      try {
        await sendChatAction(chatId, 'upload_document')
        const htmlContent = asset.content
        const fileName = `${asset.title?.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_') || 'Website'}.html`
        const htmlBuffer = Buffer.from(htmlContent, 'utf-8')

        // DALL-E Prompts extrahieren falls vorhanden
        const dalleMatch = htmlContent.match(/<!--\s*DALL-E PROMPTS[^>]*:([\s\S]*?)-->/i)
        let dallePrompts = ''
        if (dalleMatch) {
          dallePrompts = dalleMatch[1].trim()
        }

        // HTML auf Supabase hochladen für Preview-Link
        const uploadFileName = `website_${Date.now()}_${fileName}`
        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(uploadFileName, htmlContent, { contentType: 'text/html' })

        let previewUrl = ''
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('assets').getPublicUrl(uploadFileName)
          previewUrl = urlData.publicUrl
        }

        // HTML-Datei zum Download senden
        await sendDocumentBuffer(chatId, htmlBuffer, fileName, `${emoji} *${asset.title}*\n\n_Deine Website ist fertig!_`)

        // Preview-Link senden wenn Upload erfolgreich
        if (previewUrl) {
          await sendMessage(chatId, `🔗 *Live-Preview:*\n[Website öffnen](${previewUrl})`, { disable_web_page_preview: false })
        }

        // DALL-E Prompts separat senden wenn vorhanden
        if (dallePrompts) {
          await sendMessage(chatId, `🎨 *Custom Bilder mit DALL-E/Midjourney:*\n\n${dallePrompts}\n\n_Kopiere diese Prompts in DALL-E oder Midjourney für einzigartige Bilder!_`)
        }
      } catch (e) {
        console.error('HTML creation error:', e)
        // Fallback: HTML-Code als Text
        await sendMessage(chatId, `${emoji} *${asset.title || 'Website'}*\n\n\`\`\`html\n${asset.content.substring(0, 3500)}\n\`\`\``)
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

      // Wenn User Voice geschickt hat, auch Voice Antwort senden
      if (respondWithVoice) {
        await sendChatAction(chatId, 'record_voice')
        await sendVoiceResponse(chatId, asset.content)
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
