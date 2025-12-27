// ============================================
// CHAIN ACTIONS - Das Herzstück von MOI 2.0
// Ein Satz. Mehrere Aktionen. Alles erledigt.
// ============================================

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY || '').replace(/\\n/g, '').trim(),
})

// Alle möglichen Aktionen die MOI ausführen kann
export type ActionType =
  | 'create_document'    // PDF, PPTX, etc.
  | 'send_email'         // E-Mail versenden
  | 'create_calendar'    // Kalender-Event
  | 'send_whatsapp'      // WhatsApp Nachricht
  | 'save_contact'       // Kontakt speichern
  | 'create_reminder'    // Erinnerung setzen
  | 'search_web'         // Web-Suche
  | 'search_youtube'     // YouTube-Suche
  | 'get_weather'        // Wetter abrufen
  | 'create_asset'       // Standard Asset erstellen

export interface ChainAction {
  type: ActionType
  priority: number       // Reihenfolge der Ausführung
  params: Record<string, any>
  dependsOn?: number     // Wartet auf Ergebnis von Action #X
}

export interface ChainPlan {
  summary: string        // Was der User will (kurz)
  actions: ChainAction[]
  finalMessage: string   // Was MOI am Ende sagt
}

// ============================================
// AI CHAIN PARSER - Erkennt alle Aktionen
// ============================================

const CHAIN_PARSER_PROMPT = `Du bist der Chain Action Parser von MOI.

Deine Aufgabe: Analysiere die User-Nachricht und extrahiere ALLE Aktionen die ausgeführt werden sollen.

MÖGLICHE AKTIONEN:
- create_document: PDF, Präsentation, Dokument erstellen
- send_email: E-Mail versenden (braucht: to, subject, body)
- create_calendar: Termin erstellen (braucht: title, date, time)
- send_whatsapp: WhatsApp senden (braucht: phone, message)
- save_contact: Kontakt speichern (braucht: name, phone/email)
- create_reminder: Erinnerung (braucht: message, datetime)
- search_web: Web-Suche
- search_youtube: YouTube-Suche
- get_weather: Wetter abrufen
- create_asset: Allgemeines Asset erstellen

ERKENNUNGSMUSTER:
- "und schick es an X" → send_email nach create_document
- "trag es in den Kalender ein" → create_calendar
- "erinner mich" → create_reminder
- "speicher den Kontakt" → save_contact
- "per WhatsApp" → send_whatsapp

WICHTIG:
1. Erkenne ALLE Aktionen, auch implizite
2. Setze die richtige Reihenfolge (priority)
3. Wenn eine Aktion von einer anderen abhängt, setze dependsOn
4. Extrahiere alle Parameter aus dem Text

ANTWORTE NUR MIT JSON:
{
  "summary": "Kurze Zusammenfassung was passieren soll",
  "actions": [
    {
      "type": "action_type",
      "priority": 1,
      "params": { ... },
      "dependsOn": null
    }
  ],
  "finalMessage": "Was MOI dem User am Ende sagen soll"
}

BEISPIELE:

User: "Erstell ein Angebot für Müller über 5000€ und schick es ihm"
→ {
  "summary": "Angebot erstellen und per E-Mail senden",
  "actions": [
    {"type": "create_document", "priority": 1, "params": {"docType": "angebot", "recipient": "Müller", "amount": 5000}},
    {"type": "send_email", "priority": 2, "params": {"to": "Müller", "subject": "Ihr Angebot", "attachDocument": true}, "dependsOn": 1}
  ],
  "finalMessage": "Angebot erstellt und an Müller gesendet!"
}

User: "Meeting morgen um 10 mit dem Team, schick allen eine Einladung"
→ {
  "summary": "Meeting erstellen und Einladungen versenden",
  "actions": [
    {"type": "create_calendar", "priority": 1, "params": {"title": "Team Meeting", "date": "morgen", "time": "10:00"}},
    {"type": "send_email", "priority": 2, "params": {"to": "team", "subject": "Meeting Einladung", "type": "invitation"}, "dependsOn": 1}
  ],
  "finalMessage": "Meeting eingetragen und Einladungen versendet!"
}`

export async function parseChainActions(userMessage: string): Promise<ChainPlan> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: CHAIN_PARSER_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.error('Chain parse error:', e)
  }

  // Fallback: Einzelne Asset-Erstellung
  return {
    summary: 'Asset erstellen',
    actions: [{
      type: 'create_asset',
      priority: 1,
      params: { content: userMessage }
    }],
    finalMessage: 'Fertig!'
  }
}

// ============================================
// CHAIN EXECUTOR - Führt alle Aktionen aus
// ============================================

export interface ActionResult {
  action: ChainAction
  success: boolean
  result?: any
  error?: string
}

export interface ChainResult {
  plan: ChainPlan
  results: ActionResult[]
  allSuccessful: boolean
  summary: string
}

export async function executeChain(
  plan: ChainPlan,
  context: {
    userId: number
    chatId: number
    userName?: string
    previousResults?: Map<number, any>
  },
  actionHandlers: Record<ActionType, (params: any, ctx: any) => Promise<any>>
): Promise<ChainResult> {
  const results: ActionResult[] = []
  const resultMap = new Map<number, any>()

  // Sortiere nach Priorität
  const sortedActions = [...plan.actions].sort((a, b) => a.priority - b.priority)

  for (const action of sortedActions) {
    try {
      // Warte auf Abhängigkeit wenn nötig
      let dependencyResult = null
      if (action.dependsOn !== undefined && action.dependsOn !== null) {
        dependencyResult = resultMap.get(action.dependsOn)
      }

      // Handler aufrufen
      const handler = actionHandlers[action.type]
      if (!handler) {
        results.push({
          action,
          success: false,
          error: `Unbekannte Aktion: ${action.type}`
        })
        continue
      }

      const result = await handler(
        { ...action.params, dependencyResult },
        context
      )

      resultMap.set(action.priority, result)
      results.push({
        action,
        success: true,
        result
      })

    } catch (error: any) {
      results.push({
        action,
        success: false,
        error: error.message || 'Unbekannter Fehler'
      })
    }
  }

  const allSuccessful = results.every(r => r.success)

  // Zusammenfassung erstellen
  const successCount = results.filter(r => r.success).length
  const summary = allSuccessful
    ? plan.finalMessage
    : `${successCount}/${results.length} Aktionen erfolgreich`

  return {
    plan,
    results,
    allSuccessful,
    summary
  }
}

// ============================================
// QUICK CHECK - Ist es eine Chain oder Single?
// ============================================

export function mightBeChain(text: string): boolean {
  const lower = text.toLowerCase()

  // E-Mail Adresse erkannt + Sende-Intent
  const hasEmail = /@/.test(text) || lower.includes('mail') || lower.includes('e-mail')
  const hasSendIntent = lower.includes('schick') || lower.includes('send') || lower.includes('mail')

  // Kalender Intent
  const hasCalendarIntent = lower.includes('kalender') || lower.includes('trag ein') || lower.includes('termin')

  // Dokument + Aktion
  const hasDocIntent = lower.includes('erstell') || lower.includes('angebot') || lower.includes('dokument')
  const hasChainWord = lower.includes(' und ') || lower.includes('dann') || lower.includes('danach')

  // Chain wenn: (Dokument + Senden) ODER (Dokument + Kalender) ODER (mehrere Aktionen)
  if (hasDocIntent && hasSendIntent && hasEmail) return true
  if (hasDocIntent && hasCalendarIntent) return true
  if (hasChainWord && (hasSendIntent || hasCalendarIntent)) return true

  return false
}

// E-Mail aus Text extrahieren (auch Spracheingabe wie "test at example punkt com")
export function extractEmail(text: string): string | null {
  // Standard E-Mail Regex
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/i
  const match = text.match(emailRegex)
  if (match) return match[0]

  // Spracheingabe: "test at example punkt com" oder "test at example dot com"
  const spokenRegex = /(\w+)\s*(at|@|ät)\s*(\w+)\s*(punkt|dot|\.)\s*(\w+)/i
  const spokenMatch = text.match(spokenRegex)
  if (spokenMatch) {
    return `${spokenMatch[1]}@${spokenMatch[3]}.${spokenMatch[5]}`
  }

  return null
}
