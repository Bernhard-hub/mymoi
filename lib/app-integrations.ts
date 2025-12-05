// ============================================
// APP INTEGRATIONS - Kostenlose Dienste!
// ============================================
// Notion, Trello, Airtable, Google Sheets, Todoist
// IFTTT, Zapier Webhooks, Discord, Slack
// Alle per Voice steuerbar!

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

// ============================================
// 1. NOTION - Notizen & Datenbanken
// ============================================
// Braucht: NOTION_API_KEY + NOTION_DATABASE_ID

export async function addToNotion(
  title: string,
  content: string,
  tags?: string[]
): Promise<{ success: boolean; url?: string; error?: string }> {
  const apiKey = process.env.NOTION_API_KEY
  const databaseId = process.env.NOTION_DATABASE_ID

  if (!apiKey || !databaseId) {
    return { success: false, error: 'Notion nicht konfiguriert' }
  }

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Name: { title: [{ text: { content: title } }] },
          Tags: tags ? { multi_select: tags.map(t => ({ name: t })) } : undefined
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content } }]
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const data = await response.json()
    return { success: true, url: data.url }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 2. TRELLO - Karten erstellen
// ============================================
// Braucht: TRELLO_API_KEY + TRELLO_TOKEN + TRELLO_LIST_ID

export async function addToTrello(
  title: string,
  description?: string,
  labels?: string[]
): Promise<{ success: boolean; url?: string; error?: string }> {
  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  const listId = process.env.TRELLO_LIST_ID

  if (!apiKey || !token || !listId) {
    return { success: false, error: 'Trello nicht konfiguriert' }
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      token: token,
      idList: listId,
      name: title,
      desc: description || ''
    })

    const response = await fetch(`https://api.trello.com/1/cards?${params}`, {
      method: 'POST'
    })

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    const data = await response.json()
    return { success: true, url: data.shortUrl }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 3. TODOIST - Aufgaben erstellen
// ============================================
// Braucht: TODOIST_API_KEY

export async function addToTodoist(
  content: string,
  dueString?: string,
  priority?: 1 | 2 | 3 | 4
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = process.env.TODOIST_API_KEY

  if (!apiKey) {
    return { success: false, error: 'Todoist nicht konfiguriert' }
  }

  try {
    const response = await fetch('https://api.todoist.com/rest/v2/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content,
        due_string: dueString,
        priority: priority || 1
      })
    })

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    const data = await response.json()
    return { success: true, id: data.id }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 4. DISCORD - Nachrichten senden
// ============================================
// Braucht: DISCORD_WEBHOOK_URL

export async function sendToDiscord(
  message: string,
  username?: string
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    return { success: false, error: 'Discord nicht konfiguriert' }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message,
        username: username || 'MOI'
      })
    })

    return { success: response.ok }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 5. SLACK - Nachrichten senden
// ============================================
// Braucht: SLACK_WEBHOOK_URL

export async function sendToSlack(
  text: string,
  channel?: string
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    return { success: false, error: 'Slack nicht konfiguriert' }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        channel,
        username: 'MOI'
      })
    })

    return { success: response.ok }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 6. AIRTABLE - Datensätze hinzufügen
// ============================================
// Braucht: AIRTABLE_API_KEY + AIRTABLE_BASE_ID + AIRTABLE_TABLE_NAME

export async function addToAirtable(
  fields: Record<string, any>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tasks'

  if (!apiKey || !baseId) {
    return { success: false, error: 'Airtable nicht konfiguriert' }
  }

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      }
    )

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    const data = await response.json()
    return { success: true, id: data.id }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 7. GOOGLE SHEETS - Zeile hinzufügen
// ============================================
// Braucht: Öffentliches Sheet mit Web App Trigger
// oder GOOGLE_SHEETS_WEBHOOK_URL (Apps Script Web App)

export async function addToGoogleSheets(
  data: string[]
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL

  if (!webhookUrl) {
    return { success: false, error: 'Google Sheets nicht konfiguriert' }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: data })
    })

    return { success: response.ok }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 8. IFTTT - Webhooks auslösen
// ============================================
// Braucht: IFTTT_WEBHOOK_KEY + event_name

export async function triggerIFTTT(
  eventName: string,
  value1?: string,
  value2?: string,
  value3?: string
): Promise<{ success: boolean; error?: string }> {
  const webhookKey = process.env.IFTTT_WEBHOOK_KEY

  if (!webhookKey) {
    return { success: false, error: 'IFTTT nicht konfiguriert' }
  }

  try {
    const response = await fetch(
      `https://maker.ifttt.com/trigger/${eventName}/with/key/${webhookKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value1, value2, value3 })
      }
    )

    return { success: response.ok }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 9. TELEGRAM - Nachrichten senden
// ============================================
// Braucht: TELEGRAM_BOT_TOKEN + chat_id

export async function sendToTelegram(
  chatId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) {
    return { success: false, error: 'Telegram nicht konfiguriert' }
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      }
    )

    return { success: response.ok }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 10. GITHUB - Issues erstellen
// ============================================
// Braucht: GITHUB_TOKEN + GITHUB_REPO (format: owner/repo)

export async function createGitHubIssue(
  title: string,
  body: string,
  labels?: string[]
): Promise<{ success: boolean; url?: string; error?: string }> {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO

  if (!token || !repo) {
    return { success: false, error: 'GitHub nicht konfiguriert' }
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'MOI-Voice-Assistant'
        },
        body: JSON.stringify({ title, body, labels })
      }
    )

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    const data = await response.json()
    return { success: true, url: data.html_url }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 11. LINEAR - Issues erstellen
// ============================================
// Braucht: LINEAR_API_KEY + LINEAR_TEAM_ID

export async function createLinearIssue(
  title: string,
  description?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const apiKey = process.env.LINEAR_API_KEY
  const teamId = process.env.LINEAR_TEAM_ID

  if (!apiKey || !teamId) {
    return { success: false, error: 'Linear nicht konfiguriert' }
  }

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
          mutation CreateIssue($title: String!, $description: String, $teamId: String!) {
            issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
              success
              issue { url }
            }
          }
        `,
        variables: { title, description, teamId }
      })
    })

    const data = await response.json()
    if (data.data?.issueCreate?.success) {
      return { success: true, url: data.data.issueCreate.issue?.url }
    }
    return { success: false, error: 'Issue creation failed' }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// SMART INTEGRATION ROUTER
// ============================================
// AI erkennt welche Integration genutzt werden soll

export interface IntegrationRequest {
  type: 'notion' | 'trello' | 'todoist' | 'discord' | 'slack' | 'airtable' | 'sheets' | 'ifttt' | 'telegram' | 'github' | 'linear' | 'unknown'
  title?: string
  content?: string
  dueDate?: string
  tags?: string[]
  priority?: number
  recipient?: string
}

export async function parseIntegrationRequest(text: string): Promise<IntegrationRequest> {
  // Schnelle Keyword-Erkennung
  const lower = text.toLowerCase()

  // Explizite Erwähnungen
  if (lower.includes('notion')) return { type: 'notion', title: text, content: text }
  if (lower.includes('trello')) return { type: 'trello', title: text }
  if (lower.includes('todoist')) return { type: 'todoist', title: text }
  if (lower.includes('discord')) return { type: 'discord', content: text }
  if (lower.includes('slack')) return { type: 'slack', content: text }
  if (lower.includes('airtable')) return { type: 'airtable', content: text }
  if (lower.includes('sheets') || lower.includes('tabelle')) return { type: 'sheets', content: text }
  if (lower.includes('ifttt') || lower.includes('automatisier')) return { type: 'ifttt', content: text }
  if (lower.includes('telegram')) return { type: 'telegram', content: text }
  if (lower.includes('github') || lower.includes('issue')) return { type: 'github', title: text, content: text }
  if (lower.includes('linear')) return { type: 'linear', title: text }

  // AI-basierte Erkennung für komplexere Fälle
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: `Erkenne welche App-Integration der User meint.
Antworte NUR mit JSON:
{
  "type": "notion|trello|todoist|discord|slack|airtable|sheets|ifttt|telegram|github|linear|unknown",
  "title": "Titel/Aufgabe",
  "content": "Beschreibung",
  "dueDate": "falls genannt",
  "tags": ["tag1", "tag2"],
  "priority": 1-4
}

Hinweise:
- "Notiz" → notion
- "Aufgabe/Task/Todo" → todoist oder trello
- "Nachricht an Team" → slack oder discord
- "Speicher in Tabelle" → airtable oder sheets
- "Bug/Feature" → github oder linear`,
    messages: [{ role: 'user', content: text }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    return JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{"type":"unknown"}')
  } catch {
    return { type: 'unknown' }
  }
}

// ============================================
// EXECUTE INTEGRATION
// ============================================

export async function executeIntegration(
  request: IntegrationRequest
): Promise<{ success: boolean; message: string; url?: string }> {
  switch (request.type) {
    case 'notion':
      const notionResult = await addToNotion(
        request.title || 'MOI Notiz',
        request.content || '',
        request.tags
      )
      return {
        success: notionResult.success,
        message: notionResult.success ? 'In Notion gespeichert!' : notionResult.error || 'Fehler',
        url: notionResult.url
      }

    case 'trello':
      const trelloResult = await addToTrello(
        request.title || 'MOI Task',
        request.content
      )
      return {
        success: trelloResult.success,
        message: trelloResult.success ? 'Trello-Karte erstellt!' : trelloResult.error || 'Fehler',
        url: trelloResult.url
      }

    case 'todoist':
      const todoistResult = await addToTodoist(
        request.title || request.content || 'MOI Task',
        request.dueDate,
        request.priority as any
      )
      return {
        success: todoistResult.success,
        message: todoistResult.success ? 'Todoist-Aufgabe erstellt!' : todoistResult.error || 'Fehler'
      }

    case 'discord':
      const discordResult = await sendToDiscord(request.content || request.title || '')
      return {
        success: discordResult.success,
        message: discordResult.success ? 'Discord-Nachricht gesendet!' : discordResult.error || 'Fehler'
      }

    case 'slack':
      const slackResult = await sendToSlack(request.content || request.title || '')
      return {
        success: slackResult.success,
        message: slackResult.success ? 'Slack-Nachricht gesendet!' : slackResult.error || 'Fehler'
      }

    case 'airtable':
      const airtableResult = await addToAirtable({
        Name: request.title,
        Notes: request.content,
        Status: 'New'
      })
      return {
        success: airtableResult.success,
        message: airtableResult.success ? 'Airtable-Eintrag erstellt!' : airtableResult.error || 'Fehler'
      }

    case 'sheets':
      const sheetsResult = await addToGoogleSheets([
        new Date().toISOString(),
        request.title || '',
        request.content || ''
      ])
      return {
        success: sheetsResult.success,
        message: sheetsResult.success ? 'Google Sheets aktualisiert!' : sheetsResult.error || 'Fehler'
      }

    case 'ifttt':
      const iftttResult = await triggerIFTTT(
        'moi_trigger',
        request.title,
        request.content
      )
      return {
        success: iftttResult.success,
        message: iftttResult.success ? 'IFTTT ausgelöst!' : iftttResult.error || 'Fehler'
      }

    case 'telegram':
      if (!request.recipient) {
        return { success: false, message: 'Telegram Chat-ID fehlt' }
      }
      const telegramResult = await sendToTelegram(request.recipient, request.content || '')
      return {
        success: telegramResult.success,
        message: telegramResult.success ? 'Telegram gesendet!' : telegramResult.error || 'Fehler'
      }

    case 'github':
      const githubResult = await createGitHubIssue(
        request.title || 'MOI Issue',
        request.content || '',
        request.tags
      )
      return {
        success: githubResult.success,
        message: githubResult.success ? 'GitHub Issue erstellt!' : githubResult.error || 'Fehler',
        url: githubResult.url
      }

    case 'linear':
      const linearResult = await createLinearIssue(
        request.title || 'MOI Issue',
        request.content
      )
      return {
        success: linearResult.success,
        message: linearResult.success ? 'Linear Issue erstellt!' : linearResult.error || 'Fehler',
        url: linearResult.url
      }

    default:
      return { success: false, message: 'Unbekannte Integration' }
  }
}

// ============================================
// CHECK AVAILABLE INTEGRATIONS
// ============================================

export function getAvailableIntegrations(): string[] {
  const available: string[] = []

  if (process.env.NOTION_API_KEY) available.push('Notion')
  if (process.env.TRELLO_API_KEY) available.push('Trello')
  if (process.env.TODOIST_API_KEY) available.push('Todoist')
  if (process.env.DISCORD_WEBHOOK_URL) available.push('Discord')
  if (process.env.SLACK_WEBHOOK_URL) available.push('Slack')
  if (process.env.AIRTABLE_API_KEY) available.push('Airtable')
  if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) available.push('Google Sheets')
  if (process.env.IFTTT_WEBHOOK_KEY) available.push('IFTTT')
  if (process.env.TELEGRAM_BOT_TOKEN) available.push('Telegram')
  if (process.env.GITHUB_TOKEN) available.push('GitHub')
  if (process.env.LINEAR_API_KEY) available.push('Linear')

  return available
}

// ============================================
// VOICE COMMAND DETECTION
// ============================================

export function isIntegrationRequest(text: string): boolean {
  const integrationKeywords = [
    'notion', 'trello', 'todoist', 'discord', 'slack', 'airtable',
    'sheets', 'tabelle', 'ifttt', 'automatisier', 'telegram', 'github', 'linear',
    'speicher in', 'füge hinzu', 'erstelle task', 'neue aufgabe',
    'sende an', 'poste', 'issue', 'ticket', 'karte'
  ]

  const lower = text.toLowerCase()
  return integrationKeywords.some(k => lower.includes(k))
}
