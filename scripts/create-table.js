// Run this locally: node scripts/create-table.js
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:9La7pNpK33z2ULRA@db.qkcukdgrqncahpvrrxtm.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function createTable() {
  try {
    await client.connect();
    console.log('✅ Connected to Supabase!');

    const sql = `
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_telegram_id
        ON conversations(telegram_id, created_at DESC);
    `;

    await client.query(sql);
    console.log('✅ Table "conversations" created!');

    // Verify
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations'"
    );

    if (result.rows.length > 0) {
      console.log('✅ Verified: Table exists!');
    }

    await client.end();
    console.log('✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTable();
