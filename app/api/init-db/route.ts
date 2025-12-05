// Database Initialization Endpoint
// Aufruf: GET https://your-app.vercel.app/api/init-db
// Prüft und zeigt Status aller benötigten Tabellen

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: { schema: 'public' },
    auth: { persistSession: false }
  }
)

const REQUIRED_TABLES = ['users', 'assets', 'conversations', 'contacts', 'reminders', 'payments']

async function checkTable(name: string): Promise<{ exists: boolean; error?: string }> {
  const { error } = await supabaseAdmin.from(name).select('*').limit(1)
  if (!error) return { exists: true }
  if (error.code === '42P01' || error.message.includes('does not exist')) {
    return { exists: false }
  }
  return { exists: false, error: error.message }
}

export async function GET() {
  const tableStatus: Record<string, boolean> = {}
  const missingTables: string[] = []

  for (const table of REQUIRED_TABLES) {
    const result = await checkTable(table)
    tableStatus[table] = result.exists
    if (!result.exists) missingTables.push(table)
  }

  const allReady = missingTables.length === 0

  // SQL für fehlende Tabellen
  const sqlStatements: Record<string, string> = {
    users: `CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  credits INTEGER DEFAULT 3,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`,
    assets: `CREATE TABLE IF NOT EXISTS assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  content TEXT,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_telegram_id ON assets(telegram_id);`,
    conversations: `CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_telegram_id ON conversations(telegram_id, created_at DESC);`,
    contacts: `CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_telegram_id ON contacts(telegram_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(telegram_id, name);`,
    reminders: `CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_telegram_id ON reminders(telegram_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(sent, remind_at);`,
    payments: `CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  package_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  stripe_session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_telegram_id ON payments(telegram_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_session_id);`
  }

  // Generiere SQL für alle fehlenden Tabellen
  const missingSql = missingTables.map(t => sqlStatements[t]).join('\n\n')

  return NextResponse.json({
    success: allReady,
    status: allReady ? '✅ Alle Tabellen bereit!' : '⚠️ Fehlende Tabellen',
    tables: tableStatus,
    missing: missingTables,
    ...(missingTables.length > 0 && {
      action_required: 'Führe dieses SQL im Supabase Dashboard aus:',
      sql: missingSql,
      dashboard_url: 'https://supabase.com/dashboard/project/qkcukdgrqncahpvrrxtm/sql/new'
    })
  })
}
