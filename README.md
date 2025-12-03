# Moi

**Du sprichst. Es entsteht.**

Sprachnachricht an Telegram → Fertiges Asset zurück.

---

## Setup (10 Minuten)

### 1. Telegram Bot erstellen

1. Öffne [@BotFather](https://t.me/BotFather) in Telegram
2. Sende `/newbot`
3. Name: `Moi`
4. Username: `MoiAssistantBot` (oder was frei ist)
5. Kopiere den Token

### 2. Supabase einrichten

1. [supabase.com](https://supabase.com) → New Project
2. SQL Editor → Neue Query:

```sql
-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  credits INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Assets
CREATE TABLE assets (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('assets', 'assets', true);
```

3. Settings → API → Kopiere URL + Service Key

### 3. Groq API Key (kostenlos)

1. [console.groq.com](https://console.groq.com)
2. API Keys → Create
3. Kopiere den Key

### 4. Anthropic API Key

1. [console.anthropic.com](https://console.anthropic.com)
2. API Keys → Create
3. Kopiere den Key

### 5. Vercel deployen

```bash
# Repo klonen
git clone https://github.com/DEIN-USERNAME/moi.git
cd moi
npm install

# Oder direkt auf Vercel:
```

1. [vercel.com](https://vercel.com) → Import Git Repository
2. Environment Variables setzen (aus .env.example)
3. Deploy

### 6. Telegram Webhook verbinden

Nach dem Deploy:

```
https://api.telegram.org/bot<DEIN_TOKEN>/setWebhook?url=https://moi.vercel.app/api/telegram
```

---

## Fertig!

Öffne deinen Bot in Telegram und schick eine Sprachnachricht.

---

## Kosten

| Service | Kosten |
|---------|--------|
| Vercel | 0€ |
| Supabase | 0€ |
| Telegram | 0€ |
| Groq Whisper | 0€ |
| Claude API | ~0,03€/Asset |

**Break-even: 2 zahlende User/Monat**

---

## Lizenz

MIT
