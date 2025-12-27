import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\\n/g, '').trim()
const supabaseKey = (process.env.SUPABASE_SERVICE_KEY || '').replace(/\\n/g, '').trim()

export const supabase = createClient(supabaseUrl, supabaseKey)

// User anlegen oder holen
export async function getOrCreateUser(telegramId: number, name?: string) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()

  if (existing) return existing

  const { data: newUser } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      name: name || 'Unknown',
      credits: 3, // 3 kostenlose Assets
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  return newUser
}

// Credits prüfen und abziehen
export async function useCredit(telegramId: number): Promise<boolean> {
  const { data: user } = await supabase
    .from('users')
    .select('credits')
    .eq('telegram_id', telegramId)
    .single()

  if (!user || user.credits <= 0) return false

  await supabase
    .from('users')
    .update({ credits: user.credits - 1 })
    .eq('telegram_id', telegramId)

  return true
}

// Asset speichern
export async function saveAsset(telegramId: number, type: string, title: string, content: string, fileUrl?: string) {
  const { data } = await supabase
    .from('assets')
    .insert({
      telegram_id: telegramId,
      type,
      title,
      content,
      file_url: fileUrl,
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  return data
}

// Datei hochladen
export async function uploadFile(fileName: string, fileBuffer: Buffer, contentType: string) {
  const { data, error } = await supabase.storage
    .from('assets')
    .upload(fileName, fileBuffer, { contentType })

  if (error) throw error

  const { data: urlData } = supabase.storage
    .from('assets')
    .getPublicUrl(fileName)

  return urlData.publicUrl
}

// ============================================
// KONVERSATIONS-HISTORY - MOI erinnert sich!
// ============================================

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// Nachricht zur History hinzufügen
export async function addToHistory(telegramId: number, role: 'user' | 'assistant', content: string) {
  try {
    await supabase
      .from('conversations')
      .insert({
        telegram_id: telegramId,
        role,
        content,
        created_at: new Date().toISOString()
      })
  } catch (e) {
    // Graceful fail wenn Tabelle nicht existiert
    console.log('History not available yet')
  }
}

// Letzte N Nachrichten holen (für Kontext)
export async function getConversationHistory(telegramId: number, limit: number = 10): Promise<ConversationMessage[]> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('role, content, created_at')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    // Umkehren für chronologische Reihenfolge
    return data.reverse().map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.created_at
    }))
  } catch (e) {
    return []
  }
}

// History für AI-Kontext formatieren
export async function getContextForAI(telegramId: number): Promise<string> {
  const history = await getConversationHistory(telegramId, 6) // Letzte 6 Nachrichten

  if (history.length === 0) return ''

  const formatted = history.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'MOI'
    return `${role}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`
  }).join('\n')

  return `\n\n[VORHERIGE KONVERSATION - Für Kontext]\n${formatted}\n[ENDE KONVERSATION]`
}

// User-Präferenzen speichern
export async function updateUserPreferences(telegramId: number, preferences: Record<string, any>) {
  await supabase
    .from('users')
    .update({ preferences })
    .eq('telegram_id', telegramId)
}

// User-Präferenzen holen
export async function getUserPreferences(telegramId: number): Promise<Record<string, any>> {
  const { data } = await supabase
    .from('users')
    .select('preferences')
    .eq('telegram_id', telegramId)
    .single()

  return data?.preferences || {}
}

// ============================================
// KONTAKTE - CRM Lite für MOI
// ============================================

export interface Contact {
  id?: string
  telegram_id: number
  name: string
  email?: string
  phone?: string
  company?: string
  notes?: string
  created_at?: string
}

// Kontakt speichern
export async function saveContact(telegramId: number, contact: Omit<Contact, 'telegram_id' | 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      telegram_id: telegramId,
      ...contact,
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    console.error('Save contact error:', error)
    return null
  }
  return data
}

// Kontakt nach Name suchen
export async function findContactByName(telegramId: number, name: string): Promise<Contact | null> {
  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('telegram_id', telegramId)
    .ilike('name', `%${name}%`)
    .limit(1)
    .single()

  return data || null
}

// Kontakt nach E-Mail suchen
export async function findContactByEmail(telegramId: number, email: string): Promise<Contact | null> {
  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('telegram_id', telegramId)
    .ilike('email', `%${email}%`)
    .limit(1)
    .single()

  return data || null
}

// Alle Kontakte eines Users
export async function getContacts(telegramId: number): Promise<Contact[]> {
  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('name', { ascending: true })

  return data || []
}

// E-Mail zu Name finden (für Chain Actions)
export async function lookupEmailByName(telegramId: number, name: string): Promise<string | null> {
  const contact = await findContactByName(telegramId, name)
  return contact?.email || null
}

// ============================================
// REMINDERS - MOI erinnert dich!
// ============================================

export interface Reminder {
  id?: string
  telegram_id: number
  message: string
  remind_at: string  // ISO timestamp
  sent: boolean
  created_at?: string
}

// Reminder erstellen
export async function createReminder(telegramId: number, message: string, remindAt: Date) {
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      telegram_id: telegramId,
      message,
      remind_at: remindAt.toISOString(),
      sent: false,
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    console.error('Create reminder error:', error)
    return null
  }
  return data
}

// Fällige Reminders holen (für Cron-Job)
export async function getDueReminders(): Promise<Reminder[]> {
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('reminders')
    .select('*')
    .eq('sent', false)
    .lte('remind_at', now)

  return data || []
}

// Reminder als gesendet markieren
export async function markReminderSent(reminderId: string) {
  await supabase
    .from('reminders')
    .update({ sent: true })
    .eq('id', reminderId)
}

// User Reminders anzeigen
export async function getUserReminders(telegramId: number): Promise<Reminder[]> {
  const { data } = await supabase
    .from('reminders')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('sent', false)
    .order('remind_at', { ascending: true })

  return data || []
}

// ============================================
// PAYMENTS - Credits Tracking
// ============================================

export interface Payment {
  id?: string
  telegram_id: number
  amount: number      // in cents
  credits: number
  package_id: string
  status: 'pending' | 'completed' | 'failed'
  stripe_session_id?: string
  created_at?: string
}

// Payment erstellen
export async function createPayment(telegramId: number, packageId: string, amount: number, credits: number, stripeSessionId?: string) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      telegram_id: telegramId,
      package_id: packageId,
      amount,
      credits,
      status: 'pending',
      stripe_session_id: stripeSessionId,
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    console.error('Create payment error:', error)
    return null
  }
  return data
}

// Payment abschließen
export async function completePayment(stripeSessionId: string) {
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('stripe_session_id', stripeSessionId)
    .single()

  if (!payment) return null

  // Status updaten
  await supabase
    .from('payments')
    .update({ status: 'completed' })
    .eq('id', payment.id)

  // Credits gutschreiben
  const { data: user } = await supabase
    .from('users')
    .select('credits')
    .eq('telegram_id', payment.telegram_id)
    .single()

  if (user) {
    await supabase
      .from('users')
      .update({ credits: user.credits + payment.credits })
      .eq('telegram_id', payment.telegram_id)
  }

  return payment
}

// User Payments anzeigen
export async function getUserPayments(telegramId: number): Promise<Payment[]> {
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })

  return data || []
}
