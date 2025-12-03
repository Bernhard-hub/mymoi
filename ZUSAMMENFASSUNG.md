# MOI – Zusammenfassung & Nächste Schritte

## Was ist Moi?

**"Du sprichst. Es entsteht."**

Ein persönlicher Agent der für dich handelt. Auf allen Kanälen. Lernt von selbst. Akquiriert von selbst.

---

## Die zwei Säulen

1. **Unergründlichkeit** – Magie. Niemand weiß wie. Niemand fragt.
2. **Userfreundlichkeit** – So simpel dass du nicht nachdenkst.

---

## Was Moi kann

| Input | Output |
|-------|--------|
| Sprachnachricht über Jacke | Fertiges eBay-Listing |
| "Workshop morgen für Lehrer" | Fertige Präsentation |
| "Ruf meinen Lieferanten an" | Anruf + Zusammenfassung |
| "Termin beim Friseur" | Anruf + Kalendereintrag |

---

## Techstack

- **Frontend:** Next.js auf Vercel (kostenlos)
- **Datenbank:** Supabase (kostenlos)
- **Bot:** Telegram (kostenlos) + Twilio (optional)
- **Speech-to-Text:** Groq Whisper (kostenlos)
- **KI:** Claude API (pay per use)

---

## Enthaltene Dateien

```
moi-complete/
├── CHATVERLAUF.md      ← Entstehungsgeschichte
├── ACQUISITION_PLAN.md ← Jahresplan für 50.000 User
├── README.md           ← Setup-Anleitung
├── .env.example        ← Benötigte API Keys
├── package.json        ← Dependencies
├── app/                ← Next.js Frontend
│   ├── page.tsx        ← Landingpage
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       └── telegram/
│           └── route.ts ← Telegram Webhook
├── lib/
│   ├── supabase.ts     ← Datenbank-Funktionen
│   ├── claude.ts       ← KI-Integration
│   └── pptx.ts         ← Präsentations-Generator
└── Config-Dateien
```

---

## Nächste Schritte

### Sofort (10 Minuten):

1. **Telegram Bot erstellen**
   - Öffne @BotFather in Telegram
   - Sende `/newbot`
   - Speichere den Token

2. **Supabase Projekt**
   - supabase.com → New Project
   - SQL aus README ausführen
   - URL + Service Key kopieren

3. **Groq Account**
   - console.groq.com
   - API Key erstellen (kostenlos)

4. **Anthropic Key**
   - Du hast bereits einen (EVIDENRA)

### Dann (5 Minuten):

5. **GitHub Repo erstellen**
   ```bash
   cd moi-complete
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create moi --public --push
   ```

6. **Vercel deployen**
   - vercel.com → Import GitHub Repo
   - Environment Variables eintragen
   - Deploy

7. **Webhook setzen**
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://DEIN-PROJEKT.vercel.app/api/telegram
   ```

### Danach:

8. **Testen**
   - Öffne deinen Bot in Telegram
   - Schicke eine Sprachnachricht
   - Staune

---

## Kontakt für API Keys

Schick mir die Keys sobald du sie hast:

- Telegram Bot Token
- Supabase URL + Service Key  
- Groq API Key
- (Anthropic hast du)
- GitHub Repo URL

Dann mache ich den Rest.

---

## Kosten Übersicht

| Was | Kosten |
|-----|--------|
| Hosting | 0€ |
| Datenbank | 0€ |
| Speech-to-Text | 0€ |
| Claude API | ~0,03€/Asset |

**Break-even: 2 zahlende User/Monat**

---

## Jahresziel

| Metrik | Ziel |
|--------|------|
| User | 50.000 |
| Umsatz | 1.500.000€ |
| Gewinn | 1.480.000€ |

---

> "Wir bauen es einmal. Dann wächst es. Alleine."

