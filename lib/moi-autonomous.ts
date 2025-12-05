// ============================================
// MOI AUTONOMOUS - Das autonome Nervensystem
// ============================================
// Proaktiv, vorausschauend, selbstständig

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { sendSMS } from './twilio-deliver'
import { sendEmail } from './email'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ============================================
// 1. AUTO FOLLOW-UP SYSTEM
// ============================================

export interface FollowUp {
  id: string
  user_id: number
  phone: string
  type: 'email' | 'angebot' | 'termin' | 'custom'
  recipient_email?: string
  recipient_name?: string
  original_subject?: string
  original_content?: string
  follow_up_after_hours: number
  follow_up_count: number
  max_follow_ups: number
  status: 'pending' | 'sent' | 'responded' | 'cancelled'
  created_at: string
  next_follow_up_at: string
}

// Follow-Up erstellen
export async function createFollowUp(params: {
  userId: number
  phone: string
  type: 'email' | 'angebot' | 'termin' | 'custom'
  recipientEmail?: string
  recipientName?: string
  subject?: string
  content?: string
  followUpAfterHours?: number
  maxFollowUps?: number
}): Promise<string> {
  const id = `followup_${Date.now()}_${params.userId}`
  const followUpAfterHours = params.followUpAfterHours || 72 // Default: 3 Tage

  try {
    await supabase.from('follow_ups').insert({
      id,
      user_id: params.userId,
      phone: params.phone,
      type: params.type,
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      original_subject: params.subject,
      original_content: params.content,
      follow_up_after_hours: followUpAfterHours,
      follow_up_count: 0,
      max_follow_ups: params.maxFollowUps || 3,
      status: 'pending',
      next_follow_up_at: new Date(Date.now() + followUpAfterHours * 60 * 60 * 1000).toISOString()
    })

    console.log(`📅 Follow-Up erstellt: ${id}`)
    return id
  } catch (e) {
    console.error('Follow-up create error:', e)
    return ''
  }
}

// Fällige Follow-Ups verarbeiten (wird von Cron aufgerufen)
export async function processDueFollowUps(): Promise<number> {
  try {
    const { data: dueFollowUps } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('status', 'pending')
      .lte('next_follow_up_at', new Date().toISOString())
      .limit(50)

    if (!dueFollowUps || dueFollowUps.length === 0) return 0

    let processed = 0

    for (const followUp of dueFollowUps) {
      // User per SMS fragen
      await sendSMS(
        followUp.phone,
        `🔔 Follow-Up Erinnerung!\n\n` +
        `${followUp.recipient_name || followUp.recipient_email} hat noch nicht geantwortet.\n` +
        `Betreff: ${followUp.original_subject}\n\n` +
        `Antwort:\n` +
        `• "Ja" = Follow-Up senden\n` +
        `• "Stop" = Nicht mehr erinnern\n` +
        `• "3d" = In 3 Tagen nochmal`
      )

      // Status auf "awaiting_user" setzen
      await supabase
        .from('follow_ups')
        .update({
          status: 'awaiting_user',
          follow_up_count: followUp.follow_up_count + 1
        })
        .eq('id', followUp.id)

      processed++
    }

    return processed
  } catch (e) {
    console.error('Follow-up processing error:', e)
    return 0
  }
}

// Follow-Up tatsächlich senden
export async function sendFollowUpEmail(followUpId: string): Promise<boolean> {
  try {
    const { data: followUp } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('id', followUpId)
      .single()

    if (!followUp || !followUp.recipient_email) return false

    // AI generiert Follow-Up Text
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Erstelle eine kurze, höfliche Follow-Up E-Mail.

Original-Betreff: ${followUp.original_subject}
Empfänger: ${followUp.recipient_name || 'Kunde'}
Follow-Up Nummer: ${followUp.follow_up_count + 1}

Sei freundlich, nicht aufdringlich. Max 3 Sätze.
Antworte NUR mit dem E-Mail-Text, keine Erklärungen.`
      }]
    })

    const emailText = response.content[0].type === 'text' ? response.content[0].text : ''

    // E-Mail senden
    const result = await sendEmail({
      to: followUp.recipient_email,
      subject: `Re: ${followUp.original_subject}`,
      body: emailText
    })

    if (result.success) {
      // Status updaten
      const nextFollowUp = followUp.follow_up_count + 1 >= followUp.max_follow_ups
        ? 'completed'
        : 'pending'

      await supabase
        .from('follow_ups')
        .update({
          status: nextFollowUp,
          follow_up_count: followUp.follow_up_count + 1,
          next_follow_up_at: new Date(Date.now() + followUp.follow_up_after_hours * 60 * 60 * 1000).toISOString()
        })
        .eq('id', followUpId)

      return true
    }

    return false
  } catch (e) {
    console.error('Follow-up send error:', e)
    return false
  }
}

// ============================================
// 2. SMART SCHEDULING
// ============================================

export interface TimeSlot {
  date: string
  time: string
  available: boolean
}

// Verfügbare Slots vorschlagen
export async function suggestMeetingSlots(
  userId: number,
  durationMinutes: number = 60,
  preferredDays?: string[]
): Promise<TimeSlot[]> {
  // TODO: Integration mit Google Calendar / Outlook
  // Für jetzt: Standard-Business-Zeiten vorschlagen

  const slots: TimeSlot[] = []
  const now = new Date()

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const date = new Date(now)
    date.setDate(date.getDate() + dayOffset)

    // Nur Werktage
    if (date.getDay() === 0 || date.getDay() === 6) continue

    const dateStr = date.toISOString().split('T')[0]

    // Standard-Slots: 9:00, 11:00, 14:00, 16:00
    for (const time of ['09:00', '11:00', '14:00', '16:00']) {
      slots.push({
        date: dateStr,
        time,
        available: true // TODO: Mit echtem Kalender prüfen
      })
    }
  }

  return slots.slice(0, 6) // Max 6 Vorschläge
}

// Termin-Anfrage senden
export async function sendMeetingRequest(params: {
  userId: number
  recipientEmail: string
  recipientName: string
  subject: string
  proposedSlots: TimeSlot[]
  message?: string
}): Promise<boolean> {
  const slotsText = params.proposedSlots
    .map((s, i) => `${i + 1}. ${s.date} um ${s.time}`)
    .join('\n')

  const emailBody = `Hallo ${params.recipientName},

${params.message || 'ich würde gerne einen Termin mit Ihnen vereinbaren.'}

Hier meine Terminvorschläge:
${slotsText}

Welcher Termin passt Ihnen am besten?

Mit freundlichen Grüßen`

  const result = await sendEmail({
    to: params.recipientEmail,
    subject: params.subject,
    body: emailBody
  })

  return result.success
}

// ============================================
// 3. VOICE-TO-CRM
// ============================================

export interface CustomerNote {
  id: string
  user_id: number
  customer_name: string
  customer_email?: string
  customer_phone?: string
  company?: string
  notes: string
  tags: string[]
  deal_value?: number
  deal_status?: 'lead' | 'prospect' | 'negotiation' | 'won' | 'lost'
  next_action?: string
  next_action_date?: string
  created_at: string
  updated_at: string
}

// Kunden-Update speichern
export async function saveCustomerUpdate(
  userId: number,
  rawInput: string
): Promise<CustomerNote | null> {
  // AI extrahiert strukturierte Daten
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Extrahiere Kunden-Informationen aus dem Text.

Antworte NUR mit JSON:
{
  "customer_name": "Name des Kunden/der Firma",
  "company": "Firmenname falls genannt",
  "notes": "Zusammenfassung der Information",
  "tags": ["tag1", "tag2"],
  "deal_value": 5000 oder null,
  "deal_status": "lead|prospect|negotiation|won|lost" oder null,
  "next_action": "Was als nächstes zu tun ist" oder null,
  "next_action_date": "2024-12-10" oder null
}`,
    messages: [{ role: 'user', content: rawInput }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')

    if (!parsed.customer_name) return null

    const noteId = `note_${Date.now()}_${userId}`

    // In DB speichern
    await supabase.from('customer_notes').upsert({
      id: noteId,
      user_id: userId,
      customer_name: parsed.customer_name.toLowerCase(),
      company: parsed.company,
      notes: parsed.notes,
      tags: parsed.tags || [],
      deal_value: parsed.deal_value,
      deal_status: parsed.deal_status,
      next_action: parsed.next_action,
      next_action_date: parsed.next_action_date,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,customer_name'
    })

    console.log(`📋 Kunden-Update gespeichert: ${parsed.customer_name}`)

    return {
      id: noteId,
      user_id: userId,
      ...parsed,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  } catch (e) {
    console.error('CRM save error:', e)
    return null
  }
}

// Kunden-Info abrufen
export async function getCustomerInfo(userId: number, query: string): Promise<CustomerNote | null> {
  try {
    const { data } = await supabase
      .from('customer_notes')
      .select('*')
      .eq('user_id', userId)
      .or(`customer_name.ilike.%${query}%,company.ilike.%${query}%`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    return data
  } catch {
    return null
  }
}

// ============================================
// 4. PREDICTIVE ACTIONS
// ============================================

export interface UserPattern {
  action: string
  day_of_week?: number // 0-6
  time_of_day?: string // "morning" | "afternoon" | "evening"
  frequency: number
  last_occurrence: string
}

// Muster aus User-Aktivitäten erkennen
export async function analyzeUserPatterns(userId: number): Promise<UserPattern[]> {
  try {
    // Letzte 30 Tage Aktivitäten laden
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: activities } = await supabase
      .from('user_activities')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })

    if (!activities || activities.length < 5) return []

    // AI analysiert Muster
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `Analysiere die Aktivitäten und finde wiederkehrende Muster.

Antworte NUR mit JSON Array:
[
  {
    "action": "Wochen-Report senden",
    "day_of_week": 1,
    "time_of_day": "morning",
    "frequency": 4,
    "pattern_description": "Jeden Montag morgens"
  }
]`,
      messages: [{
        role: 'user',
        content: JSON.stringify(activities.slice(0, 100))
      }]
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    try {
      return JSON.parse(responseText.match(/\[[\s\S]*\]/)?.[0] || '[]')
    } catch {
      return []
    }
  } catch (e) {
    console.error('Pattern analysis error:', e)
    return []
  }
}

// Proaktive Vorschläge basierend auf Mustern
export async function getProactiveSuggestions(userId: number): Promise<string[]> {
  const patterns = await analyzeUserPatterns(userId)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const hour = now.getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  const suggestions: string[] = []

  for (const pattern of patterns) {
    if (pattern.day_of_week === dayOfWeek && pattern.time_of_day === timeOfDay) {
      suggestions.push(`Basierend auf deinem Muster: "${pattern.action}"?`)
    }
  }

  return suggestions
}

// ============================================
// 5. SMART MORNING BRIEFING
// ============================================

export interface MorningBriefing {
  greeting: string
  weather?: {
    temp: number
    description: string
  }
  calendar: {
    title: string
    time: string
    notes?: string
  }[]
  followUps: {
    name: string
    daysSince: number
    subject: string
  }[]
  suggestions: string[]
  summary: string
}

// Morning Briefing generieren
export async function generateMorningBriefing(
  userId: number,
  phone: string,
  location?: string
): Promise<MorningBriefing> {
  const now = new Date()
  const hour = now.getHours()

  // Greeting basierend auf Tageszeit
  let greeting = 'Guten Morgen!'
  if (hour >= 12 && hour < 17) greeting = 'Guten Tag!'
  if (hour >= 17) greeting = 'Guten Abend!'

  // Parallele Abfragen
  const [followUps, customerNotes, patterns] = await Promise.all([
    // Offene Follow-Ups
    supabase
      .from('follow_ups')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(5)
      .then(r => r.data || []),

    // Anstehende Aktionen
    supabase
      .from('customer_notes')
      .select('*')
      .eq('user_id', userId)
      .not('next_action', 'is', null)
      .lte('next_action_date', now.toISOString().split('T')[0])
      .limit(5)
      .then(r => r.data || []),

    // Vorschläge basierend auf Mustern
    getProactiveSuggestions(userId)
  ])

  // Follow-Up Liste formatieren
  const followUpList = followUps.map(f => ({
    name: f.recipient_name || f.recipient_email || 'Unbekannt',
    daysSince: Math.floor((now.getTime() - new Date(f.created_at).getTime()) / (1000 * 60 * 60 * 24)),
    subject: f.original_subject || 'Kein Betreff'
  }))

  // Kalender-Einträge (TODO: echte Integration)
  const calendar: MorningBriefing['calendar'] = []

  // Anstehende Aktionen als "Kalender"
  for (const note of customerNotes) {
    if (note.next_action) {
      calendar.push({
        title: `${note.customer_name}: ${note.next_action}`,
        time: 'Heute fällig',
        notes: note.notes
      })
    }
  }

  // Wetter (optional)
  let weather: MorningBriefing['weather'] | undefined
  if (location) {
    try {
      const { getWeather } = await import('./web-search')
      const w = await getWeather(location)
      if (w) {
        weather = { temp: w.temp, description: w.description }
      }
    } catch {
      // Wetter optional
    }
  }

  // Summary generieren
  let summary = ''
  if (followUpList.length > 0) {
    summary += `${followUpList.length} offene Follow-Ups. `
  }
  if (calendar.length > 0) {
    summary += `${calendar.length} Aufgaben heute. `
  }
  if (patterns.length > 0) {
    summary += patterns[0]
  }

  return {
    greeting,
    weather,
    calendar,
    followUps: followUpList,
    suggestions: patterns,
    summary: summary || 'Alles im grünen Bereich!'
  }
}

// Briefing als SMS/Anruf senden
export async function sendMorningBriefing(userId: number, phone: string): Promise<void> {
  const briefing = await generateMorningBriefing(userId, phone, 'Wien')

  let message = `${briefing.greeting}\n\n`

  if (briefing.weather) {
    message += `🌡️ ${briefing.weather.temp}°C, ${briefing.weather.description}\n\n`
  }

  if (briefing.calendar.length > 0) {
    message += `📅 Heute:\n`
    briefing.calendar.slice(0, 3).forEach(c => {
      message += `• ${c.time}: ${c.title}\n`
    })
    message += '\n'
  }

  if (briefing.followUps.length > 0) {
    message += `🔔 Follow-Ups:\n`
    briefing.followUps.slice(0, 3).forEach(f => {
      message += `• ${f.name} (${f.daysSince}d): ${f.subject}\n`
    })
    message += '\n'
  }

  if (briefing.suggestions.length > 0) {
    message += `💡 ${briefing.suggestions[0]}\n`
  }

  await sendSMS(phone, message)
}

// ============================================
// 6. DEAL INTELLIGENCE
// ============================================

export interface DealSuggestion {
  suggestedPrice: number
  reasoning: string
  negotiationTips: string[]
  similarDeals: {
    customer: string
    value: number
    outcome: 'won' | 'lost'
  }[]
}

// Deal-Analyse und Preisvorschlag
export async function analyzeDeal(
  userId: number,
  dealDescription: string,
  proposedValue?: number
): Promise<DealSuggestion> {
  // Ähnliche vergangene Deals laden
  const { data: pastDeals } = await supabase
    .from('customer_notes')
    .select('*')
    .eq('user_id', userId)
    .not('deal_value', 'is', null)
    .in('deal_status', ['won', 'lost'])
    .limit(20)

  // AI analysiert
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Du bist ein Sales-Berater. Analysiere den Deal und gib Empfehlungen.

VERGANGENE DEALS DES USERS:
${JSON.stringify(pastDeals || [], null, 2)}

Antworte NUR mit JSON:
{
  "suggestedPrice": 5500,
  "reasoning": "Begründung für den Preis",
  "negotiationTips": ["Tipp 1", "Tipp 2", "Tipp 3"],
  "similarDeals": [{"customer": "Name", "value": 5000, "outcome": "won"}]
}`,
    messages: [{
      role: 'user',
      content: `Deal: ${dealDescription}\nVorgeschlagener Preis: ${proposedValue || 'nicht angegeben'}`
    }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    return JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')
  } catch {
    return {
      suggestedPrice: proposedValue || 0,
      reasoning: 'Keine Analyse möglich',
      negotiationTips: [],
      similarDeals: []
    }
  }
}

// ============================================
// 7. AUTO-PILOT MODE
// ============================================

export interface AutoPilotConfig {
  enabled: boolean
  allowedActions: ('respond_email' | 'create_quote' | 'schedule_meeting' | 'send_reminder')[]
  requireApproval: boolean
  maxValueWithoutApproval: number
  notifyOnAction: boolean
}

// Auto-Pilot Aktion ausführen
export async function executeAutoPilotAction(
  userId: number,
  phone: string,
  trigger: {
    type: 'incoming_email' | 'missed_call' | 'form_submission'
    from: string
    subject?: string
    content: string
  },
  config: AutoPilotConfig
): Promise<{executed: boolean; action: string; result?: string}> {
  if (!config.enabled) {
    return { executed: false, action: 'none' }
  }

  // AI entscheidet über Aktion
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Du bist MOI im Auto-Pilot Modus. Entscheide welche Aktion passend ist.

ERLAUBTE AKTIONEN: ${config.allowedActions.join(', ')}
MAX WERT OHNE GENEHMIGUNG: ${config.maxValueWithoutApproval}€

Antworte NUR mit JSON:
{
  "action": "respond_email|create_quote|schedule_meeting|send_reminder|none",
  "response_content": "Inhalt der Antwort",
  "estimated_value": 0,
  "needs_approval": true/false,
  "reasoning": "Warum diese Aktion"
}`,
    messages: [{
      role: 'user',
      content: `Trigger: ${trigger.type}
Von: ${trigger.from}
Betreff: ${trigger.subject || 'Kein Betreff'}
Inhalt: ${trigger.content}`
    }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const decision = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')

    if (decision.action === 'none') {
      return { executed: false, action: 'none' }
    }

    // Genehmigung nötig?
    if (config.requireApproval || decision.needs_approval) {
      await sendSMS(phone,
        `🤖 Auto-Pilot Anfrage:\n\n` +
        `${trigger.type} von ${trigger.from}\n` +
        `Vorgeschlagene Aktion: ${decision.action}\n\n` +
        `"${decision.response_content?.substring(0, 100)}..."\n\n` +
        `Antwort: "Ja" oder "Nein"`
      )
      return { executed: false, action: decision.action, result: 'awaiting_approval' }
    }

    // Aktion ausführen
    if (decision.action === 'respond_email' && trigger.from.includes('@')) {
      await sendEmail({
        to: trigger.from,
        subject: `Re: ${trigger.subject}`,
        body: decision.response_content
      })

      if (config.notifyOnAction) {
        await sendSMS(phone, `✅ Auto-Pilot: E-Mail an ${trigger.from} gesendet`)
      }

      return { executed: true, action: decision.action, result: 'email_sent' }
    }

    return { executed: false, action: decision.action }
  } catch (e) {
    console.error('Auto-pilot error:', e)
    return { executed: false, action: 'error' }
  }
}

// ============================================
// 8. MULTI-CHANNEL SYNC
// ============================================

export interface ConversationThread {
  id: string
  user_id: number
  contact_identifier: string // E-Mail oder Telefon
  contact_name?: string
  messages: {
    channel: 'email' | 'sms' | 'whatsapp' | 'telegram' | 'voice'
    direction: 'in' | 'out'
    content: string
    timestamp: string
  }[]
  last_activity: string
  summary?: string
}

// Nachricht zu Thread hinzufügen
export async function addToConversationThread(
  userId: number,
  channel: 'email' | 'sms' | 'whatsapp' | 'telegram' | 'voice',
  contactIdentifier: string,
  direction: 'in' | 'out',
  content: string
): Promise<void> {
  try {
    // Existierenden Thread suchen oder neuen erstellen
    const { data: existing } = await supabase
      .from('conversation_threads')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_identifier', contactIdentifier)
      .single()

    const message = {
      channel,
      direction,
      content,
      timestamp: new Date().toISOString()
    }

    if (existing) {
      // Nachricht anhängen
      const messages = [...(existing.messages || []), message]
      await supabase
        .from('conversation_threads')
        .update({
          messages,
          last_activity: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      // Neuen Thread erstellen
      await supabase.from('conversation_threads').insert({
        id: `thread_${Date.now()}_${userId}`,
        user_id: userId,
        contact_identifier: contactIdentifier,
        messages: [message],
        last_activity: new Date().toISOString()
      })
    }
  } catch (e) {
    console.error('Thread sync error:', e)
  }
}

// Konversations-Kontext abrufen
export async function getConversationContext(
  userId: number,
  contactIdentifier: string
): Promise<string> {
  try {
    const { data: thread } = await supabase
      .from('conversation_threads')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_identifier', contactIdentifier)
      .single()

    if (!thread || !thread.messages || thread.messages.length === 0) {
      return ''
    }

    // Letzte 10 Nachrichten als Kontext
    const recentMessages = thread.messages.slice(-10)
    return recentMessages
      .map((m: any) => `[${m.channel}/${m.direction}]: ${m.content}`)
      .join('\n')
  } catch {
    return ''
  }
}

// ============================================
// 9. MOI-TO-MOI COMMUNICATION (Future)
// ============================================

// Placeholder für zukünftige MOI-Netzwerk Funktionen
export interface MoiNetworkMessage {
  from_moi_id: string
  to_moi_id: string
  type: 'schedule_request' | 'info_request' | 'action_request'
  payload: any
  response?: any
  status: 'pending' | 'accepted' | 'rejected'
}

// ============================================
// 10. TASK TRACKING - Erledigte Aufträge erkennen
// ============================================

export interface TaskRecord {
  id: string
  user_id: number
  task_type: 'email' | 'angebot' | 'termin' | 'website' | 'reminder' | 'sms' | 'research' | 'other'
  recipient?: string
  subject?: string
  content_hash: string  // Hash für Duplikat-Erkennung
  status: 'completed' | 'failed' | 'pending'
  result_summary?: string
  created_at: string
}

// Hash für Auftrags-Vergleich erstellen
function createTaskHash(type: string, recipient: string, keywords: string[]): string {
  const normalized = `${type}|${recipient.toLowerCase()}|${keywords.sort().join('|')}`
  // Simple hash
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `hash_${Math.abs(hash).toString(16)}`
}

// Keywords aus Anfrage extrahieren
async function extractTaskKeywords(text: string): Promise<{
  type: string
  recipient: string
  keywords: string[]
}> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: `Extrahiere Task-Informationen aus dem Text.
Antworte NUR mit JSON:
{
  "type": "email|angebot|termin|website|reminder|sms|research|other",
  "recipient": "Name oder Email der Person",
  "keywords": ["wichtigste", "begriffe", "max 5"]
}`,
    messages: [{ role: 'user', content: text }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    return JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')
  } catch {
    return { type: 'other', recipient: '', keywords: [] }
  }
}

// Prüfen ob ähnlicher Auftrag schon erledigt wurde
export async function checkForDuplicateTask(
  userId: number,
  taskText: string,
  hoursBack: number = 24
): Promise<{
  isDuplicate: boolean
  existingTask?: TaskRecord
  similarity: number
  message?: string
}> {
  try {
    // Keywords extrahieren
    const { type, recipient, keywords } = await extractTaskKeywords(taskText)
    const taskHash = createTaskHash(type, recipient, keywords)

    // Zeitfenster
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

    // Exakten Hash suchen
    const { data: exactMatch } = await supabase
      .from('task_records')
      .select('*')
      .eq('user_id', userId)
      .eq('content_hash', taskHash)
      .eq('status', 'completed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)

    if (exactMatch && exactMatch.length > 0) {
      return {
        isDuplicate: true,
        existingTask: exactMatch[0],
        similarity: 100,
        message: `Dieser Auftrag wurde bereits erledigt (${formatTimeAgo(exactMatch[0].created_at)})`
      }
    }

    // Ähnliche Aufträge suchen (gleicher Typ + Empfänger)
    const { data: similarTasks } = await supabase
      .from('task_records')
      .select('*')
      .eq('user_id', userId)
      .eq('task_type', type)
      .eq('status', 'completed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10)

    if (similarTasks && similarTasks.length > 0) {
      // Empfänger vergleichen
      for (const task of similarTasks) {
        if (task.recipient && recipient) {
          const recipientMatch = task.recipient.toLowerCase().includes(recipient.toLowerCase()) ||
                                  recipient.toLowerCase().includes(task.recipient.toLowerCase())
          if (recipientMatch) {
            return {
              isDuplicate: true,
              existingTask: task,
              similarity: 85,
              message: `Ähnlicher Auftrag für "${task.recipient}" bereits erledigt (${formatTimeAgo(task.created_at)}): ${task.result_summary}`
            }
          }
        }
      }
    }

    return { isDuplicate: false, similarity: 0 }
  } catch (e) {
    console.error('Duplicate check error:', e)
    return { isDuplicate: false, similarity: 0 }
  }
}

// Hilfsfunktion für Zeitanzeige
function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `vor ${minutes} Minuten`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Stunden`
  return `vor ${Math.floor(hours / 24)} Tagen`
}

// Erledigten Auftrag speichern
export async function recordCompletedTask(params: {
  userId: number
  type: 'email' | 'angebot' | 'termin' | 'website' | 'reminder' | 'sms' | 'research' | 'other'
  recipient?: string
  subject?: string
  originalText: string
  resultSummary: string
  status?: 'completed' | 'failed'
}): Promise<string> {
  try {
    const { type, recipient, keywords } = await extractTaskKeywords(params.originalText)
    const taskHash = createTaskHash(type, recipient || params.recipient || '', keywords)
    const taskId = `task_${Date.now()}_${params.userId}`

    await supabase.from('task_records').insert({
      id: taskId,
      user_id: params.userId,
      task_type: params.type,
      recipient: params.recipient || recipient,
      subject: params.subject,
      content_hash: taskHash,
      status: params.status || 'completed',
      result_summary: params.resultSummary,
      created_at: new Date().toISOString()
    })

    console.log(`✅ Task recorded: ${taskId} (${params.type})`)
    return taskId
  } catch (e) {
    console.error('Task record error:', e)
    return ''
  }
}

// Auftrags-Historie für User abrufen
export async function getRecentTasks(
  userId: number,
  limit: number = 10
): Promise<TaskRecord[]> {
  try {
    const { data } = await supabase
      .from('task_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    return data || []
  } catch {
    return []
  }
}

// Status eines bestimmten Auftrags prüfen
export async function getTaskStatus(
  userId: number,
  query: string
): Promise<TaskRecord | null> {
  try {
    // Suche nach Empfänger oder Subject
    const { data } = await supabase
      .from('task_records')
      .select('*')
      .eq('user_id', userId)
      .or(`recipient.ilike.%${query}%,subject.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(1)

    return data?.[0] || null
  } catch {
    return null
  }
}

// ============================================
// 11. COLLECTIVE INTELLIGENCE (Future)
// ============================================

// Anonymisierte Insights speichern
export async function contributeAnonymousInsight(
  category: 'pricing' | 'followup' | 'conversion' | 'timing',
  insight: {
    action: string
    outcome: 'success' | 'failure'
    value?: number
    metadata?: any
  }
): Promise<void> {
  try {
    await supabase.from('collective_insights').insert({
      category,
      action: insight.action,
      outcome: insight.outcome,
      value: insight.value,
      metadata: insight.metadata,
      created_at: new Date().toISOString()
    })
  } catch (e) {
    console.error('Insight contribution error:', e)
  }
}

// Beste Praktiken abrufen
export async function getBestPractices(
  category: 'pricing' | 'followup' | 'conversion' | 'timing'
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('collective_insights')
      .select('*')
      .eq('category', category)
      .eq('outcome', 'success')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!data || data.length < 10) return []

    // AI analysiert und extrahiert Best Practices
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Analysiere diese erfolgreichen Aktionen und extrahiere 3-5 Best Practices:\n${JSON.stringify(data)}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return text.split('\n').filter(line => line.trim().length > 0).slice(0, 5)
  } catch {
    return []
  }
}
