import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET() {
  const { error } = await supabase.from('oauth_tokens').select('id').limit(1)
  if (error && error.code === '42P01') {
    return NextResponse.json({ 
      error: 'Table missing. Create in Supabase SQL editor:',
      sql: `CREATE TABLE oauth_tokens (id SERIAL PRIMARY KEY, provider VARCHAR(50) NOT NULL, email VARCHAR(255) NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at TIMESTAMP, user_data JSONB, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(provider, email));`
    })
  }
  return NextResponse.json({ success: true })
}
