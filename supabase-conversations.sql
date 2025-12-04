-- Conversations Tabelle für MOI History
-- Führe dieses SQL in deinem Supabase Dashboard aus

CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index für schnelle Abfragen
  CONSTRAINT fk_user FOREIGN KEY (telegram_id)
    REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Index für schnelle History-Abfragen
CREATE INDEX IF NOT EXISTS idx_conversations_telegram_id
  ON conversations(telegram_id, created_at DESC);

-- Optional: Preferences Spalte zur users Tabelle hinzufügen
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Alte Konversationen automatisch löschen (nach 30 Tagen)
-- Optional - für Datenschutz
-- CREATE OR REPLACE FUNCTION delete_old_conversations()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   DELETE FROM conversations WHERE created_at < NOW() - INTERVAL '30 days';
--   RETURN NULL;
-- END;
-- $$ LANGUAGE plpgsql;
