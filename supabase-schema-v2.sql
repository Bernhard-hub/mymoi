-- ============================================
-- MYMOI Database Schema v2
-- Neue Tabellen: contacts, reminders, payments
-- ============================================

-- CONTACTS - CRM Lite für MOI
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_telegram_id ON contacts(telegram_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(telegram_id, name);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(telegram_id, email);

-- REMINDERS - MOI erinnert dich!
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_telegram_id ON reminders(telegram_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(sent, remind_at);

-- PAYMENTS - Zahlungs-Tracking
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  amount INTEGER NOT NULL,  -- in cents
  credits INTEGER NOT NULL,
  package_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, completed, failed
  stripe_session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_telegram_id ON payments(telegram_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_session ON payments(stripe_session_id);

-- Users Tabelle erweitern (falls preferences fehlt)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
