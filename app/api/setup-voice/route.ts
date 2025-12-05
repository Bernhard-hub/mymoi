import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Direct SQL execution via Supabase Management API
async function executeSQL(sql: string) {
  const supabaseUrl = process.env.SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!

  // Use the database directly via pg endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  })

  return response.json()
}

// GET /api/setup-voice - Creates voice tables
export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const results: string[] = []

  try {
    // Test if voice_users exists
    const { error: testError } = await supabase
      .from('voice_users')
      .select('phone')
      .limit(1)

    if (testError && testError.code === '42P01') {
      // Table doesn't exist - return SQL to run manually
      return NextResponse.json({
        success: false,
        message: 'Voice tables need to be created. Run this SQL in Supabase Dashboard → SQL Editor:',
        dashboard_url: 'https://supabase.com/dashboard/project/qkcukdgrqncahpvrrxtm/sql/new',
        sql: `-- MOI Voice Tables
-- Copy and paste this entire block into Supabase SQL Editor

CREATE TABLE IF NOT EXISTS voice_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  credits INTEGER DEFAULT 3,
  delivery_preference TEXT DEFAULT 'sms',
  telegram_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_interactions (
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_users_phone ON voice_users(phone);
CREATE INDEX IF NOT EXISTS idx_voice_interactions_phone ON voice_interactions(phone);
CREATE INDEX IF NOT EXISTS idx_voice_interactions_created ON voice_interactions(created_at);

-- Verify tables created
SELECT 'voice_users' as table_name, count(*) as rows FROM voice_users
UNION ALL
SELECT 'voice_interactions', count(*) FROM voice_interactions;`
      })
    }

    results.push('voice_users table exists')

    // Test voice_interactions
    const { error: testError2 } = await supabase
      .from('voice_interactions')
      .select('phone')
      .limit(1)

    if (testError2 && testError2.code === '42P01') {
      results.push('voice_interactions table MISSING - run SQL above')
    } else {
      results.push('voice_interactions table exists')
    }

    return NextResponse.json({
      success: true,
      message: 'Voice tables check complete',
      results
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    })
  }
}
