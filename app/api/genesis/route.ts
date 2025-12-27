// Genesis Engine v3.0 - Chat Memory + Microsoft/Google Tools
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null

type HistoryMsg = { role: 'user' | 'assistant'; content: string }

async function getUserTokens(userEmail: string): Promise<{ microsoft?: { access_token: string; refresh_token: string }; google?: { access_token: string; refresh_token: string } }> {
  if (!supabase || !userEmail || userEmail === 'default') return {}
  
  // Get Microsoft tokens
  const { data: msData } = await supabase
    .from('oauth_tokens')
    .select('access_token, refresh_token')
    .eq('provider', 'microsoft')
    .eq('email', userEmail)
    .single()
  
  // Get Google tokens
  const { data: googleData } = await supabase
    .from('oauth_tokens')
    .select('access_token, refresh_token')
    .eq('provider', 'google')
    .eq('email', userEmail)
    .single()
  
  const result: { microsoft?: { access_token: string; refresh_token: string }; google?: { access_token: string; refresh_token: string } } = {}
  if (msData) result.microsoft = msData
  if (googleData) result.google = googleData
  
  console.log('[TOKENS] User:', userEmail, 'MS:', !!msData, 'Google:', !!googleData)
  return result
}

async function refreshMsToken(refreshToken: string): Promise<string | null> {
  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  if (resp.ok) { const data = await resp.json(); return data.access_token }
  return null
}

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  if (resp.ok) { const data = await resp.json(); return data.access_token }
  return null
}

const TOOLS: Anthropic.Tool[] = [
  { name: 'generate_image', description: 'Generiert ein Bild. Nutze wenn User nach Bild, Logo, Design fragt.', input_schema: { type: 'object' as const, properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
  { name: 'generate_qrcode', description: 'Generiert einen QR-Code.', input_schema: { type: 'object' as const, properties: { content: { type: 'string' } }, required: ['content'] } },
  { name: 'microsoft_list_files', description: 'Listet Dateien aus OneDrive.', input_schema: { type: 'object' as const, properties: { folder: { type: 'string' } }, required: [] } },
  { name: 'microsoft_send_email', description: 'Sendet Email ueber Outlook.', input_schema: { type: 'object' as const, properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } },
  { name: 'microsoft_calendar', description: 'Kalendertermine anzeigen/erstellen.', input_schema: { type: 'object' as const, properties: { action: { type: 'string', enum: ['list', 'create'] }, title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['action'] } },
  { name: 'google_list_files', description: 'Listet Dateien aus Google Drive.', input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: [] } },
  { name: 'google_send_email', description: 'Sendet Email ueber Gmail.', input_schema: { type: 'object' as const, properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } },
  { name: 'google_calendar', description: 'Google Kalender Termine.', input_schema: { type: 'object' as const, properties: { action: { type: 'string', enum: ['list', 'create'] }, title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['action'] } }
]

async function executeTool(name: string, input: Record<string, unknown>, tokens: { microsoft?: { access_token: string; refresh_token: string }; google?: { access_token: string; refresh_token: string } }): Promise<{ result: string; data?: unknown }> {
  if (name === 'generate_image') {
    if (!process.env.TOGETHER_API_KEY) return { result: 'Bildgenerierung nicht verfuegbar.' }
    const resp = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + (process.env.TOGETHER_API_KEY || '').trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell', prompt: input.prompt, width: 1024, height: 1024, n: 1 })
    })
    if (resp.ok) { const r = await resp.json(); if (r.data?.[0]?.url) return { result: 'Bild generiert!', data: { type: 'image', url: r.data[0].url } } }
    return { result: 'Bildgenerierung fehlgeschlagen.' }
  }
  if (name === 'generate_qrcode') {
    return { result: 'QR-Code generiert!', data: { type: 'image', url: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(input.content as string) } }
  }
  if (name === 'microsoft_list_files') {
    if (!tokens.microsoft) return { result: 'Bitte verbinde Microsoft in den Einstellungen.' }
    let at = tokens.microsoft.access_token
    let resp = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', { headers: { 'Authorization': 'Bearer ' + at } })
    if (resp.status === 401 && tokens.microsoft.refresh_token) { at = await refreshMsToken(tokens.microsoft.refresh_token) || at; resp = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', { headers: { 'Authorization': 'Bearer ' + at } }) }
    if (resp.ok) { const d = await resp.json(); return { result: 'Dateien: ' + (d.value?.map((f: {name:string}) => f.name).join(', ') || 'Keine') } }
    return { result: 'Fehler beim Laden.' }
  }
  if (name === 'microsoft_send_email') {
    if (!tokens.microsoft) return { result: 'Bitte verbinde Microsoft in den Einstellungen.' }
    let at = tokens.microsoft.access_token
    const ed = { message: { subject: input.subject, body: { contentType: 'Text', content: input.body }, toRecipients: [{ emailAddress: { address: input.to } }] } }
    let resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify(ed) })
    if (resp.status === 401 && tokens.microsoft.refresh_token) { at = await refreshMsToken(tokens.microsoft.refresh_token) || at; resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify(ed) }) }
    if (resp.ok || resp.status === 202) return { result: 'Email an ' + input.to + ' gesendet!' }
    return { result: 'Email konnte nicht gesendet werden.' }
  }
  if (name === 'microsoft_calendar') {
    if (!tokens.microsoft) return { result: 'Bitte verbinde Microsoft.' }
    let at = tokens.microsoft.access_token
    if (input.action === 'list') {
      let resp = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events?$top=5', { headers: { 'Authorization': 'Bearer ' + at } })
      if (resp.status === 401 && tokens.microsoft.refresh_token) { at = await refreshMsToken(tokens.microsoft.refresh_token) || at; resp = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events?$top=5', { headers: { 'Authorization': 'Bearer ' + at } }) }
      if (resp.ok) { const d = await resp.json(); return { result: 'Termine: ' + (d.value?.map((e: {subject:string}) => e.subject).join(', ') || 'Keine') } }
    }
    if (input.action === 'create' && input.title) {
      const ev = { subject: input.title, start: { dateTime: input.start, timeZone: 'Europe/Berlin' }, end: { dateTime: input.end || input.start, timeZone: 'Europe/Berlin' } }
      const resp = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', { method: 'POST', headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })
      if (resp.ok) return { result: 'Termin erstellt!' }
    }
    return { result: 'Kalender-Fehler.' }
  }
  if (name === 'google_list_files') {
    if (!tokens.google) return { result: 'Bitte verbinde Google.' }
    let at = tokens.google.access_token
    let resp = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=10', { headers: { 'Authorization': 'Bearer ' + at } })
    if (resp.status === 401 && tokens.google.refresh_token) { at = await refreshGoogleToken(tokens.google.refresh_token) || at; resp = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=10', { headers: { 'Authorization': 'Bearer ' + at } }) }
    if (resp.ok) { const d = await resp.json(); return { result: 'Drive: ' + (d.files?.map((f: {name:string}) => f.name).join(', ') || 'Keine') } }
    return { result: 'Drive-Fehler.' }
  }
  if (name === 'google_send_email') {
    if (!tokens.google) return { result: 'Bitte verbinde Google.' }
    let at = tokens.google.access_token
    const em = 'To: ' + input.to + '\r\nSubject: ' + input.subject + '\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + input.body
    const raw = Buffer.from(em).toString('base64url')
    let resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) })
    if (resp.status === 401 && tokens.google.refresh_token) { at = await refreshGoogleToken(tokens.google.refresh_token) || at; resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) }) }
    if (resp.ok) return { result: 'Gmail gesendet!' }
    return { result: 'Gmail-Fehler.' }
  }
  if (name === 'google_calendar') {
    if (!tokens.google) return { result: 'Bitte verbinde Google.' }
    let at = tokens.google.access_token
    if (input.action === 'list') {
      const now = new Date().toISOString()
      let resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=5&timeMin=' + now + '&singleEvents=true', { headers: { 'Authorization': 'Bearer ' + at } })
      if (resp.status === 401 && tokens.google.refresh_token) { at = await refreshGoogleToken(tokens.google.refresh_token) || at; resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=5&timeMin=' + now + '&singleEvents=true', { headers: { 'Authorization': 'Bearer ' + at } }) }
      if (resp.ok) { const d = await resp.json(); return { result: 'Kalender: ' + (d.items?.map((e: {summary:string}) => e.summary).join(', ') || 'Keine') } }
    }
    if (input.action === 'create' && input.title) {
      const ev = { summary: input.title, start: { dateTime: input.start, timeZone: 'Europe/Berlin' }, end: { dateTime: input.end || input.start, timeZone: 'Europe/Berlin' } }
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })
      if (resp.ok) return { result: 'Google Termin erstellt!' }
    }
    return { result: 'Google Kalender-Fehler.' }
  }
  return { result: 'Unbekanntes Tool' }
}

const GENESIS_PROMPT = `Du bist MOI, ein intelligenter AI-Assistent. Du bist MOI, NICHT Claude.

WICHTIG - KONVERSATIONSKONTEXT:
- Du erhaeltst die Chat-Historie. NUTZE SIE!
- Wenn User "ja", "ok", "mach das" sagt, fuehre die vorher besprochene Aktion aus
- Erinnere dich an Details aus dem Gespraech (Namen, Emails, Termine)
- Frag nicht erneut nach Informationen die bereits gegeben wurden

VERHALTEN:
- Antworte kurz auf Deutsch
- Nutze Tools wenn passend
- Sei proaktiv`

async function processWithTools(msg: string, history: HistoryMsg[], tokens: { microsoft?: { access_token: string; refresh_token: string }; google?: { access_token: string; refresh_token: string } }): Promise<{ text: string; tools: { name: string; data?: unknown }[] }> {
  const messages: Anthropic.MessageParam[] = []
  for (const h of history) messages.push({ role: h.role, content: h.content })
  messages.push({ role: 'user', content: msg })
  let resp = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: GENESIS_PROMPT, tools: TOOLS, messages })
  const tools: { name: string; data?: unknown }[] = []
  while (resp.stop_reason === 'tool_use') {
    const toolBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const t of toolBlocks) { console.log('[TOOL]', t.name); const r = await executeTool(t.name, t.input as Record<string, unknown>, tokens); tools.push({ name: t.name, data: r.data }); results.push({ type: 'tool_result', tool_use_id: t.id, content: r.result }) }
    resp = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: GENESIS_PROMPT, tools: TOOLS, messages: [...messages, { role: 'assistant', content: resp.content }, { role: 'user', content: results }] })
  }
  const txt = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return { text: txt?.text || '', tools }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const userId = request.cookies.get('moi_user')?.value || 'default';
    const tokens = await getUserTokens(userId);
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const audioFile = formData.get('audio') as File;
      const historyStr = formData.get('history') as string;
      if (!audioFile) return NextResponse.json({ error: 'No audio' }, { status: 400 });
      let history: HistoryMsg[] = [];
      if (historyStr) try { history = JSON.parse(historyStr) } catch { history = [] }
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      console.log('[AUDIO]', audioFile.size, 'bytes, history:', history.length);
      let transcript = '';
      if (process.env.GROQ_API_KEY) {
        const fd = new FormData(); fd.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm'); fd.append('model', 'whisper-large-v3'); fd.append('language', 'de');
        const wr = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (process.env.GROQ_API_KEY || '').trim() }, body: fd });
        if (wr.ok) { const r = await wr.json(); transcript = r.text || ''; console.log('[WHISPER]', transcript) }
      } else if (process.env.OPENAI_API_KEY) {
        const fd = new FormData(); fd.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm'); fd.append('model', 'whisper-1'); fd.append('language', 'de');
        const wr = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (process.env.OPENAI_API_KEY || '').trim() }, body: fd });
        if (wr.ok) { const r = await wr.json(); transcript = r.text || '' }
      }
      if (!transcript) return NextResponse.json({ error: 'Transcription failed', response: 'Ich konnte dich nicht verstehen.' }, { status: 200 });
      const { text, tools } = await processWithTools(transcript, history, tokens);
      const img = tools.find(t => t.data && (t.data as {type?: string}).type === 'image');
      let audioUrl = null;
      if (process.env.OPENAI_API_KEY && text) {
        try {
          const tts = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (process.env.OPENAI_API_KEY || '').trim(), 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'tts-1', voice: 'nova', input: text.substring(0, 4000), response_format: 'mp3' }) });
          if (tts.ok) { const ab = await tts.arrayBuffer(); audioUrl = 'data:audio/mp3;base64,' + Buffer.from(ab).toString('base64') }
        } catch (e) { console.error('[TTS]', e) }
      }
      return NextResponse.json({ transcript, response: text, audioUrl, toolsUsed: tools.map(t => t.name), generatedContent: img ? (img.data as {url?: string}).url : null });
    }
    const body = await request.json();
    if (!body.message) return NextResponse.json({ error: 'No message' }, { status: 400 });
    const history: HistoryMsg[] = body.history || [];
    console.log('[TEXT]', body.message, 'history:', history.length);
    const { text, tools } = await processWithTools(body.message, history, tokens);
    const img = tools.find(t => t.data && (t.data as {type?: string}).type === 'image');
    return NextResponse.json({ response: text, toolsUsed: tools.map(t => t.name), generatedContent: img ? (img.data as {url?: string}).url : null });
  } catch (error) {
    console.error('Genesis API error:', error);
    return NextResponse.json({ error: 'Internal server error', response: 'Ein Fehler ist aufgetreten.' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Genesis Engine Active', version: '3.0.0', features: ['voice', 'tts', 'tools', 'memory', 'microsoft', 'google'], tools: TOOLS.map(t => t.name) });
}
