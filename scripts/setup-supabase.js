// Supabase Setup Script for MYMOI
// Run: node scripts/setup-supabase.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log(`
==========================================
MYMOI - Supabase Setup Instructions
==========================================

1. Create a new Supabase project at: https://supabase.com/dashboard

2. Go to Project Settings > API and copy:
   - Project URL
   - service_role (secret) key

3. Go to SQL Editor and run this schema:

------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  credits INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT REFERENCES users(telegram_id),
  type TEXT NOT NULL,
  title TEXT,
  content TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT REFERENCES users(telegram_id),
  amount_cents INTEGER NOT NULL,
  credits_added INTEGER NOT NULL,
  stripe_session_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_assets_telegram_id ON assets(telegram_id);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access" ON users FOR ALL USING (true);
CREATE POLICY "Service role access" ON assets FOR ALL USING (true);
CREATE POLICY "Service role access" ON payments FOR ALL USING (true);
------------------------------------------

4. Go to Storage and create a bucket named "assets" (public)

5. Create .env file in D:\\MYMOI with:

TELEGRAM_BOT_TOKEN=your_bot_token
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_KEY=your_service_key
GROQ_API_KEY=your_groq_key
ANTHROPIC_API_KEY=your_anthropic_key

==========================================
`);
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConnection() {
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error) {
      console.log('Tables not yet created. Please run the SQL schema first.');
    } else {
      console.log('Supabase connection successful!');
      console.log('Tables are ready.');
    }
  } catch (e) {
    console.error('Connection error:', e.message);
  }
}

checkConnection();
