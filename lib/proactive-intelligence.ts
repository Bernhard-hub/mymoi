// ============================================
// PROACTIVE INTELLIGENCE - MOI denkt voraus!
// ============================================
// Nicht nur reagieren, sondern antizipieren
// Smart Greetings, Predictions, Context Memory

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY || '').trim()
})

// ============================================
// 1. SMART GREETINGS - Personalisierte Begrüßung
// ============================================

export interface UserContext {
  userId: number
  phone: string
  name?: string
  timezone?: string
  recentTasks?: any[]
  pendingFollowUps?: any[]
  currentProjects?: string[]
  lastInteraction?: Date
  totalInteractions?: number
  preferredLanguage?: string
}

export async function generateSmartGreeting(context: UserContext): Promise<string> {
  const hour = new Date().getHours()
  const dayOfWeek = new Date().getDay()

  // Zeit-basierte Begrüßung
  const timeGreeting = hour < 12 ? 'Guten Morgen'
    : hour < 18 ? 'Hallo'
    : hour < 21 ? 'Guten Abend'
    : 'Hey'

  // Wochenend-Erkennung
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  // Personalisierung basierend auf History
  const personalTouch = await getPersonalTouch(context)

  // Proaktive Vorschläge
  const suggestions = await getProactiveSuggestions(context)

  let greeting = `${timeGreeting}!`

  // Name hinzufügen wenn bekannt
  if (context.name) {
    greeting = `${timeGreeting}, ${context.name}!`
  }

  // Personal Touch
  if (personalTouch) {
    greeting += ` ${personalTouch}`
  }

  // Wochenend-Touch
  if (isWeekend && !personalTouch) {
    greeting += ' Schönes Wochenende!'
  }

  // Proaktive Vorschläge
  if (suggestions.length > 0) {
    greeting += ` ${suggestions[0]}`
  }

  return greeting
}

async function getPersonalTouch(context: UserContext): Promise<string | null> {
  // Erster Anruf des Tages?
  if (context.lastInteraction) {
    const lastDate = new Date(context.lastInteraction).toDateString()
    const today = new Date().toDateString()

    if (lastDate !== today) {
      // Erster Anruf heute
      if (context.pendingFollowUps && context.pendingFollowUps.length > 0) {
        return `Du hast ${context.pendingFollowUps.length} offene Follow-ups.`
      }
    }
  }

  // Milestone erreicht?
  if (context.totalInteractions === 10) {
    return 'Wow, schon 10 Aufträge mit MOI!'
  }
  if (context.totalInteractions === 50) {
    return 'Du bist ein Power-User - 50 Aufträge!'
  }
  if (context.totalInteractions === 100) {
    return 'Unglaublich - 100 Aufträge! Du und MOI sind ein starkes Team.'
  }

  // Lange nicht mehr gehört?
  if (context.lastInteraction) {
    const daysSince = Math.floor((Date.now() - new Date(context.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince > 7) {
      return 'Schön, wieder von dir zu hören!'
    }
  }

  return null
}

async function getProactiveSuggestions(context: UserContext): Promise<string[]> {
  const suggestions: string[] = []

  // Offene Follow-ups?
  if (context.pendingFollowUps && context.pendingFollowUps.length > 0) {
    const urgent = context.pendingFollowUps.find(f => {
      const nextUp = new Date(f.next_follow_up_at)
      return nextUp <= new Date()
    })

    if (urgent) {
      suggestions.push(`Soll ich ${urgent.recipient_name || urgent.recipient_email} nachfassen?`)
    }
  }

  // Aktive Projekte?
  if (context.currentProjects && context.currentProjects.length > 0) {
    suggestions.push(`Arbeitest du weiter an "${context.currentProjects[0]}"?`)
  }

  return suggestions
}

// ============================================
// 2. PREDICTIVE ACTIONS - Was willst du als nächstes?
// ============================================

export interface PredictedAction {
  type: 'email' | 'followup' | 'presentation' | 'website' | 'calendar' | 'research'
  confidence: number // 0-100
  suggestion: string
  context?: string
}

export async function predictNextAction(context: UserContext): Promise<PredictedAction[]> {
  const predictions: PredictedAction[] = []

  // Muster aus letzten Tasks analysieren
  if (context.recentTasks && context.recentTasks.length >= 3) {
    const taskTypes = context.recentTasks.map(t => t.task_type)
    const mostCommon = getMostCommon(taskTypes)

    if (mostCommon) {
      predictions.push({
        type: mostCommon as any,
        confidence: 70,
        suggestion: `Noch eine ${formatTaskType(mostCommon)}?`
      })
    }

    // Sequenz-Erkennung: Email → Follow-up?
    const lastTask = context.recentTasks[0]
    if (lastTask?.task_type === 'email') {
      predictions.push({
        type: 'followup',
        confidence: 80,
        suggestion: `Soll ich ein Follow-up für ${lastTask.recipient} einrichten?`,
        context: lastTask.subject
      })
    }

    // Angebot gesendet → Nachfassen?
    if (lastTask?.subject?.toLowerCase().includes('angebot')) {
      predictions.push({
        type: 'followup',
        confidence: 90,
        suggestion: 'Soll ich in 3 Tagen automatisch nachfassen?',
        context: lastTask.recipient
      })
    }
  }

  // Tageszeit-basierte Predictions
  const hour = new Date().getHours()

  // Morgens: E-Mails checken?
  if (hour >= 7 && hour <= 9) {
    predictions.push({
      type: 'email',
      confidence: 60,
      suggestion: 'Soll ich deine E-Mails vorlesen?'
    })
  }

  // Vormittags: Kalender?
  if (hour >= 9 && hour <= 11) {
    predictions.push({
      type: 'calendar',
      confidence: 50,
      suggestion: 'Was steht heute an?'
    })
  }

  return predictions.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}

function getMostCommon(arr: string[]): string | null {
  if (arr.length === 0) return null

  const counts: Record<string, number> = {}
  arr.forEach(item => {
    counts[item] = (counts[item] || 0) + 1
  })

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null
}

function formatTaskType(type: string): string {
  const labels: Record<string, string> = {
    'email': 'E-Mail',
    'presentation': 'Präsentation',
    'website': 'Website',
    'sms': 'Nachricht',
    'research': 'Recherche',
    'other': 'Aufgabe'
  }
  return labels[type] || type
}

// ============================================
// 3. CONTEXT MEMORY - Laufende Projekte merken
// ============================================

export interface ProjectContext {
  id: string
  userId: number
  name: string
  description?: string
  status: 'active' | 'paused' | 'completed'
  lastMentioned: Date
  relatedTasks: string[]
  keywords: string[]
}

export async function detectProjectFromText(
  userId: number,
  text: string
): Promise<ProjectContext | null> {
  try {
    // Bekannte Projekte laden
    const { data: projects } = await supabase
      .from('user_projects')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('last_mentioned', { ascending: false })
      .limit(10)

    if (!projects || projects.length === 0) return null

    // Text mit Projekt-Keywords matchen
    const textLower = text.toLowerCase()

    for (const project of projects) {
      const keywords = project.keywords || []
      const hasMatch = keywords.some((k: string) => textLower.includes(k.toLowerCase()))

      if (hasMatch || textLower.includes(project.name.toLowerCase())) {
        // Projekt gefunden! Last mentioned updaten
        await supabase
          .from('user_projects')
          .update({ last_mentioned: new Date().toISOString() })
          .eq('id', project.id)

        return project as ProjectContext
      }
    }

    return null
  } catch {
    return null
  }
}

export async function createOrUpdateProject(
  userId: number,
  text: string
): Promise<ProjectContext | null> {
  // AI extrahiert Projekt-Info
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: `Extrahiere Projekt-Informationen. Antworte NUR mit JSON:
{
  "isProject": true/false,
  "name": "Projektname",
  "keywords": ["keyword1", "keyword2"]
}

Erkenne Projekte wie:
- "Für das Website-Projekt..." → name: "Website-Projekt"
- "Die Müller-Präsentation..." → name: "Müller-Präsentation"
- "Das neue Feature..." → name: "Neues Feature"`,
    messages: [{ role: 'user', content: text }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')

    if (parsed.isProject && parsed.name) {
      // Projekt erstellen/updaten
      const id = `proj_${userId}_${Date.now()}`

      await supabase.from('user_projects').upsert({
        id,
        user_id: userId,
        name: parsed.name,
        keywords: parsed.keywords || [],
        status: 'active',
        last_mentioned: new Date().toISOString()
      }, {
        onConflict: 'id'
      })

      return {
        id,
        userId,
        name: parsed.name,
        status: 'active',
        lastMentioned: new Date(),
        relatedTasks: [],
        keywords: parsed.keywords || []
      }
    }

    return null
  } catch {
    return null
  }
}

// ============================================
// 4. INTELLIGENT REMINDERS - Smarte Erinnerungen
// ============================================

export interface SmartReminder {
  id: string
  userId: number
  type: 'followup' | 'deadline' | 'meeting' | 'custom'
  message: string
  triggerAt: Date
  phone: string
  context?: string
  delivered: boolean
}

export async function extractReminder(
  userId: number,
  phone: string,
  text: string
): Promise<SmartReminder | null> {
  // AI erkennt Erinnerungen
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: `Extrahiere Erinnerungen aus dem Text. Heutiges Datum: ${new Date().toISOString()}

Antworte NUR mit JSON:
{
  "hasReminder": true/false,
  "type": "followup|deadline|meeting|custom",
  "message": "Erinnerungstext",
  "when": "2024-12-15T09:00:00"
}

Beispiele:
- "Erinnere mich morgen um 9" → when: morgen 9:00
- "In 3 Tagen nachfassen" → when: +3 Tage
- "Am Freitag Meeting" → when: nächster Freitag`,
    messages: [{ role: 'user', content: text }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')

    if (parsed.hasReminder && parsed.when) {
      const reminder: SmartReminder = {
        id: `rem_${userId}_${Date.now()}`,
        userId,
        type: parsed.type || 'custom',
        message: parsed.message || text,
        triggerAt: new Date(parsed.when),
        phone,
        delivered: false
      }

      // In DB speichern
      await supabase.from('smart_reminders').insert({
        id: reminder.id,
        user_id: userId,
        type: reminder.type,
        message: reminder.message,
        trigger_at: reminder.triggerAt.toISOString(),
        phone: reminder.phone,
        delivered: false
      })

      return reminder
    }

    return null
  } catch {
    return null
  }
}

export async function getDueReminders(): Promise<SmartReminder[]> {
  try {
    const now = new Date().toISOString()

    const { data } = await supabase
      .from('smart_reminders')
      .select('*')
      .eq('delivered', false)
      .lte('trigger_at', now)
      .order('trigger_at')
      .limit(50)

    return (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      message: r.message,
      triggerAt: new Date(r.trigger_at),
      phone: r.phone,
      context: r.context,
      delivered: r.delivered
    }))
  } catch {
    return []
  }
}

export async function markReminderDelivered(id: string): Promise<void> {
  await supabase
    .from('smart_reminders')
    .update({ delivered: true })
    .eq('id', id)
}

// ============================================
// 5. USER CONTEXT BUILDER - Alles zusammenführen
// ============================================

export async function buildUserContext(
  phone: string,
  userId: number
): Promise<UserContext> {
  const context: UserContext = {
    userId,
    phone
  }

  try {
    // Letzte Interaktionen
    const { data: interactions } = await supabase
      .from('voice_interactions')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(10)

    if (interactions && interactions.length > 0) {
      context.lastInteraction = new Date(interactions[0].created_at)
      context.totalInteractions = interactions.length
    }

    // Letzte Tasks
    const { data: tasks } = await supabase
      .from('task_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (tasks) {
      context.recentTasks = tasks
    }

    // Pending Follow-ups
    const { data: followups } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('next_follow_up_at')
      .limit(5)

    if (followups) {
      context.pendingFollowUps = followups
    }

    // Aktive Projekte
    const { data: projects } = await supabase
      .from('user_projects')
      .select('name')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('last_mentioned', { ascending: false })
      .limit(3)

    if (projects) {
      context.currentProjects = projects.map(p => p.name)
    }

    // User-Name (aus Notizen lernen)
    const { data: userData } = await supabase
      .from('user_knowledge')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'name')
      .single()

    if (userData) {
      context.name = userData.value
    }

  } catch (e) {
    console.log('Context build partial:', e)
  }

  return context
}

// ============================================
// 6. PROACTIVE VOICE GREETING - Bei Anruf-Start
// ============================================

export async function getProactiveVoiceGreeting(
  phone: string,
  userId: number
): Promise<string> {
  const context = await buildUserContext(phone, userId)
  const greeting = await generateSmartGreeting(context)
  const predictions = await predictNextAction(context)

  let voiceGreeting = greeting

  // Beste Prediction hinzufügen
  if (predictions.length > 0 && predictions[0].confidence >= 60) {
    voiceGreeting += ` ${predictions[0].suggestion}`
  }

  // Standard-Aufforderung
  voiceGreeting += ' Oder sag mir einfach, was du brauchst.'

  return voiceGreeting
}

// ============================================
// 7. CONVERSATION CONTINUITY - Gespräch fortsetzen
// ============================================

export async function detectConversationContinuation(
  userId: number,
  text: string
): Promise<{ isContinuation: boolean; context?: string; lastTopic?: string }> {
  const continuationMarkers = [
    'außerdem', 'und noch', 'noch was', 'ach ja', 'hab ich vergessen',
    'da war noch', 'zusätzlich', 'auch noch', 'weiter', 'mehr',
    'das gleiche', 'nochmal', 'wieder', 'genauso', 'ähnlich'
  ]

  const textLower = text.toLowerCase()
  const hasContinuationMarker = continuationMarkers.some(m => textLower.includes(m))

  if (hasContinuationMarker) {
    // Letzte Interaktion holen
    const { data: lastInteraction } = await supabase
      .from('voice_interactions')
      .select('*')
      .eq('phone', (await supabase.from('voice_users').select('phone').eq('user_id', userId).single()).data?.phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (lastInteraction) {
      return {
        isContinuation: true,
        context: lastInteraction.transcript,
        lastTopic: lastInteraction.asset_title
      }
    }
  }

  return { isContinuation: false }
}
