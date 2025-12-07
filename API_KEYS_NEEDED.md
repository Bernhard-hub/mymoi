# MOI - Fehlende API Keys

## Status: Was funktioniert bereits

| Feature | Status | API Key |
|---------|--------|---------|
| Voice Input | ✅ | GROQ_API_KEY |
| AI Antworten | ✅ | ANTHROPIC_API_KEY |
| Text-to-Speech | ✅ | OPENAI_API_KEY |
| Bildgenerierung | ✅ | TOGETHER_API_KEY |
| SMS/WhatsApp | ✅ | TWILIO Keys |
| E-Mail | ✅ | RESEND_API_KEY |

---

## Creative Studio - Fehlende Keys

### 1. Runway ML (Video Generation)
- **Key:** `RUNWAY_API_KEY`
- **Link:** https://runwayml.com/
- **Anmeldung:** https://app.runwayml.com/
- **API Docs:** https://docs.runwayml.com/
- **Kosten:** ~$0.05-0.20 pro Sekunde Video

### 2. Luma AI (Video/3D)
- **Key:** `LUMA_API_KEY`
- **Link:** https://lumalabs.ai/
- **Anmeldung:** https://lumalabs.ai/dream-machine
- **API Docs:** https://docs.lumalabs.ai/
- **Kosten:** Pay-per-use

### 3. Suno (Musik Generation)
- **Key:** `SUNO_API_KEY`
- **Link:** https://suno.ai/
- **Anmeldung:** https://app.suno.ai/
- **API:** Via Suno API oder Replicate
- **Kosten:** ~$0.10 pro Song

### 4. ElevenLabs (Voice Cloning)
- **Key:** `ELEVENLABS_API_KEY`
- **Link:** https://elevenlabs.io/
- **Anmeldung:** https://elevenlabs.io/sign-up
- **API Docs:** https://docs.elevenlabs.io/
- **Kosten:** Free Tier verfügbar, dann ~$5/Monat

### 5. Meshy (3D Model Generation)
- **Key:** `MESHY_API_KEY`
- **Link:** https://www.meshy.ai/
- **Anmeldung:** https://www.meshy.ai/
- **API Docs:** https://docs.meshy.ai/
- **Kosten:** ~$0.30 pro 3D Model

---

## Collaboration Tools - Fehlende Keys

### 6. Canva
- **Key:** `CANVA_API_KEY`
- **Link:** https://www.canva.com/developers/
- **Anmeldung:** https://www.canva.com/developers/apps
- **API Docs:** https://www.canva.dev/docs/connect/
- **Kosten:** Free Tier, Pro ab $12.99/Monat

### 7. Miro
- **Key:** `MIRO_ACCESS_TOKEN`
- **Link:** https://miro.com/
- **Anmeldung:** https://miro.com/app/settings/user-profile/apps
- **API Docs:** https://developers.miro.com/docs
- **Kosten:** Free Tier (3 Boards), dann $8/Monat

### 8. Zoom
- **Key:** `ZOOM_ACCESS_TOKEN`
- **Link:** https://marketplace.zoom.us/
- **Anmeldung:** https://marketplace.zoom.us/develop/create
- **API Docs:** https://developers.zoom.us/docs/api/
- **Kosten:** Free Tier (40 Min), Pro $14.99/Monat

### 9. Figma
- **Key:** `FIGMA_ACCESS_TOKEN`
- **Link:** https://www.figma.com/developers
- **Anmeldung:** https://www.figma.com/developers/api#access-tokens
- **API Docs:** https://www.figma.com/developers/api
- **Kosten:** Free Tier (3 Files), Pro $12/Monat

### 10. Notion
- **Key:** `NOTION_API_KEY`
- **Link:** https://www.notion.so/my-integrations
- **Anmeldung:** https://www.notion.so/my-integrations (neue Integration erstellen)
- **API Docs:** https://developers.notion.com/
- **Kosten:** Free Tier, Plus $8/Monat

### 11. Airtable
- **Key:** `AIRTABLE_API_KEY`
- **Link:** https://airtable.com/account
- **Anmeldung:** https://airtable.com/create/tokens
- **API Docs:** https://airtable.com/developers/web/api/introduction
- **Kosten:** Free Tier (1200 Records), Pro $20/Monat

### 12. Genially
- **Key:** `GENIALLY_API_KEY`
- **Link:** https://genial.ly/
- **Anmeldung:** https://app.genial.ly/
- **API:** Enterprise Plan erforderlich
- **Kosten:** Basic $7.49/Monat

---

## Office Integration - Fehlende Keys

### 13. Microsoft 365
- **Keys:** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
- **Link:** https://portal.azure.com/
- **Anmeldung:** Azure Portal > App registrations > New registration
- **API Docs:** https://learn.microsoft.com/en-us/graph/overview
- **Kosten:** In Microsoft 365 Abo enthalten

### 14. Google Workspace
- **Keys:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Link:** https://console.cloud.google.com/
- **Anmeldung:** Google Cloud Console > APIs & Services > Credentials
- **API Docs:** https://developers.google.com/workspace
- **Kosten:** In Google Account enthalten

---

## Quick Setup Checkliste

```
[ ] Runway ML      - https://app.runwayml.com/
[ ] Luma AI        - https://lumalabs.ai/dream-machine
[ ] Suno           - https://app.suno.ai/
[ ] ElevenLabs     - https://elevenlabs.io/sign-up
[ ] Meshy          - https://www.meshy.ai/
[ ] Canva          - https://www.canva.com/developers/apps
[ ] Miro           - https://miro.com/app/settings/user-profile/apps
[ ] Zoom           - https://marketplace.zoom.us/develop/create
[ ] Figma          - https://www.figma.com/developers/api#access-tokens
[ ] Notion         - https://www.notion.so/my-integrations
[ ] Airtable       - https://airtable.com/create/tokens
[ ] Microsoft 365  - https://portal.azure.com/
[ ] Google Cloud   - https://console.cloud.google.com/
```

---

## So fügst du Keys zu Vercel hinzu

```bash
# Einzeln hinzufügen
npx vercel env add RUNWAY_API_KEY production
npx vercel env add ELEVENLABS_API_KEY production
# ... etc

# Nach dem Hinzufügen neu deployen
npx vercel --prod --yes
npx vercel alias [deployment-url] mymoi.app
```

---

## Priorität (Empfehlung)

**Hoch (sofort nützlich):**
1. ElevenLabs - Voice Cloning für personalisierte Stimmen
2. Notion - Dokumentation und Wissensbasis

**Mittel (nice to have):**
3. Canva - Design Automation
4. Miro - Brainstorming
5. Runway ML - Video Generation

**Niedrig (später):**
6. Alle anderen je nach Bedarf

---

*Stand: Dezember 2024*
*Alle Links führen direkt zur Registrierung/API-Key-Seite*
