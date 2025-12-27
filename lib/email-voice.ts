// ============================================
// EMAIL VOICE - E-Mails am Telefon vorlesen & beantworten
// ============================================
// Microsoft Graph API für Outlook/Hotmail
// Gmail API für Google Mail
// Universelle Schnittstelle für Voice-Interaktion

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { sendEmail } from './email'

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY || '').replace(/\\n/g, '').trim()
})

// ============================================
// EMAIL MESSAGE INTERFACE
// ============================================

export interface EmailMessage {
  id: string
  from: string
  fromName?: string
  to: string
  subject: string
  date: Date
  preview: string
  body: string
  isRead: boolean
  provider: 'microsoft' | 'google' | 'demo'
}

// ============================================
// MICROSOFT GRAPH API (Outlook/Hotmail)
// ============================================

export async function fetchMicrosoftEmails(accessToken: string, limit: number = 5): Promise<EmailMessage[]> {
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$filter=isRead eq false`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      console.error('Microsoft Graph error:', await response.text())
      return []
    }

    const data = await response.json()

    return data.value.map((msg: any) => ({
      id: msg.id,
      from: msg.from?.emailAddress?.address || 'Unbekannt',
      fromName: msg.from?.emailAddress?.name,
      to: msg.toRecipients?.[0]?.emailAddress?.address || '',
      subject: msg.subject || 'Kein Betreff',
      date: new Date(msg.receivedDateTime),
      preview: msg.bodyPreview || '',
      body: msg.body?.content?.replace(/<[^>]+>/g, ' ') || msg.bodyPreview || '',
      isRead: msg.isRead,
      provider: 'microsoft' as const
    }))
  } catch (e) {
    console.error('Microsoft email fetch error:', e)
    return []
  }
}

export async function sendMicrosoftReply(
  accessToken: string,
  messageId: string,
  replyBody: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/reply`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            body: {
              contentType: 'Text',
              content: replyBody
            }
          }
        })
      }
    )

    return response.ok
  } catch (e) {
    console.error('Microsoft reply error:', e)
    return false
  }
}

// ============================================
// GMAIL API
// ============================================

export async function fetchGmailEmails(accessToken: string, limit: number = 5): Promise<EmailMessage[]> {
  try {
    // Erst Message IDs holen
    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=is:unread`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    )

    if (!listResponse.ok) return []

    const listData = await listResponse.json()
    if (!listData.messages?.length) return []

    // Details für jede Message holen
    const emails: EmailMessage[] = []

    for (const msg of listData.messages.slice(0, limit)) {
      const detailResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      )

      if (!detailResponse.ok) continue

      const detail = await detailResponse.json()
      const headers = detail.payload?.headers || []

      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

      // Body dekodieren
      let body = ''
      if (detail.payload?.body?.data) {
        body = Buffer.from(detail.payload.body.data, 'base64').toString('utf-8')
      } else if (detail.payload?.parts) {
        const textPart = detail.payload.parts.find((p: any) => p.mimeType === 'text/plain')
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
        }
      }

      emails.push({
        id: msg.id,
        from: getHeader('From'),
        fromName: getHeader('From').split('<')[0].trim(),
        to: getHeader('To'),
        subject: getHeader('Subject') || 'Kein Betreff',
        date: new Date(parseInt(detail.internalDate)),
        preview: detail.snippet || '',
        body: body || detail.snippet || '',
        isRead: !detail.labelIds?.includes('UNREAD'),
        provider: 'google' as const
      })
    }

    return emails
  } catch (e) {
    console.error('Gmail fetch error:', e)
    return []
  }
}

// ============================================
// DEMO MODE (für Testing ohne OAuth)
// ============================================

export function getDemoEmails(): EmailMessage[] {
  return [
    {
      id: 'demo_1',
      from: 'chef@firma.com',
      fromName: 'Dein Chef',
      to: 'du@email.com',
      subject: 'Wichtig: Projekt-Update morgen',
      date: new Date(Date.now() - 2 * 60 * 60 * 1000), // vor 2 Stunden
      preview: 'Bitte bereite die Präsentation für morgen vor...',
      body: 'Hallo, bitte bereite die Präsentation für das Meeting morgen um 10 Uhr vor. Wir müssen die Quartalszahlen besprechen. Grüße',
      isRead: false,
      provider: 'demo'
    },
    {
      id: 'demo_2',
      from: 'kunde@beispiel.de',
      fromName: 'Max Mustermann',
      to: 'du@email.com',
      subject: 'Anfrage zu eurem Produkt',
      date: new Date(Date.now() - 5 * 60 * 60 * 1000), // vor 5 Stunden
      preview: 'Ich hätte eine Frage zu den Preisen...',
      body: 'Sehr geehrte Damen und Herren, ich interessiere mich für Ihr Produkt und hätte gerne ein Angebot für 100 Stück. Mit freundlichen Grüßen, Max Mustermann',
      isRead: false,
      provider: 'demo'
    },
    {
      id: 'demo_3',
      from: 'newsletter@shop.com',
      fromName: 'Shop Newsletter',
      to: 'du@email.com',
      subject: '50% Rabatt nur heute!',
      date: new Date(Date.now() - 24 * 60 * 60 * 1000), // vor 1 Tag
      preview: 'Sichern Sie sich jetzt unsere Sonderangebote...',
      body: 'Nur heute: 50% auf alle Artikel. Jetzt zuschlagen!',
      isRead: false,
      provider: 'demo'
    }
  ]
}

// ============================================
// USER EMAIL CONFIG & TOKENS
// ============================================

interface UserEmailConfig {
  user_id: number
  provider: 'microsoft' | 'google'
  email: string
  access_token: string
  refresh_token: string
  expires_at: number
  enabled: boolean
}

export async function getUserEmailConfig(userId: number): Promise<UserEmailConfig | null> {
  try {
    const { data } = await supabase
      .from('user_email_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('enabled', true)
      .single()

    return data
  } catch {
    return null
  }
}

// Token refreshen wenn nötig
export async function refreshAccessToken(config: UserEmailConfig): Promise<string | null> {
  // Token noch gültig?
  if (Date.now() < config.expires_at - 60000) {
    return config.access_token
  }

  // Microsoft Token Refresh
  if (config.provider === 'microsoft') {
    try {
      const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: config.refresh_token,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access'
        })
      })

      if (!response.ok) return null

      const data = await response.json()

      // Neuen Token speichern
      await supabase
        .from('user_email_configs')
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token || config.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000
        })
        .eq('user_id', config.user_id)

      return data.access_token
    } catch (e) {
      console.error('Token refresh error:', e)
      return null
    }
  }

  // Google Token Refresh
  if (config.provider === 'google') {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: config.refresh_token,
          grant_type: 'refresh_token'
        })
      })

      if (!response.ok) return null

      const data = await response.json()

      await supabase
        .from('user_email_configs')
        .update({
          access_token: data.access_token,
          expires_at: Date.now() + data.expires_in * 1000
        })
        .eq('user_id', config.user_id)

      return data.access_token
    } catch (e) {
      console.error('Google token refresh error:', e)
      return null
    }
  }

  return null
}

// ============================================
// UNIFIED EMAIL INTERFACE
// ============================================

// Prüfen ob User E-Mail verbunden hat
export async function isEmailConnected(userId: number): Promise<boolean> {
  const config = await getUserEmailConfig(userId)
  return !!config
}

// Verbindungslink generieren
export function getConnectLink(phone: string): string {
  return `https://mymoi-bot.vercel.app/api/connect?phone=${encodeURIComponent(phone)}`
}

export async function fetchUserEmails(userId: number, limit: number = 5): Promise<EmailMessage[]> {
  const config = await getUserEmailConfig(userId)

  // Kein Config? Demo-Modus
  if (!config) {
    console.log('📧 Kein Email-Config gefunden, nutze Demo-Modus')
    return getDemoEmails()
  }

  const accessToken = await refreshAccessToken(config)
  if (!accessToken) {
    console.log('📧 Token-Refresh fehlgeschlagen, nutze Demo-Modus')
    return getDemoEmails()
  }

  if (config.provider === 'microsoft') {
    return fetchMicrosoftEmails(accessToken, limit)
  } else if (config.provider === 'google') {
    return fetchGmailEmails(accessToken, limit)
  }

  return getDemoEmails()
}

// ============================================
// VOICE FORMATTING
// ============================================

export function formatEmailsForVoice(emails: EmailMessage[]): string {
  if (emails.length === 0) {
    return 'Du hast keine ungelesenen E-Mails. Dein Posteingang ist leer.'
  }

  let response = `Du hast ${emails.length} ungelesene ${emails.length === 1 ? 'E-Mail' : 'E-Mails'}. `

  emails.slice(0, 3).forEach((email, i) => {
    const fromName = email.fromName || email.from.split('@')[0]
    const timeAgo = formatTimeAgo(email.date)

    response += `${i + 1}. Von ${fromName}, ${timeAgo}: ${email.subject}. `
  })

  if (emails.length > 3) {
    response += `Und ${emails.length - 3} weitere. `
  }

  response += 'Sage "lies E-Mail eins" um die erste zu hören, oder "antworte auf E-Mail eins".'

  return response
}

export function formatSingleEmailForVoice(email: EmailMessage): string {
  const fromName = email.fromName || email.from.split('@')[0]
  const timeAgo = formatTimeAgo(email.date)

  let body = email.body
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()

  if (body.length > 500) {
    body = body.substring(0, 500) + '... Das war eine Zusammenfassung.'
  }

  return `E-Mail von ${fromName}, ${timeAgo}. Betreff: ${email.subject}. Inhalt: ${body}`
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 60) return `vor ${minutes} Minuten`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Stunden`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}

// ============================================
// EMAIL REPLY GENERATION
// ============================================

export async function generateEmailReply(
  originalEmail: EmailMessage,
  userInstruction: string
): Promise<{ subject: string; body: string }> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Du schreibst E-Mail-Antworten im Namen des Users.
Stil: Professionell aber freundlich, auf Deutsch.
Beginne direkt mit der Anrede (Hallo/Sehr geehrte...).
Schließe mit "Mit freundlichen Grüßen" ohne Namen (der User fügt seinen Namen selbst ein).`,
    messages: [{
      role: 'user',
      content: `Original E-Mail:
Von: ${originalEmail.fromName || originalEmail.from}
Betreff: ${originalEmail.subject}
Inhalt: ${originalEmail.body.substring(0, 2000)}

---
User-Anweisung für die Antwort: ${userInstruction}

Schreibe die Antwort-E-Mail.`
    }]
  })

  const replyBody = response.content[0].type === 'text' ? response.content[0].text : ''

  return {
    subject: `Re: ${originalEmail.subject}`,
    body: replyBody
  }
}

// ============================================
// EMAIL COMMAND PARSER
// ============================================

export interface EmailCommand {
  action: 'list' | 'read' | 'reply' | 'send' | 'delete' | 'archive' | 'unknown'
  emailIndex?: number
  content?: string
  recipient?: string
  subject?: string
}

export function parseEmailCommand(text: string): EmailCommand {
  const lower = text.toLowerCase()

  // E-Mails auflisten
  if (
    lower.includes('meine emails') ||
    lower.includes('meine e-mails') ||
    lower.includes('neue emails') ||
    lower.includes('ungelesene') ||
    lower.includes('zeig emails') ||
    lower.includes('check emails') ||
    lower.includes('posteingang') ||
    lower.includes('inbox') ||
    lower.includes('checke mails') ||
    lower.includes('lies meine mails')
  ) {
    return { action: 'list' }
  }

  // Einzelne E-Mail lesen
  const readMatch = lower.match(/(?:lies|vorlesen|öffne)\s+(?:die\s+)?(?:e-?mail\s+)?(?:nummer\s+)?(\d+|eins|zwei|drei|vier|fünf|erste|zweite|dritte|vierte|fünfte)/i)
  if (readMatch) {
    return {
      action: 'read',
      emailIndex: parseNumber(readMatch[1])
    }
  }

  // Auf E-Mail antworten
  if (lower.includes('antwort') || lower.includes('reply')) {
    const indexMatch = lower.match(/(?:e-?mail\s+)?(?:nummer\s+)?(\d+|eins|zwei|drei)/i)
    const contentMatch = text.match(/(?:mit|sage|schreib|sag)\s+["""]?(.+?)["""]?$/i)

    return {
      action: 'reply',
      emailIndex: indexMatch ? parseNumber(indexMatch[1]) : 1,
      content: contentMatch?.[1] || 'Danke für deine E-Mail, ich melde mich bald.'
    }
  }

  // Archivieren
  if (lower.includes('archiv')) {
    const indexMatch = lower.match(/(\d+|eins|zwei|drei)/i)
    return {
      action: 'archive',
      emailIndex: indexMatch ? parseNumber(indexMatch[1]) : 1
    }
  }

  return { action: 'unknown' }
}

function parseNumber(text: string): number {
  const map: Record<string, number> = {
    'eins': 1, 'erste': 1, 'ersten': 1, '1': 1,
    'zwei': 2, 'zweite': 2, 'zweiten': 2, '2': 2,
    'drei': 3, 'dritte': 3, 'dritten': 3, '3': 3,
    'vier': 4, 'vierte': 4, '4': 4,
    'fünf': 5, 'fünfte': 5, '5': 5
  }
  return map[text.toLowerCase()] || parseInt(text) || 1
}

// ============================================
// EMAIL SESSION CACHE
// ============================================

const emailSessions = new Map<string, {
  emails: EmailMessage[]
  currentIndex: number
  lastAccess: number
}>()

export function setEmailSession(phone: string, emails: EmailMessage[]) {
  emailSessions.set(phone, {
    emails,
    currentIndex: 0,
    lastAccess: Date.now()
  })

  // Cleanup nach 30 Minuten
  setTimeout(() => {
    const session = emailSessions.get(phone)
    if (session && Date.now() - session.lastAccess > 30 * 60 * 1000) {
      emailSessions.delete(phone)
    }
  }, 30 * 60 * 1000)
}

export function getEmailSession(phone: string) {
  const session = emailSessions.get(phone)
  if (session) {
    session.lastAccess = Date.now()
  }
  return session
}

export function getEmailFromSession(phone: string, index: number): EmailMessage | null {
  const session = emailSessions.get(phone)
  if (!session || index < 1 || index > session.emails.length) {
    return null
  }
  session.currentIndex = index - 1
  return session.emails[index - 1]
}

// ============================================
// SEND REPLY (via existing email system)
// ============================================

export async function sendEmailReply(
  originalEmail: EmailMessage,
  replyBody: string
): Promise<boolean> {
  // Extrahiere E-Mail-Adresse aus "From" Feld
  const emailMatch = originalEmail.from.match(/<([^>]+)>/) || [null, originalEmail.from]
  const toEmail = emailMatch[1]

  if (!toEmail || !toEmail.includes('@')) {
    console.error('Keine gültige E-Mail-Adresse:', originalEmail.from)
    return false
  }

  const result = await sendEmail({
    to: toEmail,
    subject: `Re: ${originalEmail.subject}`,
    body: replyBody
  })

  return result.success
}
