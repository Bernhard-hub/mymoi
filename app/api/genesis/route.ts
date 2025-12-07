// Genesis Engine - PWA Voice API with Tool Calling
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const TOOLS: Anthropic.Tool[] = [
  { name: 'generate_image', description: 'Generiert ein Bild. Nutze wenn User nach Bild, Logo, Design fragt.', input_schema: { type: 'object' as const, properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
  { name: 'generate_qrcode', description: 'Generiert einen QR-Code.', input_schema: { type: 'object' as const, properties: { content: { type: 'string' } }, required: ['content'] } }
]

async function executeTool(name: string, input: Record<string, unknown>): Promise<{ result: string; data?: unknown }> {
  if (name === 'generate_image') {
    if (!process.env.TOGETHER_API_KEY) return { result: 'Bildgenerierung nicht verfügbar.' }
    const resp = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.TOGETHER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell', prompt: input.prompt, width: 1024, height: 1024, n: 1 })
    })
    if (resp.ok) { const r = await resp.json(); if (r.data?.[0]?.url) return { result: 'Bild generiert!', data: { type: 'image', url: r.data[0].url } } }
    return { result: 'Bildgenerierung fehlgeschlagen.' }
  }
  if (name === 'generate_qrcode') {
    return { result: 'QR-Code generiert!', data: { type: 'image', url: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(input.content as string) } }
  }
  return { result: 'Unbekanntes Tool' }
}

const GENESIS_PROMPT = 'Du bist MOI, ein eigenständiger AI-Assistent. Du bist MOI, NICHT Claude. Kurz und prägnant auf Deutsch antworten. Wenn User nach Bild oder QR-Code fragt, nutze das Tool!'

async function processWithTools(msg: string): Promise<{ text: string; tools: { name: string; data?: unknown }[] }> {
  let resp = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: GENESIS_PROMPT, tools: TOOLS, messages: [{ role: 'user', content: msg }] })
  const tools: { name: string; data?: unknown }[] = []
  while (resp.stop_reason === 'tool_use') {
    const toolBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const t of toolBlocks) { console.log('[TOOL]', t.name); const r = await executeTool(t.name, t.input as Record<string, unknown>); tools.push({ name: t.name, data: r.data }); results.push({ type: 'tool_result', tool_use_id: t.id, content: r.result }) }
    resp = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: GENESIS_PROMPT, tools: TOOLS, messages: [{ role: 'user', content: msg }, { role: 'assistant', content: resp.content }, { role: 'user', content: results }] })
  }
  const txt = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return { text: txt?.text || '', tools }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const audioFile = formData.get('audio') as File
      if (!audioFile) return NextResponse.json({ error: 'No audio file' }, { status: 400 })
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
      console.log('[AUDIO]', audioFile.size, 'bytes')
      let transcript = ''
      if (process.env.GROQ_API_KEY) {
        const fd = new FormData(); fd.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm'); fd.append('model', 'whisper-large-v3'); fd.append('language', 'de')
        const wr = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY }, body: fd })
        if (wr.ok) { const r = await wr.json(); transcript = r.text || ''; console.log('[WHISPER]', transcript) }
      } else if (process.env.OPENAI_API_KEY) {
        const fd = new FormData(); fd.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm'); fd.append('model', 'whisper-1'); fd.append('language', 'de')
        const wr = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY }, body: fd })
        if (wr.ok) { const r = await wr.json(); transcript = r.text || '' }
      }
      if (!transcript) return NextResponse.json({ error: 'Transcription failed', response: 'Ich konnte dich nicht verstehen.' }, { status: 200 })
      const { text, tools } = await processWithTools(transcript)
      const img = tools.find(t => t.data && (t.data as {type?: string}).type === 'image')
      let audioUrl = null
      if (process.env.OPENAI_API_KEY && text) {
        try {
          const tts = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'tts-1', voice: 'nova', input: text.substring(0, 4000), response_format: 'mp3' }) })
          if (tts.ok) { const ab = await tts.arrayBuffer(); audioUrl = 'data:audio/mp3;base64,' + Buffer.from(ab).toString('base64') }
        } catch (e) { console.error('[TTS]', e) }
      }
      return NextResponse.json({ transcript, response: text, audioUrl, toolsUsed: tools.map(t => t.name), generatedContent: img ? (img.data as {url?: string}).url : null })
    }
    const body = await request.json()
    if (!body.message) return NextResponse.json({ error: 'No message' }, { status: 400 })
    console.log('[TEXT]', body.message)
    const { text, tools } = await processWithTools(body.message)
    const img = tools.find(t => t.data && (t.data as {type?: string}).type === 'image')
    return NextResponse.json({ response: text, toolsUsed: tools.map(t => t.name), generatedContent: img ? (img.data as {url?: string}).url : null })
  } catch (error) {
    console.error('Genesis API error:', error)
    return NextResponse.json({ error: 'Internal server error', response: 'Ein Fehler ist aufgetreten.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Genesis Engine Active', version: '2.1.0', features: ['voice', 'tts', 'tools'], tools: TOOLS.map(t => t.name) })
}
