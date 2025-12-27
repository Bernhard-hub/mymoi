// ============================================
// CALENDAR VOICE - Termine per Stimme verwalten
// ============================================
// Google Calendar & Microsoft Outlook Integration
// + Intelligentes Zeitmanagement

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY || '').trim()
})

// ============================================
// CALENDAR EVENT INTERFACE
// ============================================

export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  location?: string
  description?: string
  attendees?: string[]
  isAllDay: boolean
  provider: 'google' | 'microsoft' | 'local'
}

// ============================================
// GOOGLE CALENDAR
// ============================================

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  daysAhead: number = 7
): Promise<CalendarEvent[]> {
  try {
    const now = new Date()
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${now.toISOString()}&` +
      `timeMax=${future.toISOString()}&` +
      `orderBy=startTime&` +
      `singleEvents=true&` +
      `maxResults=20`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    )

    if (!response.ok) return []

    const data = await response.json()

    return (data.items || []).map((event: any) => ({
      id: event.id,
      title: event.summary || 'Kein Titel',
      start: new Date(event.start.dateTime || event.start.date),
      end: new Date(event.end.dateTime || event.end.date),
      location: event.location,
      description: event.description,
      attendees: event.attendees?.map((a: any) => a.email),
      isAllDay: !!event.start.date,
      provider: 'google' as const
    }))
  } catch (e) {
    console.error('Google Calendar error:', e)
    return []
  }
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent | null> {
  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: event.title,
          location: event.location,
          description: event.description,
          start: event.isAllDay
            ? { date: event.start?.toISOString().split('T')[0] }
            : { dateTime: event.start?.toISOString() },
          end: event.isAllDay
            ? { date: event.end?.toISOString().split('T')[0] }
            : { dateTime: event.end?.toISOString() },
          attendees: event.attendees?.map(email => ({ email }))
        })
      }
    )

    if (!response.ok) {
      console.error('Create event error:', await response.text())
      return null
    }

    const created = await response.json()
    return {
      id: created.id,
      title: created.summary,
      start: new Date(created.start.dateTime || created.start.date),
      end: new Date(created.end.dateTime || created.end.date),
      location: created.location,
      isAllDay: !!created.start.date,
      provider: 'google'
    }
  } catch (e) {
    console.error('Create calendar event error:', e)
    return null
  }
}

// ============================================
// MICROSOFT CALENDAR
// ============================================

export async function fetchMicrosoftCalendarEvents(
  accessToken: string,
  daysAhead: number = 7
): Promise<CalendarEvent[]> {
  try {
    const now = new Date()
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarview?` +
      `startDateTime=${now.toISOString()}&` +
      `endDateTime=${future.toISOString()}&` +
      `$orderby=start/dateTime&` +
      `$top=20`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    )

    if (!response.ok) return []

    const data = await response.json()

    return (data.value || []).map((event: any) => ({
      id: event.id,
      title: event.subject || 'Kein Titel',
      start: new Date(event.start.dateTime + 'Z'),
      end: new Date(event.end.dateTime + 'Z'),
      location: event.location?.displayName,
      description: event.bodyPreview,
      attendees: event.attendees?.map((a: any) => a.emailAddress.address),
      isAllDay: event.isAllDay,
      provider: 'microsoft' as const
    }))
  } catch (e) {
    console.error('Microsoft Calendar error:', e)
    return []
  }
}

export async function createMicrosoftCalendarEvent(
  accessToken: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent | null> {
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: event.title,
          body: { contentType: 'Text', content: event.description || '' },
          start: {
            dateTime: event.start?.toISOString(),
            timeZone: 'Europe/Vienna'
          },
          end: {
            dateTime: event.end?.toISOString(),
            timeZone: 'Europe/Vienna'
          },
          location: event.location ? { displayName: event.location } : undefined,
          attendees: event.attendees?.map(email => ({
            emailAddress: { address: email },
            type: 'required'
          }))
        })
      }
    )

    if (!response.ok) return null

    const created = await response.json()
    return {
      id: created.id,
      title: created.subject,
      start: new Date(created.start.dateTime),
      end: new Date(created.end.dateTime),
      location: created.location?.displayName,
      isAllDay: created.isAllDay,
      provider: 'microsoft'
    }
  } catch (e) {
    console.error('Create MS event error:', e)
    return null
  }
}

// ============================================
// LOCAL CALENDAR (ohne OAuth)
// ============================================

export async function fetchLocalCalendarEvents(userId: number): Promise<CalendarEvent[]> {
  try {
    const now = new Date()
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', now.toISOString())
      .order('start_time')
      .limit(20)

    return (data || []).map(e => ({
      id: e.id,
      title: e.title,
      start: new Date(e.start_time),
      end: new Date(e.end_time),
      location: e.location,
      description: e.description,
      isAllDay: e.is_all_day,
      provider: 'local' as const
    }))
  } catch {
    return []
  }
}

export async function createLocalCalendarEvent(
  userId: number,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent | null> {
  try {
    const id = `event_${Date.now()}_${userId}`

    await supabase.from('calendar_events').insert({
      id,
      user_id: userId,
      title: event.title,
      start_time: event.start?.toISOString(),
      end_time: event.end?.toISOString(),
      location: event.location,
      description: event.description,
      is_all_day: event.isAllDay || false
    })

    return {
      id,
      title: event.title || '',
      start: event.start || new Date(),
      end: event.end || new Date(),
      location: event.location,
      isAllDay: event.isAllDay || false,
      provider: 'local'
    }
  } catch (e) {
    console.error('Create local event error:', e)
    return null
  }
}

// ============================================
// UNIFIED CALENDAR INTERFACE
// ============================================

export async function fetchUserCalendarEvents(
  userId: number,
  daysAhead: number = 7
): Promise<CalendarEvent[]> {
  // E-Mail-Config prüfen (hat auch Calendar-Zugriff)
  try {
    const { data: config } = await supabase
      .from('user_email_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('enabled', true)
      .single()

    if (config) {
      // Token refreshen falls nötig
      const { refreshAccessToken } = await import('./email-voice')
      const accessToken = await refreshAccessToken(config)

      if (accessToken) {
        if (config.provider === 'google') {
          return fetchGoogleCalendarEvents(accessToken, daysAhead)
        } else if (config.provider === 'microsoft') {
          return fetchMicrosoftCalendarEvents(accessToken, daysAhead)
        }
      }
    }
  } catch {}

  // Fallback: lokaler Kalender
  return fetchLocalCalendarEvents(userId)
}

// ============================================
// NATURAL LANGUAGE PARSING
// ============================================

export interface ParsedCalendarRequest {
  action: 'list' | 'create' | 'cancel' | 'reschedule' | 'unknown'
  title?: string
  date?: Date
  time?: string
  duration?: number // Minuten
  location?: string
  attendees?: string[]
}

export async function parseCalendarRequest(text: string): Promise<ParsedCalendarRequest> {
  // Heutiges Datum berechnen
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const todayWeekday = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][now.getDay()]

  // Morgen berechnen
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowDate = tomorrow.toISOString().split('T')[0]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `Du extrahierst Kalender-Informationen aus gesprochenem Text.

WICHTIG - Heutige Infos:
- Heute: ${today} (${todayWeekday})
- Morgen: ${tomorrowDate}
- Aktuelle Uhrzeit: ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}

Antworte NUR mit diesem JSON-Format:
{
  "action": "list|create|cancel|reschedule|unknown",
  "title": "EXAKTER Titel wie vom User gesagt",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "duration": 60,
  "location": "Ort falls genannt"
}

REGELN FÜR TITEL:
- Nimm den Titel GENAU wie der User ihn sagt
- "Termin Zahnarzt" → title: "Zahnarzt"
- "Meeting mit Müller" → title: "Meeting mit Müller"
- "Anruf bei Mama" → title: "Anruf bei Mama"
- NICHT interpretieren oder umformulieren!

REGELN FÜR DATUM:
- "morgen" → ${tomorrowDate}
- "heute" → ${today}
- "übermorgen" → +2 Tage von ${today}
- "nächsten Montag" → kommender Montag
- "am 15." → nächster 15. des Monats

REGELN FÜR ZEIT:
- "um 3" oder "um drei" → "15:00" (nachmittags annehmen)
- "um 9" → "09:00" (morgens)
- "mittags" → "12:00"
- "abends" → "18:00"

BEISPIELE:
User: "Termin Zahnarzt morgen um 10"
→ {"action":"create","title":"Zahnarzt","date":"${tomorrowDate}","time":"10:00"}

User: "Meeting mit Herrn Schmidt am Freitag 14 Uhr"
→ {"action":"create","title":"Meeting mit Herrn Schmidt","date":"[Freitag Datum]","time":"14:00"}

User: "Was habe ich morgen?"
→ {"action":"list","date":"${tomorrowDate}"}`,
    messages: [{ role: 'user', content: text }]
  })

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}')

    // Datum parsen
    if (parsed.date) {
      parsed.date = new Date(parsed.date)
    }

    return parsed
  } catch {
    return { action: 'unknown' }
  }
}

// ============================================
// VOICE FORMATTING
// ============================================

export function formatCalendarForVoice(events: CalendarEvent[], daysAhead: number = 7): string {
  if (events.length === 0) {
    return `Du hast keine Termine in den nächsten ${daysAhead} Tagen. Dein Kalender ist frei!`
  }

  // Nach Tagen gruppieren
  const byDay = new Map<string, CalendarEvent[]>()

  events.forEach(event => {
    const dayKey = event.start.toISOString().split('T')[0]
    if (!byDay.has(dayKey)) byDay.set(dayKey, [])
    byDay.get(dayKey)!.push(event)
  })

  let response = `Du hast ${events.length} Termine. `

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  byDay.forEach((dayEvents, dayKey) => {
    const dayName = dayKey === today ? 'Heute'
      : dayKey === tomorrow ? 'Morgen'
      : formatDayName(new Date(dayKey))

    response += `${dayName}: `

    dayEvents.slice(0, 3).forEach((event, i) => {
      const time = event.isAllDay ? 'ganztägig' : formatTime(event.start)
      response += `${time} ${event.title}. `
    })
  })

  return response
}

export function formatSingleEventForVoice(event: CalendarEvent): string {
  const dayName = formatDayName(event.start)
  const time = event.isAllDay ? 'ganztägig' : `um ${formatTime(event.start)}`
  const duration = event.isAllDay ? '' : ` bis ${formatTime(event.end)}`

  let response = `${event.title}, ${dayName} ${time}${duration}.`

  if (event.location) {
    response += ` Ort: ${event.location}.`
  }

  if (event.attendees?.length) {
    response += ` Mit ${event.attendees.slice(0, 3).join(', ')}.`
  }

  return response
}

function formatDayName(date: Date): string {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  return days[date.getDay()]
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ============================================
// COMMAND DETECTION
// ============================================

export function isCalendarRequest(text: string): boolean {
  const calendarKeywords = [
    'termin', 'kalender', 'calendar', 'meeting', 'besprechung',
    'was habe ich', 'wann habe ich', 'mein tag', 'meine woche',
    'morgen', 'heute', 'nächste woche', 'termine',
    'buche', 'plane', 'vereinbare', 'streich', 'absagen', 'verschieb'
  ]

  const lower = text.toLowerCase()
  return calendarKeywords.some(k => lower.includes(k))
}
