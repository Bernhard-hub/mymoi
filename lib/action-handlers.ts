// ============================================
// ACTION HANDLERS - Alle Aktionen die MOI kann
// ============================================

import { ActionType } from './chain-actions'
import { generateAsset } from './ai-engine'
import { createPDF } from './pdf'
import { createPresentation } from './pptx'
import { createICS, parseCalendarFromAI } from './ics'
import { sendEmail } from './email'
import { searchYouTube, searchWeb, getWeather, getNews } from './web-search'
import { saveAsset, addToHistory } from './supabase'

interface ActionContext {
  userId: number
  chatId: number
  userName?: string
}

// ============================================
// CREATE DOCUMENT - PDF, PPTX, etc.
// ============================================
async function handleCreateDocument(params: any, ctx: ActionContext) {
  const { docType, content, recipient, amount, title } = params

  // Content generieren wenn nicht vorhanden
  let documentContent = content
  if (!documentContent) {
    const prompt = buildDocumentPrompt(docType, { recipient, amount, title })
    const asset = await generateAsset(prompt)
    documentContent = asset.content

    // In DB speichern
    await saveAsset(ctx.userId, docType || 'document', asset.title || title || 'Dokument', documentContent)
  }

  // Dokument erstellen
  if (docType === 'presentation' || docType === 'pptx') {
    try {
      const slides = JSON.parse(documentContent)
      const buffer = await createPresentation(slides, title || 'Präsentation')
      return { type: 'pptx', buffer, title: title || 'Präsentation', content: documentContent }
    } catch {
      // Fallback zu PDF
    }
  }

  // PDF erstellen
  const buffer = await createPDF(title || 'Dokument', documentContent)
  return { type: 'pdf', buffer, title: title || 'Dokument', content: documentContent }
}

function buildDocumentPrompt(docType: string, params: any): string {
  switch (docType) {
    case 'angebot':
      return `Erstelle ein professionelles Angebot für ${params.recipient || 'den Kunden'} über ${params.amount ? params.amount + '€' : 'die besprochenen Leistungen'}. Formatiere es als formelles Geschäftsdokument.`
    case 'rechnung':
      return `Erstelle eine Rechnung für ${params.recipient || 'den Kunden'} über ${params.amount ? params.amount + '€' : 'die erbrachten Leistungen'}.`
    case 'vertrag':
      return `Erstelle einen Vertragsentwurf für ${params.recipient || 'die Vertragsparteien'}.`
    default:
      return params.content || `Erstelle ein Dokument: ${JSON.stringify(params)}`
  }
}

// ============================================
// SEND EMAIL
// ============================================
async function handleSendEmail(params: any, ctx: ActionContext) {
  const { to, subject, body, attachDocument, dependencyResult } = params

  let emailBody = body
  let attachments: any[] = []

  // Wenn wir ein Dokument anhängen sollen
  if (attachDocument && dependencyResult) {
    const { buffer, title, type } = dependencyResult
    attachments.push({
      filename: `${title.replace(/[^a-zA-Z0-9]/g, '_')}.${type}`,
      content: buffer
    })

    if (!emailBody) {
      emailBody = `Anbei erhalten Sie ${title}.\n\nMit freundlichen Grüßen`
    }
  }

  // E-Mail generieren wenn kein Body
  if (!emailBody) {
    const asset = await generateAsset(`Schreibe eine kurze, professionelle E-Mail zum Thema: ${subject}`)
    emailBody = asset.content
  }

  const result = await sendEmail({
    to: to || 'test@example.com', // TODO: Aus Kontakten laden
    subject: subject || 'Nachricht von MOI',
    body: emailBody,
    attachments
  })

  await addToHistory(ctx.userId, 'assistant', `E-Mail gesendet an ${to}: ${subject}`)

  return result
}

// ============================================
// CREATE CALENDAR
// ============================================
async function handleCreateCalendar(params: any, ctx: ActionContext) {
  const { title, date, time, duration, location, description } = params

  // Datum parsen
  let eventDate = date
  if (date === 'morgen' || date === 'tomorrow') {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    eventDate = tomorrow.toISOString().split('T')[0]
  } else if (date === 'heute' || date === 'today') {
    eventDate = new Date().toISOString().split('T')[0]
  }

  const events = [{
    title: title || 'Event',
    date: eventDate || new Date().toISOString().split('T')[0],
    time: time || '10:00',
    duration: duration || '1h',
    location,
    description
  }]

  const icsContent = createICS(events)
  const buffer = Buffer.from(icsContent, 'utf-8')

  await saveAsset(ctx.userId, 'calendar', title || 'Event', JSON.stringify(events))
  await addToHistory(ctx.userId, 'assistant', `Kalender-Event erstellt: ${title}`)

  return { type: 'ics', buffer, events }
}

// ============================================
// SEND WHATSAPP (Link)
// ============================================
async function handleSendWhatsapp(params: any, ctx: ActionContext) {
  const { phone, message } = params

  // WhatsApp Link generieren
  const cleanPhone = phone?.replace(/\D/g, '') || ''
  const encodedMessage = encodeURIComponent(message || '')
  const waLink = `https://wa.me/${cleanPhone}?text=${encodedMessage}`

  return { type: 'whatsapp_link', link: waLink, phone: cleanPhone, message }
}

// ============================================
// CREATE REMINDER
// ============================================
async function handleCreateReminder(params: any, ctx: ActionContext) {
  const { message, datetime } = params

  // TODO: Reminder in DB speichern und Scheduled Job erstellen
  // Für jetzt: Kalender-Event erstellen
  return handleCreateCalendar({
    title: `⏰ ${message}`,
    date: datetime?.split('T')[0] || new Date().toISOString().split('T')[0],
    time: datetime?.split('T')[1]?.substring(0, 5) || '09:00',
    duration: '15m'
  }, ctx)
}

// ============================================
// SEARCH WEB
// ============================================
async function handleSearchWeb(params: any, ctx: ActionContext) {
  const { query } = params
  const results = await searchWeb(query)
  return { type: 'web_results', results }
}

// ============================================
// SEARCH YOUTUBE
// ============================================
async function handleSearchYoutube(params: any, ctx: ActionContext) {
  const { query } = params
  const results = await searchYouTube(query)
  return { type: 'youtube_results', results }
}

// ============================================
// GET WEATHER
// ============================================
async function handleGetWeather(params: any, ctx: ActionContext) {
  const { city } = params
  const weather = await getWeather(city || 'Berlin')
  return { type: 'weather', weather }
}

// ============================================
// CREATE ASSET (Default)
// ============================================
async function handleCreateAsset(params: any, ctx: ActionContext) {
  const { content } = params
  const asset = await generateAsset(content)

  await saveAsset(ctx.userId, asset.type, asset.title || 'Asset', asset.content)
  await addToHistory(ctx.userId, 'assistant', `Asset erstellt: ${asset.title}`)

  return { type: 'asset', asset }
}

// ============================================
// SAVE CONTACT
// ============================================
async function handleSaveContact(params: any, ctx: ActionContext) {
  const { name, phone, email } = params

  // TODO: In Supabase contacts Tabelle speichern
  return { type: 'contact', name, phone, email, saved: true }
}

// ============================================
// EXPORT ALL HANDLERS
// ============================================
export const actionHandlers: Record<ActionType, (params: any, ctx: ActionContext) => Promise<any>> = {
  create_document: handleCreateDocument,
  send_email: handleSendEmail,
  create_calendar: handleCreateCalendar,
  send_whatsapp: handleSendWhatsapp,
  save_contact: handleSaveContact,
  create_reminder: handleCreateReminder,
  search_web: handleSearchWeb,
  search_youtube: handleSearchYoutube,
  get_weather: handleGetWeather,
  create_asset: handleCreateAsset
}
