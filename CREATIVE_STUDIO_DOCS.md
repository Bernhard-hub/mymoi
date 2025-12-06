# 🎨 MOI Creative Studio - Vollständige Dokumentation

## Übersicht

Das MOI Creative Studio ist eine umfassende AI-Kreativ-Plattform mit 7 Hauptkategorien:

1. **Video Generation** - Text/Bild zu Video
2. **Musik & Audio** - Songs, Jingles, Sound Effects
3. **Voice Cloning** - Stimme klonen & synthetisieren
4. **3D Generation** - 3D-Modelle aus Text/Bildern
5. **Design Automation** - Logos, Posts, Poster
6. **Animation** - GIFs, Lottie, Motion Graphics
7. **Spezial-Design** - Tattoos, Fashion, Interior

---

## 🎬 1. VIDEO GENERATION

### Text-to-Video

Erstelle Videos aus Textbeschreibungen mit Runway ML oder Luma AI.

**API Call:**
```typescript
POST /api/creative
{
  "action": "generate:video",
  "params": {
    "prompt": "Ein Astronaut läuft auf dem Mond, cinematic, 4k",
    "duration": 5,
    "style": "cinematic" // optional: cinematic, anime, realistic, abstract
  }
}
```

**Response:**
```json
{
  "success": true,
  "videoUrl": "https://cdn.runway.ml/..."
}
```

**Kosten:** ~$0.05-0.20 pro Sekunde (abhängig von Provider)

**Dauer:** 2-5 Minuten Generierung

### Image-to-Video (Animation)

Animiere statische Bilder.

```typescript
{
  "action": "animate:image",
  "params": {
    "imageUrl": "https://...",
    "motion": "zoom-in" // zoom-in, zoom-out, pan-left, pan-right, auto
  }
}
```

**Use Cases:**
- Social Media Content
- Produktpräsentationen
- Storytelling
- Werbung
- Musikvideos

---

## 🎵 2. MUSIK & AUDIO

### Music Generation

Generiere komplette Songs mit Suno oder Udio.

```typescript
{
  "action": "generate:music",
  "params": {
    "description": "Energetic electronic dance music with drops",
    "style": "edm", // optional: pop, rock, classical, jazz, hip-hop, etc.
    "duration": 30, // Sekunden
    "instrumental": false // true = kein Gesang
  }
}
```

**Response:**
```json
{
  "success": true,
  "audioUrl": "https://cdn.suno.ai/..."
}
```

**Kosten:** ~$0.10 pro Song

**Dauer:** 1-3 Minuten

### Sound Effects

Kurze Audio-Effekte für Videos, Apps, Games.

```typescript
{
  "action": "generate:sound-effect",
  "params": {
    "description": "Tür quietscht langsam auf",
    "duration": 3 // Sekunden
  }
}
```

**Use Cases:**
- YouTube/TikTok Videos
- Podcasts
- Apps & Games
- Präsentationen
- Hintergrundmusik

---

## 🎤 3. VOICE CLONING & TTS

### Voice Cloning

Klone eine Stimme aus einer Audio-Probe.

```typescript
{
  "action": "clone:voice",
  "params": {
    "audioSampleUrl": "https://.../voice_sample.mp3",
    "voiceName": "Meine Stimme"
  }
}
```

**Response:**
```json
{
  "success": true,
  "voiceId": "voice_abc123xyz"
}
```

**Anforderungen an Audio-Sample:**
- Mindestens 30 Sekunden
- Klare Aufnahme
- Keine Hintergrundgeräusche
- Nur eine Person spricht

### Text-to-Speech mit geklonter Stimme

```typescript
{
  "action": "generate:voice",
  "params": {
    "text": "Hallo, das ist meine geklonte Stimme!",
    "voiceId": "voice_abc123xyz"
  }
}
```

**Response:**
```json
{
  "success": true,
  "audioUrl": "data:audio/mp3;base64,..."
}
```

**Kosten:** ~$0.15 pro 1000 Zeichen

**Use Cases:**
- Hörbücher
- Voiceovers
- Podcasts
- E-Learning
- Assistenten

---

## 🧊 4. 3D GENERATION

### Text-to-3D

Erstelle 3D-Modelle aus Textbeschreibungen.

```typescript
{
  "action": "generate:3d",
  "params": {
    "prompt": "A futuristic spaceship with blue glowing engines",
    "style": "realistic" // 3d-cartoon, realistic, low-poly
  }
}
```

**Response:**
```json
{
  "success": true,
  "modelUrl": "https://.../model.glb",
  "previewUrl": "https://.../preview.png"
}
```

**Kosten:** ~$0.30 pro Modell

**Dauer:** 5-10 Minuten

**Formate:** GLB, FBX, OBJ

### Image-to-3D

Konvertiere 2D-Bilder in 3D-Modelle.

```typescript
{
  "action": "image-to-3d",
  "params": {
    "imageUrl": "https://.../shoe.png"
  }
}
```

**Use Cases:**
- Game Assets
- AR/VR Content
- Produktvisualisierung
- 3D-Druck
- Architektur

---

## 🎨 5. DESIGN AUTOMATION

### Logo Generator

Professionelle Logos in Sekunden.

```typescript
{
  "action": "generate:logo",
  "params": {
    "companyName": "TechVision",
    "industry": "Technology",
    "style": "modern" // modern, minimalist, vintage, playful
  }
}
```

**Response:**
```json
{
  "success": true,
  "logoUrl": "https://...",
  "variations": [
    "https://.../variation1.png",
    "https://.../variation2.png",
    "https://.../variation3.png"
  ]
}
```

### Social Media Post Design

```typescript
{
  "action": "design:social-post",
  "params": {
    "text": "New Product Launch!",
    "platform": "instagram", // instagram, facebook, linkedin, twitter
    "theme": "modern tech"
  }
}
```

**Automatische Dimensionen:**
- Instagram: 1080x1080
- Facebook: 1200x630
- LinkedIn: 1200x627
- Twitter: 1200x675

### Poster/Flyer Generator

```typescript
{
  "action": "generate:poster",
  "params": {
    "event": {
      "title": "Summer Music Festival",
      "date": "15. Juli 2024",
      "location": "Berlin Arena",
      "description": "Die besten Bands des Jahres"
    },
    "style": "concert" // concert, party, professional, minimal
  }
}
```

**Use Cases:**
- Branding
- Marketing
- Social Media
- Events
- Print-Materialien

---

## 🎬 6. ANIMATION

### Animated GIF

Erstelle animierte GIFs aus Bildern.

```typescript
{
  "action": "generate:gif",
  "params": {
    "frames": [
      "https://.../frame1.png",
      "https://.../frame2.png",
      "https://.../frame3.png"
    ],
    "fps": 10 // Frames per second
  }
}
```

### Lottie Animation

JSON-basierte Animationen für Web/App.

```typescript
{
  "action": "generate:lottie",
  "params": {
    "description": "Loading spinner animation"
  }
}
```

**Response:**
```json
{
  "success": true,
  "lottieJson": { ... }
}
```

**Use Cases:**
- Memes
- Reactions
- UI Animations
- Marketing
- Erklärvideos

---

## ✨ 7. SPEZIAL-DESIGN

### Tattoo Design

Erstelle Tattoo-Designs in verschiedenen Stilen.

```typescript
{
  "action": "generate:tattoo",
  "params": {
    "description": "Phoenix rising from flames",
    "style": "traditional" // traditional, minimalist, watercolor, tribal, realistic
  }
}
```

**Response:**
```json
{
  "success": true,
  "tattooUrl": "https://.../design.png",
  "stencilUrl": "https://.../stencil.png"
}
```

### Fashion Design

```typescript
{
  "action": "generate:fashion",
  "params": {
    "garment": "dress", // dress, shirt, pants, jacket, shoes
    "style": "elegant evening wear",
    "colors": ["black", "gold", "red"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "designUrl": "https://.../design.png",
  "technicalDrawing": "https://.../technical.png"
}
```

### Interior Design

```typescript
{
  "action": "generate:interior",
  "params": {
    "room": "living-room", // living-room, bedroom, kitchen, bathroom, office
    "style": "scandinavian", // modern, scandinavian, industrial, bohemian, minimalist
    "preferences": ["plants", "natural light", "wooden furniture"]
  }
}
```

**Use Cases:**
- Tattoo-Studios
- Fashion Brands
- Interior Designer
- Architekten
- Künstler

---

## 🔧 SETUP & KONFIGURATION

### Benötigte API Keys

```env
# Video
RUNWAY_API_KEY=your_key_here
LUMA_API_KEY=your_key_here

# Musik
SUNO_API_KEY=your_key_here
UDIO_API_KEY=your_key_here

# Voice
ELEVENLABS_API_KEY=your_key_here

# 3D
MESHY_API_KEY=your_key_here

# Bilder (bereits vorhanden)
TOGETHER_API_KEY=your_key_here
```

### Installation

```bash
npm install gifshot
```

### Provider-Dokumentation

- **Runway ML:** https://runwayml.com/docs
- **Luma AI:** https://lumalabs.ai/docs
- **Suno:** https://suno.ai/docs
- **Udio:** https://udio.com/api
- **ElevenLabs:** https://elevenlabs.io/docs
- **Meshy:** https://docs.meshy.ai

---

## 💡 BEISPIEL-WORKFLOWS

### Workflow 1: Komplettes Musikvideo

```typescript
// 1. Song generieren
const music = await fetch('/api/creative', {
  method: 'POST',
  body: JSON.stringify({
    action: 'generate:music',
    params: {
      description: 'Upbeat pop song about summer',
      duration: 60,
      instrumental: true
    }
  })
})

// 2. Video generieren
const video = await fetch('/api/creative', {
  method: 'POST',
  body: JSON.stringify({
    action: 'generate:video',
    params: {
      prompt: 'Beach party with friends dancing at sunset',
      duration: 60,
      style: 'cinematic'
    }
  })
})

// 3. Kombinieren (externe Video-Editor-API oder manuell)
```

### Workflow 2: Komplette Brand Identity

```typescript
// 1. Logo
const logo = await generateLogo('MyBrand', 'Tech', 'modern')

// 2. Social Media Posts
const instaPost = await designSocialPost('Launch Day!', 'instagram', 'tech modern')

// 3. Website Hero Image
const hero = await generateImage('Modern tech startup office, professional')
```

### Workflow 3: Produkt-Präsentation

```typescript
// 1. 3D-Modell vom Produkt
const model3D = await generate3DModel('Sleek wireless headphones')

// 2. Produkt-Video
const productVideo = await generateVideo('Headphones rotating 360 degrees')

// 3. Marketing-Poster
const poster = await generatePoster({
  title: 'New Headphones',
  date: 'Available Now',
  location: 'Online Store'
}, 'professional')
```

---

## 📊 PREISE & LIMITS

| Feature | Kosten | Dauer | Qualität |
|---------|--------|-------|----------|
| Video (5s) | $0.25 | 2-5min | 1080p |
| Musik (30s) | $0.10 | 1-3min | 320kbps |
| Voice (1000 chars) | $0.15 | 10s | HD |
| 3D Model | $0.30 | 5-10min | GLB |
| Logo | $0.01 | 30s | 4K |
| Social Post | $0.01 | 20s | Platform-optimiert |
| GIF | $0.02 | 10s | 800x600 |

**Tipps zum Sparen:**
- Batching: Mehrere Assets auf einmal
- Caching: Ähnliche Prompts wiederverwenden
- Preview: Erst Vorschau, dann Final

---

## 🚀 INTEGRATION IN MOI

### Voice Bot Integration

```typescript
// In action-handlers.ts
async function handleCreativeRequest(transcript: string, userId: number) {
  if (transcript.includes('erstelle video')) {
    const result = await fetch('/api/creative', {
      method: 'POST',
      body: JSON.stringify({
        action: 'generate:video',
        params: {
          prompt: extractPrompt(transcript),
          duration: 5
        }
      })
    })
    
    return {
      message: '🎬 Video wird erstellt! Link kommt per SMS...',
      videoUrl: result.videoUrl
    }
  }
}
```

### Telegram Bot Integration

```typescript
// In telegram/route.ts
if (userText.includes('musik') || userText.includes('song')) {
  const music = await generateMusic(userText)
  
  if (music.success) {
    await sendAudio(chatId, music.audioUrl, '🎵 Dein Song ist fertig!')
  }
}
```

---

## ❓ FAQ

**Q: Wie lange dauert Video-Generierung?**
A: 2-5 Minuten für 5 Sekunden Video

**Q: Kann ich meine eigene Stimme klonen?**
A: Ja, mit 30+ Sekunden Audio-Sample

**Q: Welches 3D-Format wird unterstützt?**
A: GLB (empfohlen), FBX, OBJ

**Q: Kann ich kommerzielle Nutzung?**
A: Abhängig vom Provider - Lizenzen prüfen!

**Q: Wie gut ist die Qualität?**
A: Production-ready, aber immer Review empfohlen

---

## 🎯 ROADMAP

- [ ] Video-Editing (Schnitt, Effekte)
- [ ] Musik-Remix & Mashups
- [ ] Multi-Voice Conversations
- [ ] 3D-Animation (nicht nur Modelle)
- [ ] AR-Filter für Social Media
- [ ] NFT-Generierung
- [ ] Game Asset Generator
- [ ] AI-Videocalls (Avatare)

---

**Viel Spaß beim Kreativsein! 🎨✨**
