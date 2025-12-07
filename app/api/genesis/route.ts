// Genesis Engine - PWA Voice API with Tool Calling
// MOI - Der KI-Assistent der HANDELT
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Alle verfügbaren Tools für MOI
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_image',
    description: 'Generiert ein Bild mit AI. Nutze für: Bilder, Logos, Designs, Illustrationen, Fotos, Kunstwerke.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Detaillierte Bildbeschreibung auf Englisch' },
        style: { type: 'string', description: 'Stil: photo, illustration, logo, art, 3d' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'generate_qrcode',
    description: 'Generiert einen QR-Code für URLs, Text, Kontaktdaten.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Inhalt des QR-Codes (URL, Text, etc.)' },
        size: { type: 'number', description: 'Größe in Pixel (100-500)' }
      },
      required: ['content']
    }
  },
  {
    name: 'web_search',
    description: 'Sucht aktuelle Informationen im Internet. Nutze für: Nachrichten, Fakten, aktuelle Events.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Suchanfrage' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_weather',
    description: 'Holt aktuelle Wetterdaten für eine Stadt.',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: { type: 'string', description: 'Stadt für Wetterabfrage' }
      },
      required: ['city']
    }
  },
  {
    name: 'calculate',
    description: 'Führt mathematische Berechnungen durch.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: 'Mathematischer Ausdruck (z.B. "15% von 250" oder "2+2*3")' }
      },
      required: ['expression']
    }
  },
  {
    name: 'get_time',
    description: 'Gibt aktuelle Zeit und Datum zurück, optional für eine Zeitzone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        timezone: { type: 'string', description: 'Zeitzone (z.B. Europe/Vienna, America/New_York)' }
      },
      required: []
    }
  }
]

// Tool-Ausführung
async function executeTool(name: string, input: Record<string, unknown>): Promise<{ result: string; data?: unknown }> {
  console.log(`[TOOL] ${name}:`, input)

  switch (name) {
    case 'generate_image': {
      if (!process.env.TOGETHER_API_KEY) return { result: 'Bildgenerierung nicht verfügbar.' }
      const style = (input.style as string) || 'photo'
      const styleHints: Record<string, string> = {
        photo: 'photorealistic, high quality, professional photography',
        illustration: 'digital illustration, clean lines, vibrant colors',
        logo: 'minimal logo design, clean, vector style, simple background',
        art: 'artistic, creative, expressive, fine art',
        '3d': '3D render, octane render, high detail'
      }
      const enhancedPrompt = `${input.prompt}, ${styleHints[style] || styleHints.photo}`

      const resp = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.TOGETHER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell', prompt: enhancedPrompt, width: 1024, height: 1024, n: 1 })
      })
      if (resp.ok) {
        const r = await resp.json()
        if (r.data?.[0]?.url) return { result: 'Bild generiert!', data: { type: 'image', url: r.data[0].url } }
      }
      return { result: 'Bildgenerierung fehlgeschlagen.' }
    }

    case 'generate_qrcode': {
      const size = Math.min(500, Math.max(100, (input.size as number) || 200))
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(input.content as string)}`
      return { result: 'QR-Code generiert!', data: { type: 'image', url } }
    }

    case 'web_search': {
      try {
        const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(input.query as string)}&format=json&no_html=1`)
        if (resp.ok) {
          const data = await resp.json()
          if (data.AbstractText) return { result: data.AbstractText }
          if (data.RelatedTopics?.[0]?.Text) {
            return { result: data.RelatedTopics.slice(0, 3).map((t: { Text?: string }) => t.Text).filter(Boolean).join('\n') }
          }
        }
      } catch (e) { console.error('Search error:', e) }
      return { result: `Suche nach "${input.query}" - bitte online prüfen für aktuelle Infos.` }
    }

    case 'get_weather': {
      try {
        const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input.city as string)}&count=1`)
        const geoData = await geoResp.json()
        if (!geoData.results?.[0]) return { result: `Stadt "${input.city}" nicht gefunden.` }

        const { latitude, longitude, name } = geoData.results[0]
        const weatherResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`)
        const weather = await weatherResp.json()
        const current = weather.current

        const weatherCodes: Record<number, string> = {
          0: '☀️ Klar', 1: '🌤️ Leicht bewölkt', 2: '⛅ Bewölkt', 3: '☁️ Bedeckt',
          45: '🌫️ Nebel', 51: '🌧️ Nieselregen', 61: '🌧️ Regen', 71: '🌨️ Schnee', 95: '⛈️ Gewitter'
        }
        const desc = weatherCodes[current.weather_code] || '🌡️'

        return { result: `${desc} in ${name}: ${current.temperature_2m}°C, Wind ${current.wind_speed_10m} km/h, Luftfeuchtigkeit ${current.relative_humidity_2m}%` }
      } catch (e) {
        console.error('Weather error:', e)
        return { result: 'Wetter konnte nicht abgerufen werden.' }
      }
    }

    case 'calculate': {
      try {
        let expr = (input.expression as string)
          .replace(/(\d+)\s*%\s*von\s*(\d+)/gi, '($2 * $1 / 100)')
          .replace(/(\d+)\s*%\s*of\s*(\d+)/gi, '($2 * $1 / 100)')
          .replace(/(\d+)%/g, '($1/100)')
          .replace(/x/gi, '*')
          .replace(/÷/g, '/')
          .replace(/,/g, '.')
          .replace(/[^0-9+\-*/().%\s]/g, '')

        const result = Function(`"use strict"; return (${expr})`)()
        const formatted = typeof result === 'number' ? (Number.isInteger(result) ? result : result.toFixed(2)) : result
        return { result: `${input.expression} = ${formatted}` }
      } catch {
        return { result: 'Konnte nicht berechnen. Prüfe den Ausdruck.' }
      }
    }

    case 'get_time': {
      const tz = (input.timezone as string) || 'Europe/Berlin'
      try {
        const now = new Date().toLocaleString('de-DE', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })
        return { result: `${now} (${tz})` }
      } catch {
        const now = new Date().toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })
        return { result: now }
      }
    }

    default:
      return { result: 'Unbekanntes Tool' }
  }
}

const GENESIS_PROMPT = `Du bist MOI, ein eigenständiger KI-Assistent. Du bist MOI - NICHT Claude, NICHT ein Bot.

WICHTIG:
- Antworte IMMER auf Deutsch, kurz und prägnant (max 2-3 Sätze)
- Nutze Tools wenn passend: Bild generieren, QR-Code, Wetter, Rechnen, Zeit
- Sei freundlich, hilfreich und direkt
- Bei Bildanfragen: Erstelle einen detaillierten englischen Prompt
- Bei Rechenanfragen: Nutze das calculate Tool
- Bei Wetteranfragen: Nutze get_weather
- Bei Zeitfragen: Nutze get_time`

async function processWithTools(msg: string): Promise<{ text: string; tools: { name: string; data?: unknown }[] }> {
  let resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: GENESIS_PROMPT,
    tools: TOOLS,
    messages: [{ role: 'user', content: msg }]
  })

  const tools: { name: string; data?: unknown }[] = []

  while (resp.stop_reason === 'tool_use') {
    const toolBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const results: Anthropic.ToolResultBlockParam[] = []

    for (const t of toolBlocks) {
      console.log('[TOOL CALL]', t.name, t.input)
      const r = await executeTool(t.name, t.input as Record<string, unknown>)
      tools.push({ name: t.name, data: r.data })
      results.push({ type: 'tool_result', tool_use_id: t.id, content: r.result })
    }

    resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: GENESIS_PROMPT,
      tools: TOOLS,
      messages: [
        { role: 'user', content: msg },
        { role: 'assistant', content: resp.content },
        { role: 'user', content: results }
      ]
    })
  }

  const txt = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return { text: txt?.text || '', tools }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    // Audio Input (Voice)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const audioFile = formData.get('audio') as File
      if (!audioFile) return NextResponse.json({ error: 'No audio file' }, { status: 400 })

      const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
      console.log('[AUDIO]', audioFile.size, 'bytes')

      // Transcription mit Groq (schneller) oder OpenAI
      let transcript = ''
      if (process.env.GROQ_API_KEY) {
        const fd = new FormData()
        fd.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')
        fd.append('model', 'whisper-large-v3')
        fd.append('language', 'de')

        const wr = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
          body: fd
        })
        if (wr.ok) {
          const r = await wr.json()
          transcript = r.text || ''
          console.log('[WHISPER]', transcript)
        }
      } else if (process.env.OPENAI_API_KEY) {
        const fd = new FormData()
        fd.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')
        fd.append('model', 'whisper-1')
        fd.append('language', 'de')

        const wr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
          body: fd
        })
        if (wr.ok) {
          const r = await wr.json()
          transcript = r.text || ''
        }
      }

      if (!transcript) {
        return NextResponse.json({
          error: 'Transcription failed',
          response: 'Ich konnte dich nicht verstehen. Bitte versuche es nochmal.'
        }, { status: 200 })
      }

      // Mit Tools verarbeiten
      const { text, tools } = await processWithTools(transcript)
      const img = tools.find(t => t.data && (t.data as { type?: string }).type === 'image')

      // TTS Antwort generieren
      let audioUrl = null
      if (process.env.OPENAI_API_KEY && text) {
        try {
          const tts = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'tts-1',
              voice: 'nova',
              input: text.substring(0, 4000),
              response_format: 'mp3'
            })
          })
          if (tts.ok) {
            const ab = await tts.arrayBuffer()
            audioUrl = 'data:audio/mp3;base64,' + Buffer.from(ab).toString('base64')
          }
        } catch (e) {
          console.error('[TTS]', e)
        }
      }

      return NextResponse.json({
        transcript,
        response: text,
        audioUrl,
        toolsUsed: tools.map(t => t.name),
        generatedContent: img ? (img.data as { url?: string }).url : null
      })
    }

    // Text Input
    const body = await request.json()
    if (!body.message) return NextResponse.json({ error: 'No message' }, { status: 400 })

    console.log('[TEXT]', body.message)
    const { text, tools } = await processWithTools(body.message)
    const img = tools.find(t => t.data && (t.data as { type?: string }).type === 'image')

    return NextResponse.json({
      response: text,
      toolsUsed: tools.map(t => t.name),
      generatedContent: img ? (img.data as { url?: string }).url : null
    })

  } catch (error) {
    console.error('Genesis API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      response: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Genesis Engine Active',
    version: '2.2.0',
    features: ['voice', 'tts', 'tools', 'weather', 'calculate', 'qr', 'image'],
    tools: TOOLS.map(t => ({ name: t.name, description: t.description }))
  })
}
