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
export async function saveAsset(telegramId: number, type: string, content: string, fileUrl?: string) {
  const { data } = await supabase
    .from('assets')
    .insert({
      telegram_id: telegramId,
      type,
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
