// ============================================
// MOI BRAIN - Das Gehirn von MOI
// ============================================
// Omniscient AI: Versteht, lernt, fragt nach, recherchiert

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ============================================
// 1. SMART ABBREVIATION DETECTION
// ============================================

export interface AbbreviationCheck {
  hasAmbiguity: boolean
  ambiguousTerms: {
    term: string
    possibleMeanings: string[]
    question: string
  }[]
  clarifiedText?: string
}

// Erkennt mehrdeutige Abkürzungen und Begriffe
export async function detectAmbiguities(
  text: string,
  userId: number
): Promise<AbbreviationCheck> {
  // Erst im User-Wissen nachschauen
  const userKnowledge = await getUserKnowledge(userId)

  // AI analysiert den Text auf Mehrdeutigkeiten
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Du bist ein Assistent der mehrdeutige Begriffe und Abkürzungen erkennt.

BEKANNTES WISSEN DIESES USERS:
${userKnowledge.map(k => `- "${k.term}" bedeutet "${k.meaning}"`).join('\n') || 'Noch nichts gespeichert'}

Analysiere den Text auf:
1. Abkürzungen die mehrere Bedeutungen haben könnten (LP, ATM, CRM, etc.)
2. Firmennamen die unklar sind
3. Fachbegriffe die Kontext brauchen
4. Namen von Personen die du nicht kennst

WICHTIG: Wenn ein Begriff im BEKANNTEN WISSEN steht, ist er NICHT mehrdeutig!

Antworte NUR mit JSON:
{
  "hasAmbiguity": true/false,
  "ambiguousTerms": [
    {
      "term": "ATM",
      "possibleMeanings": ["Geldautomat", "Advanced Trash Management", "Firmenname"],
      "question": "Was bedeutet ATM in diesem Kontext?"
    }
  ]
}`,
    messages: [{ role: 'user', content: text }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')
    return {
      hasAmbiguity: parsed.hasAmbiguity || false,
      ambiguousTerms: parsed.ambiguousTerms || []
    }
  } catch {
    return { hasAmbiguity: false, ambiguousTerms: [] }
  }
}

// ============================================
// 2. PERSÖNLICHES WISSENS-NETZWERK
// ============================================

interface UserKnowledge {
  term: string
  meaning: string
  context?: string
  created_at: string
}

// User-Wissen abrufen
export async function getUserKnowledge(userId: number): Promise<UserKnowledge[]> {
  try {
    const { data } = await supabase
      .from('user_knowledge')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)

    return data || []
  } catch {
    return []
  }
}

// Neues Wissen speichern
export async function saveUserKnowledge(
  userId: number,
  term: string,
  meaning: string,
  context?: string
): Promise<void> {
  try {
    await supabase.from('user_knowledge').upsert({
      user_id: userId,
      term: term.toLowerCase(),
      meaning,
      context,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,term'
    })
    console.log(`🧠 Wissen gespeichert: "${term}" = "${meaning}"`)
  } catch (e) {
    console.error('Knowledge save error:', e)
  }
}

// Kontakt speichern
export async function saveContact(
  userId: number,
  name: string,
  details: { email?: string; phone?: string; company?: string; notes?: string }
): Promise<void> {
  try {
    await supabase.from('user_contacts').upsert({
      user_id: userId,
      name: name.toLowerCase(),
      email: details.email,
      phone: details.phone,
      company: details.company,
      notes: details.notes,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,name'
    })
    console.log(`👤 Kontakt gespeichert: ${name}`)
  } catch (e) {
    console.error('Contact save error:', e)
  }
}

// Kontakt suchen
export async function findContact(userId: number, query: string): Promise<any | null> {
  try {
    const { data } = await supabase
      .from('user_contacts')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', `%${query}%`)
      .limit(1)
      .single()

    return data
  } catch {
    return null
  }
}

// ============================================
// 3. LIVE WEB RESEARCH
// ============================================

export interface ResearchResult {
  summary: string
  facts: string[]
  sources: string[]
}

// Web-Recherche für unbekannte Begriffe
export async function researchTopic(query: string): Promise<ResearchResult> {
  try {
    // DuckDuckGo Instant Answer API (kostenlos, kein Key nötig)
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    const response = await fetch(searchUrl)
    const data = await response.json()

    const facts: string[] = []
    const sources: string[] = []

    // Abstract/Summary
    if (data.Abstract) {
      facts.push(data.Abstract)
      sources.push(data.AbstractURL)
    }

    // Related Topics
    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 3).forEach((topic: any) => {
        if (topic.Text) facts.push(topic.Text)
        if (topic.FirstURL) sources.push(topic.FirstURL)
      })
    }

    // Infobox
    if (data.Infobox?.content) {
      data.Infobox.content.slice(0, 5).forEach((item: any) => {
        if (item.label && item.value) {
          facts.push(`${item.label}: ${item.value}`)
        }
      })
    }

    return {
      summary: data.Abstract || data.Heading || `Informationen zu "${query}"`,
      facts,
      sources
    }
  } catch (e) {
    console.error('Research error:', e)
    return {
      summary: `Konnte keine Informationen zu "${query}" finden`,
      facts: [],
      sources: []
    }
  }
}

// Firmen-Info recherchieren
export async function researchCompany(companyName: string): Promise<any> {
  const research = await researchTopic(`${companyName} Unternehmen`)
  return {
    name: companyName,
    ...research
  }
}

// ============================================
// 4. INTENT UNDERSTANDING & CHAINING
// ============================================

export interface UnderstandingResult {
  understood: boolean
  needsClarification: boolean
  clarificationQuestions?: string[]
  intents: {
    action: string
    target?: string
    parameters: Record<string, any>
    dependsOn?: number // Index des vorherigen Intents
  }[]
  suggestedFlow?: string
}

// Tiefes Verständnis der User-Anfrage
export async function understandRequest(
  text: string,
  userId: number
): Promise<UnderstandingResult> {
  const userKnowledge = await getUserKnowledge(userId)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `Du bist MOI's Gehirn. Analysiere die Anfrage TIEF.

USER'S BEKANNTES WISSEN:
${userKnowledge.map(k => `- "${k.term}" = "${k.meaning}"`).join('\n') || 'Noch nichts'}

DEINE AUFGABE:
1. Erkenne ALLE Aktionen die der User will (können mehrere sein!)
2. Erkenne Abhängigkeiten zwischen Aktionen
3. Identifiziere fehlende Informationen
4. Schlage den optimalen Ablauf vor

MÖGLICHE AKTIONEN:
- create_document (Dokument, Angebot, Vertrag, etc.)
- create_website (Landing Page, Blog, etc.)
- create_presentation (PowerPoint)
- send_email (E-Mail senden)
- send_sms (SMS senden)
- send_whatsapp (WhatsApp)
- create_calendar (Termin erstellen)
- set_reminder (Erinnerung)
- research (Recherche)
- save_contact (Kontakt speichern)
- save_knowledge (Wissen merken)

Antworte NUR mit JSON:
{
  "understood": true/false,
  "needsClarification": true/false,
  "clarificationQuestions": ["Frage 1?", "Frage 2?"],
  "intents": [
    {
      "action": "create_document",
      "target": "Angebot",
      "parameters": {"recipient": "Müller GmbH", "topic": "Webdesign"},
      "dependsOn": null
    },
    {
      "action": "send_email",
      "target": "einkauf@mueller.de",
      "parameters": {"attachPrevious": true},
      "dependsOn": 0
    }
  ],
  "suggestedFlow": "1. Erstelle Angebot → 2. Sende per E-Mail → 3. Setze Reminder"
}`,
    messages: [{ role: 'user', content: text }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')
    return {
      understood: parsed.understood ?? true,
      needsClarification: parsed.needsClarification || false,
      clarificationQuestions: parsed.clarificationQuestions,
      intents: parsed.intents || [],
      suggestedFlow: parsed.suggestedFlow
    }
  } catch {
    return {
      understood: false,
      needsClarification: true,
      clarificationQuestions: ['Kannst du das nochmal anders formulieren?'],
      intents: []
    }
  }
}

// ============================================
// 5. VOICE CALLBACK SYSTEM
// ============================================

export interface PendingClarification {
  id: string
  userId: number
  phone: string
  originalText: string
  questions: string[]
  answers: Record<string, string>
  status: 'pending' | 'answered' | 'expired'
  created_at: string
}

// Klärung anfordern (speichert für Callback)
export async function requestClarification(
  userId: number,
  phone: string,
  originalText: string,
  questions: string[]
): Promise<string> {
  const id = `clarify_${Date.now()}_${userId}`

  try {
    await supabase.from('pending_clarifications').insert({
      id,
      user_id: userId,
      phone,
      original_text: originalText,
      questions,
      answers: {},
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min
    })
  } catch (e) {
    console.error('Clarification save error:', e)
  }

  return id
}

// Antwort auf Klärung verarbeiten
export async function processClarificationAnswer(
  clarificationId: string,
  answerText: string
): Promise<{ resolved: boolean; updatedText?: string }> {
  try {
    const { data: clarification } = await supabase
      .from('pending_clarifications')
      .select('*')
      .eq('id', clarificationId)
      .single()

    if (!clarification) {
      return { resolved: false }
    }

    // AI verarbeitet die Antwort
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Original-Anfrage: "${clarification.original_text}"
Gestellte Fragen: ${clarification.questions.join(', ')}
User-Antwort: "${answerText}"

Erstelle die vollständige, klare Anfrage basierend auf der Antwort.
Antworte NUR mit dem finalen Text, keine Erklärungen.`
      }]
    })

    const updatedText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Status updaten
    await supabase
      .from('pending_clarifications')
      .update({ status: 'answered', answers: { answer: answerText } })
      .eq('id', clarificationId)

    return { resolved: true, updatedText: updatedText.trim() }
  } catch (e) {
    console.error('Clarification process error:', e)
    return { resolved: false }
  }
}

// ============================================
// 6. MASTER ORCHESTRATOR
// ============================================

export interface ProcessingResult {
  status: 'execute' | 'clarify' | 'research' | 'error'
  message?: string
  clarificationQuestions?: string[]
  intents?: UnderstandingResult['intents']
  researchResults?: ResearchResult
  enrichedText?: string
}

// Der Haupt-Prozess: Verstehen → Klären → Ausführen
export async function processWithBrain(
  text: string,
  userId: number,
  phone?: string
): Promise<ProcessingResult> {
  console.log('🧠 MOI Brain processing:', text)

  // 1. Auf Mehrdeutigkeiten prüfen
  const ambiguityCheck = await detectAmbiguities(text, userId)

  if (ambiguityCheck.hasAmbiguity && ambiguityCheck.ambiguousTerms.length > 0) {
    const questions = ambiguityCheck.ambiguousTerms.map(t => t.question)

    // Klärung speichern für Callback
    if (phone) {
      await requestClarification(userId, phone, text, questions)
    }

    return {
      status: 'clarify',
      message: 'Ich brauche kurz eine Klärung',
      clarificationQuestions: questions
    }
  }

  // 2. Tiefes Verständnis
  const understanding = await understandRequest(text, userId)

  if (understanding.needsClarification) {
    if (phone) {
      await requestClarification(userId, phone, text, understanding.clarificationQuestions || [])
    }

    return {
      status: 'clarify',
      message: 'Ich möchte sichergehen dass ich richtig verstehe',
      clarificationQuestions: understanding.clarificationQuestions
    }
  }

  // 3. Falls Recherche nötig, durchführen
  let researchResults: ResearchResult | undefined
  const researchIntent = understanding.intents.find(i => i.action === 'research')
  if (researchIntent) {
    researchResults = await researchTopic(researchIntent.target || text)
  }

  // 4. Wissen extrahieren und speichern (lernen!)
  for (const intent of understanding.intents) {
    if (intent.action === 'save_knowledge') {
      await saveUserKnowledge(
        userId,
        intent.parameters.term,
        intent.parameters.meaning,
        intent.parameters.context
      )
    }
    if (intent.action === 'save_contact') {
      await saveContact(userId, intent.target || '', intent.parameters)
    }
  }

  // 5. Bereit zur Ausführung
  return {
    status: 'execute',
    intents: understanding.intents,
    researchResults,
    enrichedText: understanding.suggestedFlow
      ? `${text}\n\n[Plan: ${understanding.suggestedFlow}]`
      : text
  }
}

// Text mit User-Wissen anreichern
export async function enrichWithKnowledge(text: string, userId: number): Promise<string> {
  const knowledge = await getUserKnowledge(userId)

  if (knowledge.length === 0) return text

  let enrichedText = text
  for (const k of knowledge) {
    // Ersetze Abkürzungen durch vollständige Bedeutung im Kontext
    const regex = new RegExp(`\\b${k.term}\\b`, 'gi')
    if (regex.test(text)) {
      enrichedText = enrichedText.replace(regex, `${k.term} (${k.meaning})`)
    }
  }

  return enrichedText
}
