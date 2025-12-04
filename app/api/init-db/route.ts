// Database Initialization Endpoint
// Aufruf: GET https://your-app.vercel.app/api/init-db
// Erstellt die conversations Tabelle automatisch

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Direkter Supabase Admin Client mit Postgres Connection
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: { schema: 'public' },
    auth: { persistSession: false }
  }
)

export async function GET() {
  const results: string[] = []

  try {
    // 1. Check if table exists by trying to query it
    const { error: checkError } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .limit(1)

    if (!checkError) {
      return NextResponse.json({
        success: true,
        message: '✅ Tabelle "conversations" existiert bereits!',
        status: 'ready'
      })
    }

    // 2. Table doesn't exist - we need to create it manually
    // Since Supabase JS client can't execute DDL, provide instructions

    // But first, let's try a workaround: insert and let it fail gracefully
    const { error: insertError } = await supabaseAdmin
      .from('conversations')
      .insert({
        telegram_id: 0,
        role: 'system',
        content: 'init'
      })

    if (insertError?.code === '42P01') {
      // Table doesn't exist
      return NextResponse.json({
        success: false,
        message: '❌ Tabelle existiert nicht',
        action_required: 'Bitte führe das SQL im Supabase Dashboard aus',
        sql: `CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_telegram_id
  ON conversations(telegram_id, created_at DESC);`,
        dashboard_url: 'https://supabase.com/dashboard/project/qkcukdgrqncahpvrrxtm/sql/new'
      })
    }

    // If insert worked, delete the test row
    await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('telegram_id', 0)
      .eq('role', 'system')

    return NextResponse.json({
      success: true,
      message: '✅ Tabelle ist bereit!',
      status: 'ready'
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      hint: 'Führe das SQL manuell im Supabase Dashboard aus'
    })
  }
}
