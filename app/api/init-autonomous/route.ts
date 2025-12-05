import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// INIT AUTONOMOUS - Tabellen für autonomes System
// ============================================

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET() {
  const results: string[] = []

  // SQL für alle Tabellen
  const tables = [
    {
      name: 'follow_ups',
      sql: `
        CREATE TABLE IF NOT EXISTS follow_ups (
          id VARCHAR(100) PRIMARY KEY,
          user_id BIGINT NOT NULL,
          phone VARCHAR(50),
          type VARCHAR(50),
          recipient_email VARCHAR(255),
          recipient_name VARCHAR(255),
          original_subject VARCHAR(500),
          original_content TEXT,
          follow_up_after_hours INT DEFAULT 72,
          follow_up_count INT DEFAULT 0,
          max_follow_ups INT DEFAULT 3,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          next_follow_up_at TIMESTAMP
        );
      `
    },
    {
      name: 'customer_notes',
      sql: `
        CREATE TABLE IF NOT EXISTS customer_notes (
          id VARCHAR(100) PRIMARY KEY,
          user_id BIGINT NOT NULL,
          customer_name VARCHAR(255) NOT NULL,
          customer_email VARCHAR(255),
          customer_phone VARCHAR(50),
          company VARCHAR(255),
          notes TEXT,
          tags JSONB DEFAULT '[]',
          deal_value DECIMAL(10,2),
          deal_status VARCHAR(50),
          next_action TEXT,
          next_action_date DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, customer_name)
        );
      `
    },
    {
      name: 'user_activities',
      sql: `
        CREATE TABLE IF NOT EXISTS user_activities (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL,
          action VARCHAR(255) NOT NULL,
          details JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: 'conversation_threads',
      sql: `
        CREATE TABLE IF NOT EXISTS conversation_threads (
          id VARCHAR(100) PRIMARY KEY,
          user_id BIGINT NOT NULL,
          contact_identifier VARCHAR(255) NOT NULL,
          contact_name VARCHAR(255),
          messages JSONB DEFAULT '[]',
          summary TEXT,
          last_activity TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, contact_identifier)
        );
      `
    },
    {
      name: 'auto_pilot_configs',
      sql: `
        CREATE TABLE IF NOT EXISTS auto_pilot_configs (
          user_id BIGINT PRIMARY KEY,
          enabled BOOLEAN DEFAULT false,
          allowed_actions JSONB DEFAULT '[]',
          require_approval BOOLEAN DEFAULT true,
          max_value_without_approval DECIMAL(10,2) DEFAULT 100,
          notify_on_action BOOLEAN DEFAULT true,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: 'morning_briefing_configs',
      sql: `
        CREATE TABLE IF NOT EXISTS morning_briefing_configs (
          user_id BIGINT PRIMARY KEY,
          enabled BOOLEAN DEFAULT false,
          phone VARCHAR(50),
          time VARCHAR(5) DEFAULT '08:00',
          location VARCHAR(100),
          include_weather BOOLEAN DEFAULT true,
          include_calendar BOOLEAN DEFAULT true,
          include_followups BOOLEAN DEFAULT true,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: 'collective_insights',
      sql: `
        CREATE TABLE IF NOT EXISTS collective_insights (
          id SERIAL PRIMARY KEY,
          category VARCHAR(50) NOT NULL,
          action VARCHAR(255),
          outcome VARCHAR(50),
          value DECIMAL(10,2),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: 'task_records',
      sql: `
        CREATE TABLE IF NOT EXISTS task_records (
          id VARCHAR(100) PRIMARY KEY,
          user_id BIGINT NOT NULL,
          task_type VARCHAR(50) NOT NULL,
          recipient VARCHAR(255),
          subject VARCHAR(500),
          content_hash VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'completed',
          result_summary TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: 'user_email_configs',
      sql: `
        CREATE TABLE IF NOT EXISTS user_email_configs (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL UNIQUE,
          provider VARCHAR(20) NOT NULL,
          email VARCHAR(255) NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          expires_at BIGINT NOT NULL,
          enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: 'calendar_events',
      sql: `
        CREATE TABLE IF NOT EXISTS calendar_events (
          id VARCHAR(100) PRIMARY KEY,
          user_id BIGINT NOT NULL,
          title VARCHAR(500) NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP NOT NULL,
          location VARCHAR(255),
          description TEXT,
          is_all_day BOOLEAN DEFAULT false,
          reminder_minutes INT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: 'sms_logs',
      sql: `
        CREATE TABLE IF NOT EXISTS sms_logs (
          id SERIAL PRIMARY KEY,
          phone VARCHAR(50) NOT NULL,
          message_sid VARCHAR(100),
          body TEXT,
          direction VARCHAR(20),
          created_at TIMESTAMP DEFAULT NOW()
        );
      `
    }
  ]

  // Tabellen erstellen
  for (const table of tables) {
    try {
      await supabaseAdmin.from(table.name).select('*').limit(1)
      results.push(`✅ ${table.name} existiert`)
    } catch {
      results.push(`⚠️ ${table.name}: Manuell erstellen`)
    }
  }

  // Vollständiges SQL für manuelles Setup
  const fullSQL = `
-- ============================================
-- MOI AUTONOMOUS SYSTEM - Alle Tabellen
-- ============================================
-- In Supabase SQL Editor ausführen!

-- 1. Follow-Ups (Auto-Nachfassen)
CREATE TABLE IF NOT EXISTS follow_ups (
  id VARCHAR(100) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  phone VARCHAR(50),
  type VARCHAR(50),
  recipient_email VARCHAR(255),
  recipient_name VARCHAR(255),
  original_subject VARCHAR(500),
  original_content TEXT,
  follow_up_after_hours INT DEFAULT 72,
  follow_up_count INT DEFAULT 0,
  max_follow_ups INT DEFAULT 3,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  next_follow_up_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_followups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_followups_next ON follow_ups(next_follow_up_at);

-- 2. Kunden-Notizen (Voice-to-CRM)
CREATE TABLE IF NOT EXISTS customer_notes (
  id VARCHAR(100) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  company VARCHAR(255),
  notes TEXT,
  tags JSONB DEFAULT '[]',
  deal_value DECIMAL(10,2),
  deal_status VARCHAR(50),
  next_action TEXT,
  next_action_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, customer_name)
);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customer_notes(user_id);

-- 3. User-Aktivitäten (für Muster-Erkennung)
CREATE TABLE IF NOT EXISTS user_activities (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activities_user ON user_activities(user_id);

-- 4. Konversations-Threads (Multi-Channel Sync)
CREATE TABLE IF NOT EXISTS conversation_threads (
  id VARCHAR(100) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  contact_identifier VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  messages JSONB DEFAULT '[]',
  summary TEXT,
  last_activity TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, contact_identifier)
);
CREATE INDEX IF NOT EXISTS idx_threads_user ON conversation_threads(user_id);

-- 5. Auto-Pilot Konfiguration
CREATE TABLE IF NOT EXISTS auto_pilot_configs (
  user_id BIGINT PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  allowed_actions JSONB DEFAULT '[]',
  require_approval BOOLEAN DEFAULT true,
  max_value_without_approval DECIMAL(10,2) DEFAULT 100,
  notify_on_action BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Morning Briefing Konfiguration
CREATE TABLE IF NOT EXISTS morning_briefing_configs (
  user_id BIGINT PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  phone VARCHAR(50),
  time VARCHAR(5) DEFAULT '08:00',
  location VARCHAR(100),
  include_weather BOOLEAN DEFAULT true,
  include_calendar BOOLEAN DEFAULT true,
  include_followups BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. Kollektive Insights (anonymisiert)
CREATE TABLE IF NOT EXISTS collective_insights (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  action VARCHAR(255),
  outcome VARCHAR(50),
  value DECIMAL(10,2),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insights_category ON collective_insights(category);

-- 8. Task Records (Erledigte Aufträge tracken)
CREATE TABLE IF NOT EXISTS task_records (
  id VARCHAR(100) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  recipient VARCHAR(255),
  subject VARCHAR(500),
  content_hash VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'completed',
  result_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON task_records(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_hash ON task_records(content_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON task_records(created_at);

-- 9. User Email Configs (für E-Mail-Zugriff)
CREATE TABLE IF NOT EXISTS user_email_configs (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  provider VARCHAR(20) NOT NULL, -- 'microsoft' oder 'google'
  email VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_configs_user ON user_email_configs(user_id);

-- 10. Calendar Events (lokaler Kalender)
CREATE TABLE IF NOT EXISTS calendar_events (
  id VARCHAR(100) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title VARCHAR(500) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  location VARCHAR(255),
  description TEXT,
  is_all_day BOOLEAN DEFAULT false,
  reminder_minutes INT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);

-- 11. SMS Logs (für Debugging)
CREATE TABLE IF NOT EXISTS sms_logs (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(50) NOT NULL,
  message_sid VARCHAR(100),
  body TEXT,
  direction VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_logs(phone);
`

  return NextResponse.json({
    success: true,
    results,
    sql: fullSQL,
    instructions: 'Kopiere das SQL in den Supabase SQL Editor und führe es aus!'
  })
}
