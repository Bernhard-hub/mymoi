// One-Click Table Setup
// Erstellt fehlende Tabellen über direktes SQL via Supabase REST API

import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!

export async function GET() {
  // Da Supabase JS Client kein DDL kann, geben wir das SQL zurück
  // Das muss der User im Dashboard ausführen

  const sql = `-- MOI Tabellen Setup
-- Kopiere dieses SQL und führe es aus unter:
-- https://supabase.com/dashboard/project/qkcukdgrqncahpvrrxtm/sql/new

-- CONTACTS - CRM für MOI
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

-- REMINDERS - Erinnerungen
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
`

  // HTML Response mit Copy-Button
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>MOI Database Setup</title>
  <style>
    body {
      font-family: -apple-system, system-ui, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #667eea; }
    pre {
      background: #16213e;
      padding: 20px;
      border-radius: 10px;
      overflow-x: auto;
      border: 1px solid #667eea;
    }
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 30px;
      border: none;
      border-radius: 10px;
      font-size: 18px;
      cursor: pointer;
      margin: 10px 5px 10px 0;
      text-decoration: none;
      display: inline-block;
    }
    .btn:hover { opacity: 0.9; }
    .btn-secondary {
      background: #333;
    }
    .status {
      padding: 15px;
      border-radius: 10px;
      margin: 20px 0;
    }
    .status.warning { background: #ff9800; color: #000; }
    .status.success { background: #4CAF50; }
  </style>
</head>
<body>
  <h1>🗄️ MOI Database Setup</h1>

  <div class="status warning">
    ⚠️ <strong>Fehlende Tabellen:</strong> contacts, reminders
  </div>

  <h2>Schritt 1: SQL kopieren</h2>
  <pre id="sql">${sql}</pre>
  <button class="btn" onclick="copySQL()">📋 SQL kopieren</button>

  <h2>Schritt 2: Im Supabase Dashboard ausführen</h2>
  <a href="https://supabase.com/dashboard/project/qkcukdgrqncahpvrrxtm/sql/new" target="_blank" class="btn">
    🚀 Supabase SQL Editor öffnen
  </a>

  <h2>Schritt 3: Prüfen</h2>
  <a href="/api/init-db" class="btn btn-secondary">✅ Tabellen prüfen</a>

  <script>
    function copySQL() {
      navigator.clipboard.writeText(document.getElementById('sql').textContent);
      alert('SQL kopiert!');
    }
  </script>
</body>
</html>
`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
