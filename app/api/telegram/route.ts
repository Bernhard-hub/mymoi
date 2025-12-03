import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, useCredit, uploadFile, saveAsset } from '@/lib/supabase'
import { generateAsset, AssetType } from '@/lib/ai-engine'
import { createPresentation } from '@/lib/pptx'

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`

// ============================================
// TELEGRAM HELPER FUNCTIONS
// ============================================

async function sendMessage(chatId: number, text: string, options?: {
  parse_mode?: 'Markdown' | 'HTML'
  reply_markup?: object
}) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'Markdown',
      reply_markup: options?.reply_markup
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

async function sendPhoto(chatId: number, photoUrl: string, caption?: string) {
  await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'Markdown'
    })
  })
}

async function sendVoice(chatId: number, voiceUrl: string, caption?: string) {
  await fetch(`${TELEGRAM_API}/sendVoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      voice: voiceUrl,
      caption,
      parse_mode: 'Markdown'
    })
  })
}

async function sendChatAction(chatId: number, action: 'typing' | 'upload_document' | 'record_voice') {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action })
  })
}

// Voice in Text umwandeln (Groq Whisper - kostenlos)
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
// EMOJI MAPPING FÜR ASSET TYPES
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
  life_coach: '🧠', horoscope: '🔮', tarot: '🃏', baby_name: '👶',
  pet_name: '🐾', band_name: '🎸', color_palette: '🎨', outfit: '👗',
  date_idea: '💕', party_theme: '🎉', cocktail: '🍸', playlist: '🎧',
  book_recommend: '📚', movie_recommend: '🎬', game_idea: '🎲',
  icebreaker: '🧊', compliment: '💝', apology: '🙏', breakup: '💔',
  wedding_speech: '💒', eulogy: '🕯️', roast: '🔥', rap_verse: '🎤',
  pickup_line: '😏', excuse: '🤷', conspiracy: '👽', fortune: '🥠',
  haiku: '🌸', limerick: '🍀', acrostic: '🔤', anagram: '🔀',
  trivia: '💡', this_day: '📆', would_rather: '🤔', mad_libs: '📝',
  dnd_character: '🐉', superhero: '🦸', villain: '🦹', world_build: '🌍',
  plot_twist: '🔄', startup_name: '🚀', product_desc: '📦',
  review_response: '💬', faq: '❓', terms: '📋', privacy: '🔒',
  job_post: '💼', cover_letter: '✉️', reference: '⭐', resignation: '👋',
  complaint: '😤', thank_you: '🙏', love_letter: '💌', bucket_list: '🎯',
  new_year: '🎆', gratitude: '🙏', habit_tracker: '📈', morning_routine: '☀️',
  productivity: '⚡', declutter: '🧹', capsule_wardrobe: '👕', skincare: '✨',
  astro_compat: '💫', decision: '⚖️', argument_win: '🏆', negotiation: '🤝',
  salary_ask: '💵', difficult_conv: '💭', confrontation: '⚔️', boundary: '🚧',
  self_care: '💆', energy_boost: '⚡', sleep_routine: '😴', mindset_shift: '🧠',
  fear_conquer: '💪', habit_break: '🔨', procrastinate: '⏰', focus_session: '🎯',
  brain_dump: '💭', priority_matrix: '📊', goal_smart: '🎯', okr: '📈',
  kpi: '📊', milestone: '🏁', retrospective: '🔄', standup: '🧍',
  meeting_agenda: '📋', minutes: '📝', action_items: '✅', delegate: '👉',
  feedback_give: '💬', feedback_ask: '❓', '360_review': '🔄',
  onboarding: '🚀', offboarding: '👋', team_building: '👥', conflict_res: '🕊️',
  crisis_comm: '🚨', press_release: '📰', media_kit: '📁', bio: '👤',
  intro: '👋', networking: '🤝', cold_email: '📧', follow_up: '📩',
  reminder_email: '⏰', upsell: '📈', objection: '🛡️', closing: '🎯',
  refund_handle: '💳', churn_prevent: '🚫', win_back: '🏆', testimonial: '⭐',
  case_study: '📊', white_paper: '📄', ebook: '📱', course_outline: '📚',
  webinar_script: '🎥', podcast_notes: '🎙️', interview_qs: '❓', survey: '📋',
  nps: '📊', ab_test: '🔬', user_journey: '🗺️', empathy_map: '💭',
  value_prop: '💎', lean_canvas: '📋', bmcanvas: '📊', competitor: '🔍',
  market_size: '📈', pricing: '💵', launch_plan: '🚀', growth_hack: '📈',
  viral_loop: '🔄', referral: '👥', loyalty: '💎', gamification: '🎮',
  community: '👥', influencer: '⭐', collab: '🤝', sponsorship: '🏆',
  grant: '💰', crowdfund: '🎯', investor_deck: '📊', term_sheet: '📄',
  exit_strategy: '🚪'
}

// ============================================
// WELCOME MESSAGE
// ============================================
const WELCOME_MESSAGE = `Hey! 👋

Ich bin *MOI* - dein ultimativer AI-Assistent.

🚀 *Was ich kann:*

📊 Präsentationen & Dokumente
📧 E-Mails & Bewerbungen
🏷️ eBay Listings
💼 Business Plans & Pitch Decks
🎨 Bilder & Design Prompts
🎬 Video Scripts & Stories
📱 Social Media Posts
💻 Code & Websites
📅 Kalender & Planung
🔮 Horoskope & Tarot
💪 Fitness & Ernährung
🎵 Musik Prompts
📚 Lernen & Quiz
... und 200+ weitere Assets!

*Schick mir einfach eine Nachricht oder Sprachnachricht und sag was du brauchst!*

_3 kostenlose Assets zum Start_ 🎁`

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = body.message
    const callbackQuery = body.callback_query

    // Handle callback queries (button presses)
    if (callbackQuery) {
      const chatId = callbackQuery.message.chat.id
      const data = callbackQuery.data

      // Handle menu buttons here
      await sendMessage(chatId, `Du hast ${data} ausgewählt. Feature kommt bald!`)
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
    } else if (message.text) {
      // /start Befehl
      if (message.text === '/start') {
        await sendMessage(chatId, WELCOME_MESSAGE)
        return NextResponse.json({ ok: true })
      }

      // /help Befehl
      if (message.text === '/help') {
        await sendMessage(chatId, `*Hilfe* 🆘

Schick mir einfach was du brauchst:

• "Erstelle eine Präsentation über..."
• "Schreib mir eine E-Mail an..."
• "Erstelle ein eBay Listing für..."
• "Mach mir einen Trainingsplan"
• "Was ist mein Horoskop für heute?"
• "Gib mir Geschenkideen für..."

Ich erkenne automatisch was du willst! 🎯`)
        return NextResponse.json({ ok: true })
      }

      // /credits Befehl
      if (message.text === '/credits') {
        await sendMessage(chatId, `💰 *Deine Credits:* ${user.credits}

💡 Mit jedem Credit kannst du ein Asset erstellen.

🎁 *Mehr Credits?*
Coming soon: 10 Credits für 2€`)
        return NextResponse.json({ ok: true })
      }

      userText = message.text
    } else if (message.photo) {
      await sendMessage(chatId, '📸 Bilder-Analyse kommt bald!')
      return NextResponse.json({ ok: true })
    } else if (message.document) {
      await sendMessage(chatId, '📄 Dokumenten-Analyse kommt bald!')
      return NextResponse.json({ ok: true })
    }

    if (!userText) {
      await sendMessage(chatId, 'Schick mir eine Nachricht oder Sprachnachricht!')
      return NextResponse.json({ ok: true })
    }

    // Credits prüfen
    const hasCredits = await useCredit(userId)
    if (!hasCredits) {
      await sendMessage(chatId, `⚠️ *Credits aufgebraucht!*

Deine kostenlosen Assets sind weg.

💳 *Mehr Credits?*
Coming soon: 10 Credits für 2€

_Schreib mir wenn Payment live ist!_`)
      return NextResponse.json({ ok: true })
    }

    // Asset generieren
    await sendChatAction(chatId, 'typing')
    await sendMessage(chatId, '⚡ *Erstelle...*')

    const asset = await generateAsset(userText)
    const emoji = ASSET_EMOJIS[asset.type] || '📝'

    // Asset in DB speichern
    await saveAsset(userId, asset.type, asset.title || 'Untitled', asset.content)

    // Je nach Typ ausliefern
    if (asset.type === 'presentation') {
      try {
        await sendChatAction(chatId, 'upload_document')
        const slides = JSON.parse(asset.content)
        const pptxBuffer = await createPresentation(slides, asset.title || 'Präsentation')
        const fileName = `${asset.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'presentation'}_${Date.now()}.pptx`
        const fileUrl = await uploadFile(fileName, pptxBuffer, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        await sendDocument(chatId, fileUrl, fileName, `${emoji} *${asset.title}*\n\n_Fertig zum Präsentieren!_`)
      } catch (e) {
        await sendMessage(chatId, `${emoji} *${asset.title || 'Präsentation'}*\n\n${asset.content}`)
      }
    } else if (asset.type === 'code') {
      // Code mit Syntax Highlighting
      const lang = asset.metadata?.codeLanguage || ''
      await sendMessage(chatId, `${emoji} *${asset.title || 'Code'}*\n\n\`\`\`${lang}\n${asset.content}\n\`\`\``, { parse_mode: 'Markdown' })
    } else if (asset.type === 'image_prompt') {
      // Image Prompt mit Hinweis
      await sendMessage(chatId, `${emoji} *${asset.title || 'Bild-Prompt'}*\n\n${asset.content}\n\n_Kopiere diesen Prompt in DALL-E, Midjourney oder Stable Diffusion!_`)
    } else if (asset.type === 'music_prompt') {
      await sendMessage(chatId, `${emoji} *${asset.title || 'Musik-Prompt'}*\n\n${asset.content}\n\n_Kopiere diesen Prompt in Suno oder Udio!_`)
    } else if (asset.type === 'qr_code') {
      await sendMessage(chatId, `${emoji} *QR Code*\n\n${asset.content}\n\n_QR Code Generierung kommt bald!_`)
    } else if (asset.type === 'calendar' || asset.type === 'reminder') {
      await sendMessage(chatId, `${emoji} *${asset.title || 'Kalender'}*\n\n${asset.content}\n\n_Kalender-Export kommt bald!_`)
    } else {
      // Standard: Text mit Emoji
      const prefix = asset.title ? `${emoji} *${asset.title}*\n\n` : `${emoji} `

      // Telegram max message length is 4096
      const fullMessage = prefix + asset.content
      if (fullMessage.length > 4000) {
        // Split into multiple messages
        const chunks = asset.content.match(/.{1,3900}/gs) || [asset.content]
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
      await sendMessage(chatId, `💡 _Noch ${remainingCredits} Credits übrig_`)
    }

    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
