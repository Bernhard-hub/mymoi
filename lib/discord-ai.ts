// ============================================
// DISCORD AI FEATURES
// ============================================
// AI-Announcements, Stats, Founding Tracker

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY || '').trim()
})

// ============================================
// 1. AI-GENERATED ANNOUNCEMENTS
// ============================================

export async function generateAnnouncement(
  topic: string,
  style: 'professional' | 'casual' | 'urgent' | 'celebration' = 'professional'
): Promise<string> {
  const styleInstructions = {
    professional: 'Professionell aber freundlich, mit klarer Struktur',
    casual: 'Locker und persönlich, wie ein Freund der etwas teilt',
    urgent: 'Dringend und wichtig, mit klarem Call-to-Action',
    celebration: 'Feierlich und enthusiastisch, mit vielen Emojis'
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Du bist ein Marketing-Experte für EVIDENRA, eine Software für qualitative Forschung.

Erstelle Discord-Announcements die:
- Kurz und prägnant sind (max 200 Wörter)
- Passende Emojis verwenden (aber nicht übertreiben)
- Eine klare Struktur haben (Headline, Details, Call-to-Action)
- In Deutsch geschrieben sind
- Den Stil befolgen: ${styleInstructions[style]}

Format:
🎯 **HEADLINE**

Kurze Beschreibung...

✨ **Details:**
• Punkt 1
• Punkt 2

💬 Bei Fragen: #help-and-support`,
    messages: [{
      role: 'user',
      content: `Erstelle eine Ankündigung für: ${topic}`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

// Verschiedene Announcement-Typen
export async function generateFeatureAnnouncement(feature: string, description?: string): Promise<string> {
  return generateAnnouncement(
    `Neues Feature: ${feature}${description ? ` - ${description}` : ''}`,
    'celebration'
  )
}

export async function generateMaintenanceAnnouncement(date: string, duration: string, reason?: string): Promise<string> {
  return generateAnnouncement(
    `Geplante Wartung am ${date} für ${duration}${reason ? `. Grund: ${reason}` : ''}`,
    'urgent'
  )
}

export async function generateMilestoneAnnouncement(milestone: string, details?: string): Promise<string> {
  return generateAnnouncement(
    `Milestone erreicht: ${milestone}${details ? ` - ${details}` : ''}`,
    'celebration'
  )
}

// ============================================
// 2. FOUNDING MEMBER TRACKER
// ============================================

const FOUNDING_MEMBER_TOTAL = 100

// In-Memory Cache (in Production: Supabase)
let foundingMemberCount = 0
let foundingMemberHistory: Array<{ date: string; count: number }> = []

export interface FoundingMemberStats {
  current: number
  total: number
  remaining: number
  percentage: number
  trend: 'up' | 'stable' | 'down'
  recentJoins: number // Letzte 7 Tage
  projectedSelloutDays: number | null
  milestones: {
    next: number
    reached: number[]
  }
}

export async function getFoundingMemberStats(): Promise<FoundingMemberStats> {
  // TODO: In Production aus Supabase laden
  const current = foundingMemberCount
  const remaining = FOUNDING_MEMBER_TOTAL - current
  const percentage = Math.round((current / FOUNDING_MEMBER_TOTAL) * 100)

  // Berechne Trend aus History
  const weekAgo = foundingMemberHistory.find(h => {
    const date = new Date(h.date)
    const now = new Date()
    return (now.getTime() - date.getTime()) >= 7 * 24 * 60 * 60 * 1000
  })
  const recentJoins = weekAgo ? current - weekAgo.count : current

  // Projiziere Ausverkauf
  const avgPerDay = recentJoins / 7
  const projectedSelloutDays = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null

  // Milestones
  const milestoneMarks = [10, 25, 50, 75, 90, 100]
  const reached = milestoneMarks.filter(m => current >= m)
  const next = milestoneMarks.find(m => current < m) || 100

  return {
    current,
    total: FOUNDING_MEMBER_TOTAL,
    remaining,
    percentage,
    trend: recentJoins > 3 ? 'up' : recentJoins > 0 ? 'stable' : 'down',
    recentJoins,
    projectedSelloutDays,
    milestones: { next, reached }
  }
}

export async function setFoundingMemberCount(count: number): Promise<void> {
  foundingMemberCount = count
  foundingMemberHistory.push({
    date: new Date().toISOString(),
    count
  })
  // Behalte nur letzte 30 Einträge
  if (foundingMemberHistory.length > 30) {
    foundingMemberHistory = foundingMemberHistory.slice(-30)
  }
}

export async function incrementFoundingMember(): Promise<FoundingMemberStats> {
  foundingMemberCount++
  foundingMemberHistory.push({
    date: new Date().toISOString(),
    count: foundingMemberCount
  })
  return getFoundingMemberStats()
}

export function formatFoundingMemberStats(stats: FoundingMemberStats): string {
  const progressBar = generateProgressBar(stats.percentage)
  const trendEmoji = stats.trend === 'up' ? '📈' : stats.trend === 'stable' ? '➡️' : '📉'

  let message = `🏆 *Founding Member Status*
━━━━━━━━━━━━━━━━━━━━━━━

${progressBar} ${stats.current}/${stats.total}

📊 *Details:*
├ Vergeben: ${stats.current} Plätze
├ Verfügbar: ${stats.remaining} Plätze
└ Fortschritt: ${stats.percentage}%

${trendEmoji} *Trend (7 Tage):* +${stats.recentJoins} neue Member`

  if (stats.projectedSelloutDays) {
    message += `\n\n⏳ *Prognose:*
└ Ausverkauft in: ~${stats.projectedSelloutDays} Tagen`
  }

  if (stats.milestones.reached.length > 0) {
    message += `\n\n✅ *Erreichte Milestones:* ${stats.milestones.reached.join(', ')}`
  }

  message += `\n🎯 *Nächster Milestone:* ${stats.milestones.next}`

  return message
}

function generateProgressBar(percentage: number): string {
  const filled = Math.round(percentage / 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// ============================================
// 3. DISCORD STATS
// ============================================

export interface DiscordStats {
  memberCount: number
  newMembersWeek: number
  newMembersToday: number
  foundingMembers: number
  channelActivity: Record<string, number>
  topContributor?: string
  peakHour?: string
}

// Discord API Helper
async function fetchDiscordStats(guildId: string, botToken: string): Promise<DiscordStats | null> {
  try {
    // Guild Info
    const guildRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { 'Authorization': `Bot ${botToken}` }
    })

    if (!guildRes.ok) return null

    const guild = await guildRes.json()

    return {
      memberCount: guild.approximate_member_count || 0,
      newMembersWeek: 0, // Würde Audit Log brauchen
      newMembersToday: 0,
      foundingMembers: foundingMemberCount,
      channelActivity: {},
      topContributor: undefined,
      peakHour: undefined
    }
  } catch (e) {
    console.error('Discord Stats Error:', e)
    return null
  }
}

export async function getDiscordStats(): Promise<DiscordStats | null> {
  const guildId = (process.env.DISCORD_GUILD_ID || '1449111009846366325').trim()
  const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim()

  if (!botToken) {
    // Fallback: Nur Founding Member Stats
    return {
      memberCount: 0,
      newMembersWeek: 0,
      newMembersToday: 0,
      foundingMembers: foundingMemberCount,
      channelActivity: {},
    }
  }

  return fetchDiscordStats(guildId, botToken)
}

export function formatDiscordStats(stats: DiscordStats): string {
  return `📊 *EVIDENRA Discord Stats*
━━━━━━━━━━━━━━━━━━━━━

👥 *Member:* ${stats.memberCount}
├ Diese Woche: +${stats.newMembersWeek}
├ Heute: +${stats.newMembersToday}
└ Founding Members: ${stats.foundingMembers}

${stats.topContributor ? `🏆 *Top Contributor:* ${stats.topContributor}` : ''}
${stats.peakHour ? `⏰ *Aktivste Zeit:* ${stats.peakHour}` : ''}`
}

// ============================================
// 4. AUTO-RESPONSE HELPERS
// ============================================

export interface SupportQuestion {
  userId: string
  username: string
  channelId: string
  channelName: string
  messageId: string
  content: string
  timestamp: Date
}

// Queue für unbeantwortete Fragen
const pendingSupportQuestions: SupportQuestion[] = []

export function addSupportQuestion(question: SupportQuestion): void {
  pendingSupportQuestions.push(question)
}

export function getPendingSupportQuestions(): SupportQuestion[] {
  return pendingSupportQuestions
}

export function removeSupportQuestion(messageId: string): void {
  const index = pendingSupportQuestions.findIndex(q => q.messageId === messageId)
  if (index > -1) {
    pendingSupportQuestions.splice(index, 1)
  }
}

export function formatSupportQuestion(question: SupportQuestion): string {
  return `💬 *Neue Frage in #${question.channelName}*

👤 *Von:* ${question.username}
⏰ *Zeit:* ${question.timestamp.toLocaleString('de-AT')}

📝 *Frage:*
_"${question.content}"_`
}

// AI-Suggested Response
export async function suggestSupportResponse(question: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `Du bist ein hilfsbereiter Support-Mitarbeiter für EVIDENRA (qualitative Forschungs-Software).
Antworte kurz, freundlich und hilfreich auf Deutsch.
Wenn du etwas nicht weißt, sag ehrlich dass du nachfragen musst.`,
    messages: [{
      role: 'user',
      content: question
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
