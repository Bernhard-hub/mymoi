import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// INIT BRAIN - Erstellt Tabellen für MOI's Gehirn
// ============================================

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET() {
  const results: string[] = []

  // 1. User Knowledge Tabelle
  try {
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS user_knowledge (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL,
          term VARCHAR(255) NOT NULL,
          meaning TEXT NOT NULL,
          context TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, term)
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_user ON user_knowledge(user_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_term ON user_knowledge(term);
      `
    })
    if (error) throw error
    results.push('✅ user_knowledge Tabelle erstellt')
  } catch (e: any) {
    // Fallback: Direkt über REST
    try {
      await supabaseAdmin.from('user_knowledge').select('id').limit(1)
      results.push('✅ user_knowledge existiert bereits')
    } catch {
      results.push('⚠️ user_knowledge: Manuell erstellen')
    }
  }

  // 2. User Contacts Tabelle
  try {
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS user_contacts (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50),
          company VARCHAR(255),
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_user ON user_contacts(user_id);
        CREATE INDEX IF NOT EXISTS idx_contacts_name ON user_contacts(name);
      `
    })
    if (error) throw error
    results.push('✅ user_contacts Tabelle erstellt')
  } catch (e: any) {
    try {
      await supabaseAdmin.from('user_contacts').select('id').limit(1)
      results.push('✅ user_contacts existiert bereits')
    } catch {
      results.push('⚠️ user_contacts: Manuell erstellen')
    }
  }

  // 3. Pending Clarifications Tabelle
  try {
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS pending_clarifications (
          id VARCHAR(100) PRIMARY KEY,
          user_id BIGINT NOT NULL,
          phone VARCHAR(50),
          original_text TEXT NOT NULL,
          questions JSONB NOT NULL DEFAULT '[]',
          answers JSONB NOT NULL DEFAULT '{}',
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_clarify_user ON pending_clarifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_clarify_status ON pending_clarifications(status);
      `
    })
    if (error) throw error
    results.push('✅ pending_clarifications Tabelle erstellt')
  } catch (e: any) {
    try {
      await supabaseAdmin.from('pending_clarifications').select('id').limit(1)
      results.push('✅ pending_clarifications existiert bereits')
    } catch {
      results.push('⚠️ pending_clarifications: Manuell erstellen')
    }
  }

  // SQL für manuelles Erstellen
  const manualSQL = `
-- MOI Brain Tabellen (in Supabase SQL Editor ausführen)

-- 1. User Knowledge (Abkürzungen, Begriffe, etc.)
CREATE TABLE IF NOT EXISTS user_knowledge (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  term VARCHAR(255) NOT NULL,
  meaning TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, term)
);

-- 2. User Contacts (Personen, Firmen)
CREATE TABLE IF NOT EXISTS user_contacts (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 3. Pending Clarifications (Rückfragen)
CREATE TABLE IF NOT EXISTS pending_clarifications (
  id VARCHAR(100) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  phone VARCHAR(50),
  original_text TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  answers JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_knowledge_user ON user_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON user_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_clarify_user ON pending_clarifications(user_id);
  `

  return NextResponse.json({
    success: true,
    results,
    manualSQL,
    message: 'Falls Tabellen nicht automatisch erstellt wurden, kopiere das SQL in den Supabase SQL Editor'
  })
}
