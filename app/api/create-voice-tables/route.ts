import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Diese Route erstellt die Voice-Tabellen durch direktes Einfügen von Dummy-Daten
// Supabase erstellt die Tabelle automatisch wenn sie nicht existiert (mit richtigen Einstellungen)

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://qkcukdgrqncahpvrrxtm.supabase.co'
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ''

  if (!supabaseKey) {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_KEY' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'public' },
    auth: { persistSession: false }
  })

  const results: any[] = []

  try {
    // Versuche aus voice_users zu lesen
    const { data: existingUsers, error: checkError } = await supabase
      .from('voice_users')
      .select('id')
      .limit(1)

    if (checkError) {
      results.push({
        table: 'voice_users',
        status: 'NOT EXISTS',
        error: checkError.message,
        code: checkError.code
      })
    } else {
      results.push({
        table: 'voice_users',
        status: 'EXISTS',
        rows: existingUsers?.length || 0
      })
    }

    // Versuche aus voice_interactions zu lesen
    const { data: existingInteractions, error: checkError2 } = await supabase
      .from('voice_interactions')
      .select('id')
      .limit(1)

    if (checkError2) {
      results.push({
        table: 'voice_interactions',
        status: 'NOT EXISTS',
        error: checkError2.message,
        code: checkError2.code
      })
    } else {
      results.push({
        table: 'voice_interactions',
        status: 'EXISTS',
        rows: existingInteractions?.length || 0
      })
    }

    // Wenn Tabellen nicht existieren, gib SQL zurück
    const missingTables = results.filter(r => r.status === 'NOT EXISTS')

    if (missingTables.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Tabellen fehlen! Bitte SQL in Supabase ausführen.',
        results,
        action_required: {
          url: 'https://supabase.com/dashboard/project/qkcukdgrqncahpvrrxtm/sql/new',
          sql: `-- Voice Tabellen für MOI
CREATE TABLE voice_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  credits INTEGER DEFAULT 3,
  delivery_preference TEXT DEFAULT 'sms',
  telegram_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE voice_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  call_sid TEXT,
  transcript TEXT,
  asset_type TEXT,
  asset_title TEXT,
  asset_content TEXT,
  file_url TEXT,
  delivery_method TEXT,
  duration INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voice_users_phone ON voice_users(phone);
CREATE INDEX idx_voice_interactions_phone ON voice_interactions(phone);`
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Alle Voice-Tabellen existieren!',
      results
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      results
    }, { status: 500 })
  }
}
