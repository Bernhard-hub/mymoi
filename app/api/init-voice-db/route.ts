import { NextResponse } from 'next/server'
import { Pool } from 'pg'

// GET /api/init-voice-db - Creates voice tables via direct Postgres
export async function GET() {
  // Connection String von Supabase Dashboard
  const connectionString = process.env.DATABASE_URL ||
    'postgresql://postgres:9La7pNpK33z2ULRA@db.qkcukdgrqncahpvrrxtm.supabase.co:5432/postgres'

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  })

  try {
    const client = await pool.connect()
    console.log('Connected to Supabase Postgres!')

    // Create voice_users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS voice_users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        credits INTEGER DEFAULT 3,
        delivery_preference TEXT DEFAULT 'sms',
        telegram_id BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create voice_interactions table
    await client.query(`
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
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_voice_users_phone ON voice_users(phone)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_voice_interactions_phone ON voice_interactions(phone)')

    // Verify
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'voice%'
    `)

    client.release()
    await pool.end()

    return NextResponse.json({
      success: true,
      message: 'Voice tables created!',
      tables: result.rows.map(r => r.table_name)
    })

  } catch (error: any) {
    console.error('DB Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      hint: 'Make sure DATABASE_URL is set in Vercel ENV'
    }, { status: 500 })
  }
}
