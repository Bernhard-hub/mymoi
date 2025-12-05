// ============================================
// E-MAIL SERVICE - MOI versendet E-Mails
// ============================================

import { Resend } from 'resend'

// Lazy initialization um Build-Fehler zu vermeiden
let resendClient: Resend | null = null

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY || 'dummy_key')
  }
  return resendClient
}

export interface EmailParams {
  to: string | string[]
  subject: string
  body: string
  html?: string
  attachments?: {
    filename: string
    content: Buffer
  }[]
  from?: string
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// Resend Trial: Kann nur an diese verifizierte E-Mail senden
const VERIFIED_EMAIL = 'bernhard.strobl@kph-es.at'

export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  try {
    // Validierung
    if (!params.to || !params.subject) {
      return { success: false, error: 'Empfänger und Betreff erforderlich' }
    }

    const originalTo = Array.isArray(params.to) ? params.to.join(', ') : params.to

    // RESEND TRIAL WORKAROUND:
    // Sende alle E-Mails an die verifizierte Adresse
    // mit dem Original-Empfänger im Betreff
    const isTrialMode = !process.env.RESEND_DOMAIN_VERIFIED
    const actualTo = isTrialMode ? VERIFIED_EMAIL : originalTo
    const actualSubject = isTrialMode && originalTo !== VERIFIED_EMAIL
      ? `[Für: ${originalTo}] ${params.subject}`
      : params.subject

    // Füge Weiterleite-Hinweis hinzu wenn Trial Mode
    const bodyWithHint = isTrialMode && originalTo !== VERIFIED_EMAIL
      ? `📧 WEITERLEITEN AN: ${originalTo}\n${'─'.repeat(40)}\n\n${params.body}`
      : params.body

    const { data, error } = await getResend().emails.send({
      from: params.from || 'MOI <onboarding@resend.dev>',
      to: [actualTo],
      subject: actualSubject,
      text: bodyWithHint,
      html: params.html || formatEmailHtml(params.subject, bodyWithHint, isTrialMode ? originalTo : undefined),
      attachments: params.attachments?.map(a => ({
        filename: a.filename,
        content: a.content
      }))
    })

    if (error) {
      console.error('Resend error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, messageId: data?.id }

  } catch (error: any) {
    console.error('Email send error:', error)
    return { success: false, error: error.message || 'E-Mail konnte nicht gesendet werden' }
  }
}

// HTML Template für E-Mails
function formatEmailHtml(subject: string, body: string, forwardTo?: string): string {
  const formattedBody = body
    .split('\n')
    .map(line => `<p style="margin: 0 0 10px 0;">${line}</p>`)
    .join('')

  const forwardBanner = forwardTo ? `
  <div style="background: #ff9800; padding: 15px; border-radius: 10px 10px 0 0; text-align: center;">
    <p style="color: white; margin: 0; font-size: 16px; font-weight: bold;">📧 WEITERLEITEN AN: ${forwardTo}</p>
  </div>` : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${forwardBanner}
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; ${forwardTo ? '' : 'border-radius: 10px 10px 0 0;'}">
    <h1 style="color: white; margin: 0; font-size: 24px;">${subject}</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    ${formattedBody}
  </div>
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p>Gesendet mit ❤️ von MOI</p>
  </div>
</body>
</html>`
}

// E-Mail-Adresse aus Namen/Kontext extrahieren (AI-unterstützt)
export function extractEmailFromText(text: string): string | null {
  // Direkte E-Mail-Adresse
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/
  const match = text.match(emailRegex)
  if (match) return match[0]

  return null
}

// Kontakt-Lookup (für spätere CRM-Integration)
export async function lookupContactEmail(name: string, userId: number): Promise<string | null> {
  // TODO: Aus Supabase contacts Tabelle laden
  // Für jetzt: null zurückgeben
  return null
}
