# 🤝 COLLABORATION & DESIGN TOOLS - Vollständige Dokumentation

## Übersicht

Professionelle Integration von 7 führenden Collaboration & Design Plattformen:

1. **Canva** - Design Automation
2. **Genially** - Interaktive Präsentationen
3. **Miro** - Whiteboard & Brainstorming
4. **Zoom** - Meetings & Webinare
5. **Figma** - Design Collaboration
6. **Notion** - Dokumente & Datenbanken
7. **Airtable** - Flexible Datenbanken

---

## 🎨 1. CANVA

### Features
- ✅ Design aus Templates
- ✅ Automatische Anpassungen
- ✅ Export (PNG, PDF, PPTX)
- ✅ Template-Suche

### API Setup

1. **Canva Developer Account:** https://www.canva.com/developers
2. **API Key generieren**
3. **In .env:**
```env
CANVA_API_KEY=your_api_key_here
```

### Design erstellen

```typescript
POST /api/collaborate
{
  "action": "canva:create",
  "params": {
    "templateId": "template_abc123",
    "designName": "Instagram Post - Produktlaunch",
    "customizations": {
      "text": {
        "headline": "Neues Produkt!",
        "body": "Jetzt verfügbar"
      },
      "images": {
        "product": "https://..."
      },
      "colors": {
        "primary": "#FF5733"
      }
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "design": {
    "id": "design_123",
    "name": "Instagram Post - Produktlaunch",
    "type": "instagram-post",
    "thumbnailUrl": "https://...",
    "editUrl": "https://canva.com/design/...",
    "exportUrl": "https://..."
  }
}
```

### Design exportieren

```typescript
{
  "action": "canva:export",
  "params": {
    "designId": "design_123",
    "format": "png" // png, pdf, jpg, pptx
  }
}
```

### Templates suchen

```typescript
{
  "action": "canva:search-templates",
  "params": {
    "query": "business presentation",
    "type": "presentation" // presentation, social-media, document, video
  }
}
```

**Use Cases:**
- Social Media Posts automatisieren
- Marketing-Material generieren
- Präsentationen designen
- Poster & Flyer erstellen

---

## 📊 2. GENIALLY

### Features
- ✅ Interaktive Präsentationen
- ✅ Infografiken
- ✅ Spiele & Quizzes
- ✅ HTML/Video Export

### API Setup

```env
GENIALLY_API_KEY=your_api_key_here
```

### Interaktive Präsentation erstellen

```typescript
{
  "action": "genially:create",
  "params": {
    "title": "Produktpräsentation 2024",
    "template": "presentation", // presentation, infographic, interactive-image, game, quiz
    "content": {
      "slides": [
        {
          "title": "Einführung",
          "content": "Willkommen zur Präsentation"
        },
        {
          "title": "Features",
          "content": "Unsere Top-Features"
        }
      ],
      "theme": "modern-business"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "creation": {
    "id": "creation_123",
    "title": "Produktpräsentation 2024",
    "type": "presentation",
    "viewUrl": "https://view.genial.ly/...",
    "editUrl": "https://app.genial.ly/editor/...",
    "embedCode": "<iframe src=...></iframe>"
  }
}
```

### Quiz erstellen

```typescript
{
  "action": "genially:create",
  "params": {
    "title": "Marketing Quiz",
    "template": "quiz",
    "content": {
      "slides": [
        {
          "question": "Was ist SEO?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correct": 0
        }
      ]
    }
  }
}
```

**Use Cases:**
- Interaktive Präsentationen
- E-Learning Content
- Infografiken
- Gamification
- Quizzes & Tests

---

## 🧠 3. MIRO

### Features
- ✅ Whiteboard-Erstellung
- ✅ Sticky Notes
- ✅ Mindmaps
- ✅ Flowcharts
- ✅ PDF/Image Export

### API Setup

1. **Miro Developer Account:** https://developers.miro.com
2. **OAuth App erstellen**
3. **Access Token generieren**

```env
MIRO_ACCESS_TOKEN=your_access_token
```

### Board erstellen

```typescript
{
  "action": "miro:create-board",
  "params": {
    "name": "Projektplanung Q1 2024",
    "description": "Strategische Planung für Q1",
    "teamId": "team_123" // optional
  }
}
```

### Sticky Note hinzufügen

```typescript
{
  "action": "miro:add-sticky",
  "params": {
    "boardId": "board_123",
    "text": "User-Feedback analysieren",
    "position": { "x": 0, "y": 0 },
    "color": "light_yellow" // light_yellow, light_green, light_pink, etc.
  }
}
```

### Mindmap erstellen

```typescript
{
  "action": "miro:create-mindmap",
  "params": {
    "boardId": "board_123",
    "centralTopic": "Marketing-Strategie 2024",
    "branches": [
      "Social Media",
      "Content Marketing",
      "SEO",
      "Email Marketing",
      "Paid Ads",
      "Influencer"
    ]
  }
}
```

**Automatische Anordnung:** Branches werden kreisförmig um zentrales Thema angeordnet

### Board exportieren

```typescript
{
  "action": "miro:export",
  "params": {
    "boardId": "board_123",
    "format": "pdf" // pdf, image
  }
}
```

**Use Cases:**
- Brainstorming-Sessions
- Sprint Planning
- User Journey Mapping
- Prozess-Dokumentation
- Team Workshops

---

## 📞 4. ZOOM

### Features
- ✅ Meetings erstellen
- ✅ Webinare erstellen
- ✅ Recurring Meetings
- ✅ Meeting-Verwaltung
- ✅ Cloud Recording

### API Setup

1. **Zoom App Marketplace:** https://marketplace.zoom.us
2. **Server-to-Server OAuth App erstellen**
3. **Credentials in .env:**

```env
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
```

Dann Access Token generieren:

```typescript
const tokenResponse = await fetch('https://zoom.us/oauth/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${Buffer.from(
      `${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`
    ).toString('base64')}`
  },
  body: new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: ZOOM_ACCOUNT_ID
  })
})

const { access_token } = await tokenResponse.json()
// Speichere als ZOOM_ACCESS_TOKEN
```

### Meeting erstellen

```typescript
{
  "action": "zoom:create-meeting",
  "params": {
    "topic": "Team Standup",
    "startTime": "2024-12-10T09:00:00Z", // ISO 8601
    "duration": 30, // Minuten
    "options": {
      "password": "secure123", // optional
      "waitingRoom": true,
      "enableRecording": true,
      "muteUponEntry": false
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "meeting": {
    "id": "meeting_123",
    "meetingId": 123456789,
    "topic": "Team Standup",
    "startTime": "2024-12-10T09:00:00Z",
    "joinUrl": "https://zoom.us/j/123456789",
    "password": "secure123",
    "hostEmail": "you@company.com"
  }
}
```

### Webinar erstellen

```typescript
{
  "action": "zoom:create-webinar",
  "params": {
    "topic": "Produktlaunch Webinar",
    "startTime": "2024-12-15T14:00:00Z",
    "duration": 60,
    "panelists": [
      "speaker1@company.com",
      "speaker2@company.com"
    ]
  }
}
```

### Meetings auflisten

```typescript
{
  "action": "zoom:list-meetings",
  "params": {
    "type": "upcoming" // upcoming, scheduled, previous
  }
}
```

### Meeting löschen

```typescript
{
  "action": "zoom:delete-meeting",
  "params": {
    "meetingId": "123456789"
  }
}
```

**Use Cases:**
- Automatische Meeting-Planung
- Recurring Team-Meetings
- Webinare mit Registrierung
- Sales-Calls
- Support-Sessions

---

## 🎨 5. FIGMA

### Features
- ✅ Design Export
- ✅ Kommentare hinzufügen
- ✅ File-Informationen abrufen

### API Setup

1. **Personal Access Token:** https://www.figma.com/settings
2. **In .env:**

```env
FIGMA_ACCESS_TOKEN=your_token_here
```

### Design exportieren

```typescript
{
  "action": "figma:export",
  "params": {
    "fileKey": "abc123def456", // aus Figma URL
    "format": "png", // png, jpg, svg, pdf
    "scale": 2 // 1x, 2x, 3x, 4x
  }
}
```

**Figma File Key finden:**
URL: `https://www.figma.com/file/abc123def456/My-Design`
File Key: `abc123def456`

### Kommentar hinzufügen

```typescript
{
  "action": "figma:comment",
  "params": {
    "fileKey": "abc123def456",
    "message": "Bitte Logo größer machen",
    "position": { "x": 100, "y": 200 } // optional
  }
}
```

**Use Cases:**
- Design-Review automatisieren
- Assets exportieren
- Feedback-Workflow
- Design-to-Code

---

## 📝 6. NOTION

### Features
- ✅ Pages erstellen
- ✅ Database Queries
- ✅ Content Management
- ✅ Team Collaboration

### API Setup

1. **Notion Integration:** https://www.notion.so/my-integrations
2. **Internal Integration erstellen**
3. **Token kopieren:**

```env
NOTION_API_KEY=secret_abc123...
```

4. **Integration zu Page hinzufügen** (in Notion: Share → Add Integration)

### Page erstellen

```typescript
{
  "action": "notion:create-page",
  "params": {
    "parentPageId": "page-uuid-here",
    "title": "Meeting Notes - 10.12.2024",
    "content": [
      { "type": "paragraph", "text": "Teilnehmer: Max, Anna, Tom" },
      { "type": "paragraph", "text": "Agenda:" },
      { "type": "paragraph", "text": "1. Q4 Review" },
      { "type": "paragraph", "text": "2. Q1 Planning" }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "pageId": "new-page-uuid",
  "url": "https://notion.so/Meeting-Notes-..."
}
```

### Database Query

```typescript
{
  "action": "notion:query-database",
  "params": {
    "databaseId": "database-uuid",
    "filter": {
      "property": "Status",
      "select": {
        "equals": "In Progress"
      }
    }
  }
}
```

**Use Cases:**
- Meeting Notes automatisieren
- Dokumentation generieren
- Knowledge Base aufbauen
- Project Management
- CRM

---

## 📊 7. AIRTABLE

### Features
- ✅ Records erstellen
- ✅ Daten abfragen
- ✅ Flexible Schemas
- ✅ Formeln & Verknüpfungen

### API Setup

1. **Personal Access Token:** https://airtable.com/create/tokens
2. **Scopes:** `data.records:read`, `data.records:write`

```env
AIRTABLE_API_KEY=pat...
```

### Record erstellen

```typescript
{
  "action": "airtable:create-record",
  "params": {
    "baseId": "appXXXXXXXXXXXXXX",
    "tableName": "Leads",
    "fields": {
      "Name": "Max Mustermann",
      "Email": "max@example.com",
      "Status": "New",
      "Source": "Website",
      "Notes": "Interessiert an Premium-Plan"
    }
  }
}
```

**Base ID & Table Name finden:**
URL: `https://airtable.com/appXXXXXXXXXXXXXX/tblYYYYYYYYYYYYYY/...`
- Base ID: `appXXXXXXXXXXXXXX`
- Table Name: Sichtbar in Airtable UI

### Records abfragen

```typescript
{
  "action": "airtable:query-records",
  "params": {
    "baseId": "appXXXXXXXXXXXXXX",
    "tableName": "Leads",
    "filterFormula": "AND({Status}='New', {Source}='Website')"
  }
}
```

**Filter-Formeln:**
```
{Status}='Active'
AND({Status}='New', {Email}!='')
OR({Priority}='High', {Priority}='Critical')
CREATED_TIME() > '2024-01-01'
```

**Use Cases:**
- CRM-Automatisierung
- Lead-Tracking
- Projektmanagement
- Inventory Management
- Content-Kalender

---

## 🚀 KOMPLETTE WORKFLOWS

### Workflow 1: Content-Marketing Kampagne

```typescript
// 1. Brainstorming in Miro
const board = await createMiroBoard("Content-Ideen Q1")
await createMiroMindmap(board.id, "Blog-Themen", ideas)

// 2. Social Posts in Canva
const design = await createCanvaDesign(
  "instagram-template",
  "Post: Neue Features"
)

// 3. Landing Page in Genially
const landing = await createGenially(
  "Feature Launch",
  "interactive-image"
)

// 4. Tracking in Airtable
await createAirtableRecord(
  "marketing-base",
  "Campaigns",
  { name: "Q1 Launch", status: "Active" }
)
```

### Workflow 2: Remote Workshop

```typescript
// 1. Zoom Meeting
const meeting = await createZoomMeeting(
  "Design Thinking Workshop",
  "2024-12-20T10:00:00Z",
  120
)

// 2. Miro Collaboration Board
const board = await createMiroBoard("Workshop Board")

// 3. Genially Präsentation
const presentation = await createGenially(
  "Workshop Agenda",
  "presentation"
)

// 4. Notion Dokumentation
const notes = await createNotionPage(
  parentId,
  "Workshop Notes",
  content
)
```

### Workflow 3: Design Review Process

```typescript
// 1. Figma Design exportieren
const design = await exportFigmaFile("file-key", "png")

// 2. Feedback in Miro sammeln
const board = await createMiroBoard("Design Review")
await addMiroStickyNote(board.id, "Feedback: Logo größer")

// 3. Meeting planen
const meeting = await createZoomMeeting(
  "Design Review Call",
  startTime,
  30
)

// 4. Entscheidungen in Notion dokumentieren
await createNotionPage(parentId, "Design Decisions", content)
```

---

## 💰 KOSTEN-ÜBERSICHT

| Tool | Free Tier | Pro Features | API Limits |
|------|-----------|--------------|------------|
| Canva | ✅ Limitiert | $12.99/mo | 1000 calls/day |
| Genially | ✅ Basic | $7.49/mo | Unlimited |
| Miro | ✅ 3 Boards | $8/mo | 100 calls/min |
| Zoom | ✅ 40 min | $14.99/mo | 10 req/sec |
| Figma | ✅ 3 Files | $12/mo | 60 req/min |
| Notion | ✅ Personal | $8/mo | 3 req/sec |
| Airtable | ✅ 1200 records | $20/mo | 5 req/sec |

---

## 🔧 SETUP CHECKLIST

```env
# Collaboration Tools
CANVA_API_KEY=
GENIALLY_API_KEY=
MIRO_ACCESS_TOKEN=
ZOOM_ACCESS_TOKEN=
FIGMA_ACCESS_TOKEN=
NOTION_API_KEY=
AIRTABLE_API_KEY=
```

**Alle APIs konfigurieren:**
1. Developer Accounts erstellen
2. API Keys generieren
3. In .env einfügen
4. Permissions/Scopes prüfen
5. Test-Calls durchführen

---

## 📚 WEITERE RESSOURCEN

- **Canva:** https://www.canva.com/developers/docs
- **Genially:** https://developers.genial.ly
- **Miro:** https://developers.miro.com
- **Zoom:** https://marketplace.zoom.us/docs/api-reference
- **Figma:** https://www.figma.com/developers/api
- **Notion:** https://developers.notion.com
- **Airtable:** https://airtable.com/developers/web/api

---

## ✨ ZUSAMMENFASSUNG

Mit diesen 7 Tools können User:
- 🎨 **Designs automatisieren** (Canva)
- 📊 **Interaktive Inhalte erstellen** (Genially)
- 🧠 **Kollaborativ brainstormen** (Miro)
- 📞 **Meetings organisieren** (Zoom)
- 🎨 **Design-Prozesse optimieren** (Figma)
- 📝 **Wissen strukturieren** (Notion)
- 📊 **Daten managen** (Airtable)

**Alles per Voice, Telegram oder API! 🚀**
