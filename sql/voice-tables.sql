-- ============================================
-- MOI VOICE - Datenbank Tabellen
-- ============================================
-- Führe dieses SQL in deinem Supabase SQL Editor aus

-- Voice Users (identifiziert durch Telefonnummer)
CREATE TABLE IF NOT EXISTS voice_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,           -- z.B. "+4366412345678"
  email TEXT,                           -- Optional für E-Mail Delivery
  credits INTEGER DEFAULT 3,            -- Startet mit 3 kostenlosen
  delivery_preference TEXT DEFAULT 'sms', -- 'sms', 'whatsapp', 'email'
  telegram_id BIGINT,                   -- Optional: Link zu Telegram User
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice Interaktionen (für Analytics & ML)
CREATE TABLE IF NOT EXISTS voice_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  call_sid TEXT,                        -- Twilio Call ID
  transcript TEXT,                      -- Was der User gesagt hat
  asset_type TEXT,                      -- 'listing', 'presentation', etc.
  asset_title TEXT,
  asset_content TEXT,                   -- Das generierte Asset
  file_url TEXT,                        -- Falls Datei (PPTX, PDF)
  delivery_method TEXT,                 -- 'sms', 'whatsapp', 'email'
  duration INTEGER,                     -- Anrufdauer in Sekunden
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_voice_users_phone ON voice_users(phone);
CREATE INDEX IF NOT EXISTS idx_voice_interactions_phone ON voice_interactions(phone);
CREATE INDEX IF NOT EXISTS idx_voice_interactions_created ON voice_interactions(created_at);

-- ============================================
-- OPTIONAL: Voice User mit Telegram verknüpfen
-- ============================================
-- Falls ein User sowohl Telegram als auch Voice nutzt,
-- können wir die Accounts verknüpfen:

-- Funktion um Voice User mit Telegram zu verknüpfen
CREATE OR REPLACE FUNCTION link_voice_to_telegram(
  p_phone TEXT,
  p_telegram_id BIGINT
) RETURNS void AS $$
BEGIN
  UPDATE voice_users
  SET telegram_id = p_telegram_id
  WHERE phone = p_phone;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Storage Bucket für Dateien (falls noch nicht vorhanden)
-- ============================================
-- Nur ausführen wenn Bucket noch nicht existiert:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('assets', 'assets', true)
-- ON CONFLICT (id) DO NOTHING;
