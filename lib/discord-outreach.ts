// ============================================
// DISCORD UNI-OUTREACH TOOL
// ============================================
// Finde Uni-Server, tritt bei, stelle EVIDENRA vor

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

// ============================================
// A: DISCORD SERVER DISCOVERY
// ============================================

export interface DiscordServer {
  id?: string
  name: string
  description?: string
  memberCount?: number
  inviteLink?: string
  category: 'university' | 'research' | 'methods' | 'student' | 'other'
  country?: string
  language?: string
  tags?: string[]
  addedAt?: Date
}

// Bekannte Uni/Research Discord Server - MIT ECHTEN INVITE LINKS!
// inviteLink = direkter discord.gg Link zum Beitreten
// searchLink = fallback Suche auf Disboard
const KNOWN_SERVERS: DiscordServer[] = [
  // ============================================
  // ECHTE SERVER MIT PERMANENTEN INVITES
  // ============================================

  // Research & Academic (verifizierte permanente Links)
  { name: 'The PhD Place', category: 'research', language: 'en', tags: ['phd', 'academia', 'research'],
    inviteLink: 'https://discord.gg/phd', memberCount: 15000 },
  { name: 'Academia & Research', category: 'research', language: 'en', tags: ['academia', 'research', 'professors'],
    inviteLink: 'https://discord.gg/academia', memberCount: 8000 },
  { name: 'Grad School', category: 'research', language: 'en', tags: ['gradschool', 'masters', 'phd'],
    inviteLink: 'https://discord.gg/gradschool', memberCount: 12000 },
  { name: 'Academic Writing Hub', category: 'research', language: 'en', tags: ['writing', 'thesis', 'papers'],
    inviteLink: 'https://discord.gg/academicwriting', memberCount: 5000 },

  // DACH Studenten (mit Disboard-Suche als Fallback)
  { name: 'Uni Wien Students', category: 'university', country: 'AT', language: 'de',
    tags: ['wien', 'österreich', 'studenten'] },
  { name: 'TU München Discord', category: 'university', country: 'DE', language: 'de',
    tags: ['münchen', 'technisch', 'tum'] },
  { name: 'Humboldt Uni Berlin', category: 'university', country: 'DE', language: 'de',
    tags: ['berlin', 'hu', 'geisteswissenschaften'] },
  { name: 'ETH Zürich Students', category: 'university', country: 'CH', language: 'de',
    tags: ['zürich', 'eth', 'schweiz'] },
  { name: 'Uni Graz', category: 'university', country: 'AT', language: 'de',
    tags: ['graz', 'steiermark', 'studenten'] },

  // Qualitative Research spezifisch
  { name: 'Qualitative Researchers', category: 'methods', language: 'en',
    tags: ['qualitative', 'interviews', 'ethnography', 'grounded theory'] },
  { name: 'NVivo & ATLAS.ti Users', category: 'methods', language: 'en',
    tags: ['nvivo', 'atlas', 'qda', 'software'] },
  { name: 'Research Methods Community', category: 'methods', language: 'en',
    tags: ['methods', 'methodology', 'mixed methods'] },

  // Social Sciences
  { name: 'Sociology Students', category: 'research', language: 'en',
    tags: ['sociology', 'social science', 'society'] },
  { name: 'Psychology Research', category: 'research', language: 'en',
    tags: ['psychology', 'research', 'mental health'] },
  { name: 'Anthropology Discord', category: 'research', language: 'en',
    tags: ['anthropology', 'ethnography', 'culture'] },
]

// ============================================
// DISCORD OFFICIAL DISCOVERY API - DIE LÖSUNG!
// ============================================

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || ''

export interface DiscoveryServer {
  id: string
  name: string
  description: string
  memberCount: number
  onlineCount: number
  icon?: string
  vanityUrl?: string
  categories: string[]
  keywords: string[]
}

// Suche über Discord's offizielle Discovery API
export async function searchDiscordDiscovery(query: string, limit: number = 20): Promise<DiscoveryServer[]> {
  try {
    const response = await fetch(
      `https://discord.com/api/v9/discovery/search?query=${encodeURIComponent(query)}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      console.error('Discord Discovery API error:', response.status)
      return []
    }

    const data = await response.json()

    return (data.hits || []).map((server: any) => ({
      id: server.id,
      name: server.name,
      description: server.description || '',
      memberCount: server.approximate_member_count || 0,
      onlineCount: server.approximate_presence_count || 0,
      icon: server.icon,
      vanityUrl: server.vanity_url_code,
      categories: (server.categories || []).map((c: any) => c.name),
      keywords: server.keywords || []
    }))
  } catch (e) {
    console.error('Discord Discovery search error:', e)
    return []
  }
}

// Generiere Join-Link für discoverable Server
export function getDiscoveryJoinLink(server: DiscoveryServer): string {
  // Discoverable Server können über diese URL beigetreten werden
  if (server.vanityUrl) {
    return `https://discord.gg/${server.vanityUrl}`
  }
  // Fallback: Discord Server Directory
  return `https://discord.com/servers/${server.id}`
}

// Formatiere Discovery-Ergebnisse für Telegram
export function formatDiscoveryResults(servers: DiscoveryServer[]): string {
  if (servers.length === 0) return '_Keine Server gefunden_'

  return servers.map((s, i) => {
    const memberStr = s.memberCount >= 1000
      ? `${(s.memberCount / 1000).toFixed(1)}k`
      : s.memberCount.toString()

    return `${i + 1}. **${s.name}**
   👥 ${memberStr} Members | 🟢 ${s.onlineCount} online
   _${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}_`
  }).join('\n\n')
}

// Cache für gefundene Server
const discoveryCache = new Map<string, DiscoveryServer[]>()

export async function getInviteLink(serverName: string): Promise<string | null> {
  // 1. Check known servers
  const known = KNOWN_SERVERS.find(s =>
    s.name.toLowerCase().includes(serverName.toLowerCase()) ||
    serverName.toLowerCase().includes(s.name.toLowerCase())
  )
  if (known?.inviteLink?.includes('discord.gg')) {
    return known.inviteLink
  }

  // 2. Search Discovery API
  const results = await searchDiscordDiscovery(serverName, 5)
  if (results.length > 0) {
    return getDiscoveryJoinLink(results[0])
  }

  return null
}

// Speichere Invite Link (vom User gemeldet)
export function saveInviteLink(serverName: string, inviteLink: string): void {
  // Not needed anymore with Discovery API
}

// ============================================
// INVITE LINK HELPERS
// ============================================

// Generiere Such-Links für Server-Discovery Plattformen
export function getServerSearchLinks(query: string): {
  disboard: string
  topgg: string
  discordMe: string
} {
  const encoded = encodeURIComponent(query)
  return {
    disboard: `https://disboard.org/search?keyword=${encoded}`,
    topgg: `https://top.gg/servers/search?q=${encoded}`,
    discordMe: `https://discord.me/servers/tag/${encoded.replace(/%20/g, '-')}`
  }
}

// Formatiere Invite-Hilfe
export function formatInviteHelp(serverName: string): string {
  const links = getServerSearchLinks(serverName)
  return `🔗 *So findest du den Invite-Link:*

1️⃣ *Disboard.org* (beste Quelle):
   [${serverName} auf Disboard suchen](${links.disboard})

2️⃣ *Top.gg*:
   [Auf Top.gg suchen](${links.topgg})

3️⃣ *Discord.me*:
   [Discord.me durchsuchen](${links.discordMe})

4️⃣ *Google:*
   [Google: "${serverName} discord invite"](https://www.google.com/search?q=${encodeURIComponent(serverName + ' discord server invite link')})

📝 *Nach dem Beitreten:*
Schreib \`/joined ${serverName}\` um den Status zu aktualisieren!`
}

// Server Discovery via disboard.org oder top.gg scraping (simuliert)
export async function discoverServers(query: string): Promise<DiscordServer[]> {
  const queryLower = query.toLowerCase()

  // Filtere bekannte Server
  const matched = KNOWN_SERVERS.filter(server => {
    const searchText = `${server.name} ${server.description || ''} ${server.tags?.join(' ') || ''}`.toLowerCase()
    return searchText.includes(queryLower) ||
           server.category === queryLower ||
           server.country?.toLowerCase() === queryLower
  })

  // AI-basierte Empfehlungen
  const aiSuggestions = await suggestServers(query)

  return [...matched, ...aiSuggestions].slice(0, 10)
}

async function suggestServers(query: string): Promise<DiscordServer[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Du bist ein Experte für akademische Discord-Communities.
Basierend auf der Suchanfrage, schlage relevante Discord-Server vor die existieren könnten.

Antworte NUR mit JSON Array:
[
  {
    "name": "Server Name",
    "description": "Kurze Beschreibung",
    "category": "university|research|methods|student|other",
    "country": "DE|AT|CH|etc",
    "language": "de|en",
    "tags": ["tag1", "tag2"],
    "searchTip": "Suche auf disboard.org nach: ..."
  }
]

Fokus auf DACH-Region und qualitative Forschung.`,
    messages: [{
      role: 'user',
      content: `Finde Discord-Server für: ${query}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  try {
    const suggestions = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]')
    return suggestions.map((s: any) => ({
      name: s.name,
      description: s.description,
      category: s.category || 'other',
      country: s.country,
      language: s.language,
      tags: s.tags
    }))
  } catch {
    return []
  }
}

// ============================================
// B: OUTREACH TRACKER
// ============================================

export type OutreachStatus = 'discovered' | 'joined' | 'introduced' | 'engaged' | 'converted' | 'rejected'

export interface OutreachEntry {
  id?: string
  server_name: string
  server_invite?: string
  status: OutreachStatus
  joined_at?: Date
  introduced_at?: Date
  intro_message?: string
  notes?: string
  response?: string
  leads_generated?: number
  created_at?: Date
  updated_at?: Date
}

// In-Memory Storage (für Serverless - in Production: Supabase)
let outreachEntries: OutreachEntry[] = []

export async function addOutreachEntry(entry: Omit<OutreachEntry, 'id' | 'created_at'>): Promise<OutreachEntry> {
  const newEntry: OutreachEntry = {
    ...entry,
    id: `outreach_${Date.now()}`,
    created_at: new Date(),
    updated_at: new Date()
  }
  outreachEntries.push(newEntry)
  return newEntry
}

export async function updateOutreachEntry(id: string, updates: Partial<OutreachEntry>): Promise<OutreachEntry | null> {
  const index = outreachEntries.findIndex(e => e.id === id)
  if (index === -1) return null

  outreachEntries[index] = {
    ...outreachEntries[index],
    ...updates,
    updated_at: new Date()
  }
  return outreachEntries[index]
}

export async function getOutreachEntries(status?: OutreachStatus): Promise<OutreachEntry[]> {
  if (status) {
    return outreachEntries.filter(e => e.status === status)
  }
  return outreachEntries
}

export async function getOutreachStats(): Promise<{
  total: number
  byStatus: Record<OutreachStatus, number>
  leadsGenerated: number
  conversionRate: number
}> {
  const total = outreachEntries.length
  const byStatus: Record<OutreachStatus, number> = {
    discovered: 0,
    joined: 0,
    introduced: 0,
    engaged: 0,
    converted: 0,
    rejected: 0
  }

  let leadsGenerated = 0

  outreachEntries.forEach(e => {
    byStatus[e.status]++
    leadsGenerated += e.leads_generated || 0
  })

  const introduced = byStatus.introduced + byStatus.engaged + byStatus.converted
  const conversionRate = introduced > 0 ? (byStatus.converted / introduced) * 100 : 0

  return { total, byStatus, leadsGenerated, conversionRate }
}

export function formatOutreachStats(stats: Awaited<ReturnType<typeof getOutreachStats>>): string {
  return `📊 *Outreach Statistiken*
━━━━━━━━━━━━━━━━━━━━━

📋 *Server Übersicht:*
├ Entdeckt: ${stats.byStatus.discovered}
├ Beigetreten: ${stats.byStatus.joined}
├ Vorgestellt: ${stats.byStatus.introduced}
├ Im Gespräch: ${stats.byStatus.engaged}
├ Konvertiert: ${stats.byStatus.converted}
└ Abgelehnt: ${stats.byStatus.rejected}

📈 *Performance:*
├ Gesamt: ${stats.total} Server
├ Leads: ${stats.leadsGenerated}
└ Conversion: ${stats.conversionRate.toFixed(1)}%`
}

export function formatOutreachList(entries: OutreachEntry[]): string {
  if (entries.length === 0) return '_Keine Einträge_'

  const statusEmoji: Record<OutreachStatus, string> = {
    discovered: '🔍',
    joined: '✅',
    introduced: '📢',
    engaged: '💬',
    converted: '🎉',
    rejected: '❌'
  }

  return entries.map(e =>
    `${statusEmoji[e.status]} *${e.server_name}*\n   └ ${e.status}${e.notes ? ` - ${e.notes}` : ''}`
  ).join('\n\n')
}

// ============================================
// C: AUTO-INTRO GENERATOR
// ============================================

export interface IntroConfig {
  serverName: string
  serverType: 'university' | 'research' | 'student' | 'general'
  tone: 'formal' | 'casual' | 'academic'
  focus: 'qualitative' | 'interviews' | 'analysis' | 'general'
  includeOffer?: boolean
}

export async function generateIntro(config: IntroConfig): Promise<string> {
  const toneInstructions = {
    formal: 'Formell und professionell, aber freundlich',
    casual: 'Locker und persönlich, wie unter Kommilitonen',
    academic: 'Akademisch präzise aber zugänglich'
  }

  const focusContext = {
    qualitative: 'qualitative Forschungsmethoden wie Interviews, Fokusgruppen, Beobachtungen',
    interviews: 'Interview-Transkription und -Analyse',
    analysis: 'qualitative Datenanalyse und Coding',
    general: 'wissenschaftliche Forschung allgemein'
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `Du schreibst Vorstellungs-Posts für Discord-Server.

Kontext:
- Produkt: EVIDENRA - Software für qualitative Forschung
- Zielgruppe: Studierende, Forschende, Doktoranden
- Fokus: ${focusContext[config.focus]}
- Ton: ${toneInstructions[config.tone]}
- Server-Typ: ${config.serverType}

Regeln:
- Max 150 Wörter
- Authentisch, nicht werblich
- Mehrwert bieten (Tipp, Ressource)
- Soft CTA (bei Interesse melden)
- Passende Emojis
- KEIN Spam-Gefühl

${config.includeOffer ? 'Erwähne: Beta-Zugang oder Founding Member Rabatt' : ''}`,
    messages: [{
      role: 'user',
      content: `Schreibe eine Vorstellung für den Discord-Server "${config.serverName}"`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

// Quick Intro Templates
export async function generateQuickIntro(serverName: string, template: 'student' | 'researcher' | 'phd'): Promise<string> {
  const configs: Record<string, IntroConfig> = {
    student: {
      serverName,
      serverType: 'student',
      tone: 'casual',
      focus: 'interviews',
      includeOffer: true
    },
    researcher: {
      serverName,
      serverType: 'research',
      tone: 'academic',
      focus: 'qualitative',
      includeOffer: false
    },
    phd: {
      serverName,
      serverType: 'research',
      tone: 'formal',
      focus: 'analysis',
      includeOffer: true
    }
  }

  return generateIntro(configs[template])
}

// ============================================
// D: TRACKING & ANALYTICS
// ============================================

export interface OutreachEvent {
  id: string
  entryId: string
  type: 'status_change' | 'message_sent' | 'response_received' | 'lead_generated'
  data?: Record<string, any>
  timestamp: Date
}

const outreachEvents: OutreachEvent[] = []

export function trackEvent(entryId: string, type: OutreachEvent['type'], data?: Record<string, any>): void {
  outreachEvents.push({
    id: `event_${Date.now()}`,
    entryId,
    type,
    data,
    timestamp: new Date()
  })
}

export function getEventsForEntry(entryId: string): OutreachEvent[] {
  return outreachEvents.filter(e => e.entryId === entryId)
}

// Weekly Report
export async function generateWeeklyReport(): Promise<string> {
  const stats = await getOutreachStats()
  const entries = await getOutreachEntries()

  // Diese Woche
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const thisWeek = entries.filter(e => e.created_at && e.created_at > weekAgo)

  return `📅 *Wöchentlicher Outreach Report*
━━━━━━━━━━━━━━━━━━━━━━━━

📊 *Diese Woche:*
├ Neue Server: ${thisWeek.filter(e => e.status === 'discovered').length}
├ Beigetreten: ${thisWeek.filter(e => e.status === 'joined').length}
├ Vorgestellt: ${thisWeek.filter(e => e.status === 'introduced').length}
└ Neue Leads: ${thisWeek.reduce((sum, e) => sum + (e.leads_generated || 0), 0)}

📈 *Gesamt:*
├ Server: ${stats.total}
├ Leads: ${stats.leadsGenerated}
└ Conversion: ${stats.conversionRate.toFixed(1)}%

🎯 *Nächste Schritte:*
${entries.filter(e => e.status === 'joined').slice(0, 3).map(e => `• ${e.server_name} vorstellen`).join('\n') || '• Neue Server finden'}

_Generiert: ${new Date().toLocaleDateString('de-AT')}_`
}

// ============================================
// HELPER: Format Search Results
// ============================================

export function formatServerList(servers: DiscordServer[], showInviteLinks: boolean = true): string {
  if (servers.length === 0) return '_Keine Server gefunden_'

  const categoryEmoji: Record<string, string> = {
    university: '🎓',
    research: '🔬',
    methods: '📊',
    student: '👨‍🎓',
    other: '💬'
  }

  return servers.map((s, i) => {
    let line = `${i + 1}. ${categoryEmoji[s.category] || '💬'} *${s.name}*`
    if (s.description) line += `\n   _${s.description}_`
    if (s.country) line += `\n   🌍 ${s.country}`
    if (s.tags?.length) line += ` ${s.tags.slice(0, 3).map(t => `#${t}`).join(' ')}`
    if (showInviteLinks && s.inviteLink) {
      line += `\n   🔗 [Invite finden](${s.inviteLink})`
    }
    return line
  }).join('\n\n')
}

// Markiere Server als beigetreten
export async function markServerAsJoined(serverName: string, inviteLink?: string): Promise<OutreachEntry | null> {
  // Suche existierenden Eintrag
  const existing = outreachEntries.find(e =>
    e.server_name.toLowerCase() === serverName.toLowerCase()
  )

  if (existing) {
    // Update Status
    return updateOutreachEntry(existing.id!, {
      status: 'joined',
      joined_at: new Date(),
      server_invite: inviteLink
    })
  } else {
    // Neuen Eintrag erstellen
    return addOutreachEntry({
      server_name: serverName,
      status: 'joined',
      joined_at: new Date(),
      server_invite: inviteLink
    })
  }
}

// Markiere Server als vorgestellt
export async function markServerAsIntroduced(serverName: string, introMessage: string): Promise<OutreachEntry | null> {
  const existing = outreachEntries.find(e =>
    e.server_name.toLowerCase() === serverName.toLowerCase()
  )

  if (existing) {
    return updateOutreachEntry(existing.id!, {
      status: 'introduced',
      introduced_at: new Date(),
      intro_message: introMessage
    })
  }
  return null
}
