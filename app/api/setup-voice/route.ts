import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/setup-voice - Creates voice tables
export async function GET() {
  try {
    // Create voice_users table
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS voice_users (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          phone TEXT UNIQUE NOT NULL,
          email TEXT,
          credits INTEGER DEFAULT 3,
          delivery_preference TEXT DEFAULT 'sms',
          telegram_id BIGINT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    })

    // Fallback: Direct insert to test
    const { error: testError } = await supabase
      .from('voice_users')
      .select('count')
      .limit(1)

    // If table doesn't exist, we need to create it via Supabase Dashboard
    if (testError && testError.code === '42P01') {
      return NextResponse.json({
        success: false,
        message: 'Tables need to be created in Supabase Dashboard',
        sql: `
-- Run this SQL in Supabase SQL Editor:

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
        `
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Voice tables exist or created successfully'
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    })
  }
}
