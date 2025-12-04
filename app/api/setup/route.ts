// SETUP ENDPOINT - Erstellt die conversations Tabelle
// Einmal aufrufen: https://deine-app.vercel.app/api/setup
// WICHTIG: Nach dem Setup diese Datei löschen!

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Prüfen ob Tabelle existiert
    const { data: existing, error: checkError } = await supabase
      .from('conversations')
      .select('id')
      .limit(1)

    if (!checkError) {
      return NextResponse.json({
        success: true,
        message: 'Tabelle existiert bereits!',
        status: 'ready'
      })
    }

    // Tabelle erstellen via SQL
    // Supabase JS Client kann kein raw SQL, also nutzen wir einen Workaround:
    // Wir insertten einen Dummy-Datensatz - wenn die Tabelle nicht existiert,
    // muss sie manuell erstellt werden

    return NextResponse.json({
      success: false,
      message: 'Tabelle muss manuell erstellt werden',
      sql: `
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_telegram_id
  ON conversations(telegram_id, created_at DESC);
      `,
      instructions: 'Gehe zu https://supabase.com/dashboard/project/qkcukdgrqncahpvrrxtm/sql und führe das SQL aus'
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    })
  }
}
