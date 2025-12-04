import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!

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
  await supabase
    .from('conversations')
    .insert({
      telegram_id: telegramId,
      role,
      content,
      created_at: new Date().toISOString()
    })
}

// Letzte N Nachrichten holen (für Kontext)
export async function getConversationHistory(telegramId: number, limit: number = 10): Promise<ConversationMessage[]> {
  const { data } = await supabase
    .from('conversations')
    .select('role, content, created_at')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  // Umkehren für chronologische Reihenfolge
  return data.reverse().map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    timestamp: msg.created_at
  }))
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
