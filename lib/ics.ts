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

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//MOI AI Assistant//MYMOI//DE
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:MOI Events
X-WR-TIMEZONE:Europe/Vienna
`

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

    ics += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${timestamp}
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${escapeICS(event.title)}
`

    if (description) {
      ics += `DESCRIPTION:${escapeICS(description)}\n`
    }

    if (event.location) {
      ics += `LOCATION:${escapeICS(event.location)}\n`
    }

    ics += `END:VEVENT
`
  }

  ics += `END:VCALENDAR`

  return ics
}

// Hilfsfunktion um Kalender-JSON von AI zu parsen
export function parseCalendarFromAI(content: string): CalendarEvent[] {
  try {
    // Versuche JSON zu parsen
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) {
        return parsed.map(e => ({
          title: e.title || e.name || 'Event',
          description: e.description,
          date: e.date || new Date().toISOString().split('T')[0],
          time: e.time,
          duration: e.duration,
          location: e.location,
          notes: e.notes
        }))
      }
    }
  } catch (e) {
    console.error('Calendar parse error:', e)
  }

  // Fallback: Einzelnes Event aus Text
  return [{
    title: 'Event',
    description: content,
    date: new Date().toISOString().split('T')[0]
  }]
}
