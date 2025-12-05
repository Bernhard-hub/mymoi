// ICS Kalender-Export für MOI

export interface CalendarEvent {
  title: string
  description?: string
  date: string      // YYYY-MM-DD
  time?: string     // HH:MM (24h)
  duration?: string // "1h", "30m", "2h30m"
  location?: string
  notes?: string
}

function formatDate(date: string, time?: string): string {
  // Format: 20241205T100000
  const d = date.replace(/-/g, '')
  const t = time ? time.replace(':', '') + '00' : '000000'
  return `${d}T${t}`
}

function parseDuration(duration?: string): number {
  // Returns duration in minutes
  if (!duration) return 60 // Default 1 hour

  let minutes = 0
  const hourMatch = duration.match(/(\d+)h/)
  const minMatch = duration.match(/(\d+)m/)

  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60
  if (minMatch) minutes += parseInt(minMatch[1])

  return minutes || 60
}

function addMinutes(dateStr: string, timeStr: string | undefined, minutes: number): string {
  const date = new Date(`${dateStr}T${timeStr || '00:00'}:00`)
  date.setMinutes(date.getMinutes() + minutes)

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')

  return `${y}${m}${d}T${h}${min}00`
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function createICS(events: CalendarEvent[]): string {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  // ICS Format - WICHTIG: Keine Leerzeichen am Zeilenanfang, CRLF Zeilenenden
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MOI AI Assistant//MYMOI//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:MOI Events',
    'X-WR-TIMEZONE:Europe/Vienna'
  ]

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const uid = `moi-${Date.now()}-${i}@mymoi.app`
    const dtStart = formatDate(event.date, event.time)
    const durationMinutes = parseDuration(event.duration)
    const dtEnd = addMinutes(event.date, event.time, durationMinutes)

    const description = [
      event.description,
      event.notes ? `Notizen: ${event.notes}` : ''
    ].filter(Boolean).join('\\n\\n')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${timestamp}`)
    lines.push(`DTSTART:${dtStart}`)
    lines.push(`DTEND:${dtEnd}`)
    lines.push(`SUMMARY:${escapeICS(event.title)}`)

    if (description) {
      lines.push(`DESCRIPTION:${escapeICS(description)}`)
    }

    if (event.location) {
      lines.push(`LOCATION:${escapeICS(event.location)}`)
    }

    // WICHTIG: Alarm/Reminder hinzufügen - das triggert den "Hinzufügen" Dialog!
    lines.push('BEGIN:VALARM')
    lines.push('TRIGGER:-PT15M')
    lines.push('ACTION:DISPLAY')
    lines.push(`DESCRIPTION:${escapeICS(event.title)} in 15 Minuten`)
    lines.push('END:VALARM')

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // CRLF Zeilenenden für maximale Kompatibilität
  return lines.join('\r\n')
}

// ============================================
// DIREKTE KALENDER-LINKS (Google, Apple, Outlook)
// ============================================

export interface CalendarLinks {
  google: string
  outlook: string
  apple: string // webcal: link
  office365: string
}

export function createCalendarLinks(event: CalendarEvent): CalendarLinks {
  // Datum und Zeit formatieren
  const startDate = event.date.replace(/-/g, '')
  const startTime = event.time ? event.time.replace(':', '') + '00' : '000000'
  const durationMinutes = parseDuration(event.duration)

  // End-Zeit berechnen
  const endDateTime = addMinutes(event.date, event.time, durationMinutes)

  // Für Google Calendar
  const googleStart = `${startDate}T${startTime}`
  const googleEnd = endDateTime

  // URL-encoded Werte
  const title = encodeURIComponent(event.title)
  const description = encodeURIComponent(event.description || '')
  const location = encodeURIComponent(event.location || '')

  return {
    // Google Calendar
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${googleStart}/${googleEnd}&details=${description}&location=${location}`,

    // Outlook.com (Web)
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${event.date}T${event.time || '00:00'}:00&enddt=${event.date}T${addMinutesFormatted(event.time || '00:00', durationMinutes)}&body=${description}&location=${location}`,

    // Apple Calendar (webcal link - öffnet iCal)
    apple: `webcal://`, // Wird durch ICS-Upload ersetzt

    // Office 365
    office365: `https://outlook.office.com/calendar/0/deeplink/compose?subject=${title}&startdt=${event.date}T${event.time || '00:00'}:00&enddt=${event.date}T${addMinutesFormatted(event.time || '00:00', durationMinutes)}&body=${description}&location=${location}`
  }
}

// Hilfsfunktion für Outlook Zeit-Format
function addMinutesFormatted(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + m + minutes
  const newH = Math.floor(totalMinutes / 60) % 24
  const newM = totalMinutes % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`
}

// Hilfsfunktion um Kalender-JSON von AI zu parsen
export function parseCalendarFromAI(content: string): CalendarEvent[] {
  // Bereinige den Content von Markdown Code-Blocks
  let cleanContent = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  try {
    // Versuche JSON Array zu finden
    const jsonMatch = cleanContent.match(/\[[\s\S]*?\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(e => ({
          title: e.title || e.name || 'Event',
          description: e.description || '',
          date: e.date || new Date().toISOString().split('T')[0],
          time: e.time || '10:00',
          duration: e.duration || '1h',
          location: e.location || '',
          notes: e.notes || ''
        }))
      }
    }

    // Versuche einzelnes JSON Objekt
    const objMatch = cleanContent.match(/\{[\s\S]*?\}/)
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0])
      return [{
        title: parsed.title || parsed.name || 'Event',
        description: parsed.description || '',
        date: parsed.date || new Date().toISOString().split('T')[0],
        time: parsed.time || '10:00',
        duration: parsed.duration || '1h',
        location: parsed.location || '',
        notes: parsed.notes || ''
      }]
    }
  } catch (e) {
    console.error('Calendar parse error:', e, 'Content:', cleanContent.substring(0, 200))
  }

  // Fallback: Extrahiere Infos aus Text
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Versuche Zeit zu extrahieren (z.B. "10 Uhr", "14:30")
  const timeMatch = content.match(/(\d{1,2})(?::(\d{2}))?\s*(?:uhr|Uhr|h)?/i)
  const extractedTime = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}` : '10:00'

  // Versuche Titel zu extrahieren
  const titleMatch = content.match(/(?:meeting|besprechung|termin|event)[\s:]*(.+?)(?:\s+(?:um|morgen|heute|am)|\s*$)/i)
  const extractedTitle = titleMatch ? titleMatch[1].trim() : content.substring(0, 50)

  return [{
    title: extractedTitle || 'Event',
    description: content,
    date: tomorrow.toISOString().split('T')[0],
    time: extractedTime,
    duration: '1h'
  }]
}
