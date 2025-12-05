import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { processDueFollowUps, sendMorningBriefing } from '@/lib/moi-autonomous'

// ============================================
// CRON: AUTONOMOUS TASKS
// ============================================
// Vercel Cron oder externer Trigger (alle 15 Minuten)

export async function GET(request: NextRequest) {
  // Sicherheits-Check (optional)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Ohne Secret trotzdem ausführen (für einfacheres Testing)
    console.log('⚠️ Cron ohne Auth - läuft trotzdem')
  }

  const results: string[] = []
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  // ============================================
  // 1. FOLLOW-UPS VERARBEITEN
  // ============================================
  try {
    const processed = await processDueFollowUps()
    results.push(`✅ ${processed} Follow-Ups verarbeitet`)
  } catch (e: any) {
    results.push(`❌ Follow-Ups Fehler: ${e.message}`)
  }

  // ============================================
  // 2. MORNING BRIEFINGS (nur morgens 7-9 Uhr)
  // ============================================
  if (currentHour >= 7 && currentHour <= 9) {
    try {
      // Alle aktiven Briefing-Configs für diese Stunde laden
      const timePattern = `${currentHour.toString().padStart(2, '0')}:${Math.floor(currentMinute / 15) * 15}`

      const { data: briefingConfigs } = await supabase
        .from('morning_briefing_configs')
        .select('*')
        .eq('enabled', true)
        .gte('time', `${currentHour.toString().padStart(2, '0')}:00`)
        .lt('time', `${currentHour.toString().padStart(2, '0')}:59`)

      if (briefingConfigs && briefingConfigs.length > 0) {
        for (const config of briefingConfigs) {
          try {
            await sendMorningBriefing(config.user_id, config.phone)
            results.push(`✅ Briefing an ${config.phone} gesendet`)
          } catch (e: any) {
            results.push(`❌ Briefing Fehler für ${config.user_id}: ${e.message}`)
          }
        }
      } else {
        results.push(`ℹ️ Keine Briefings für ${currentHour}:xx geplant`)
      }
    } catch (e: any) {
      results.push(`❌ Briefing Fehler: ${e.message}`)
    }
  }

  // ============================================
  // 3. REMINDER CHECKS (aus Brain-System)
  // ============================================
  try {
    // Fällige Erinnerungen
    const { data: dueReminders } = await supabase
      .from('customer_notes')
      .select('*, users!inner(phone)')
      .eq('deal_status', 'negotiation')
      .lte('next_action_date', now.toISOString().split('T')[0])
      .limit(20)

    if (dueReminders && dueReminders.length > 0) {
      results.push(`ℹ️ ${dueReminders.length} fällige Aktionen gefunden`)
      // TODO: Notifications senden
    }
  } catch (e: any) {
    // Tabelle existiert vielleicht nicht
    results.push(`ℹ️ Reminder-Check übersprungen`)
  }

  // ============================================
  // 4. CLEANUP: Alte Daten aufräumen
  // ============================================
  try {
    // Abgelaufene Clarifications löschen
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('pending_clarifications')
      .delete()
      .lt('created_at', expired)
      .eq('status', 'pending')

    results.push(`✅ Cleanup durchgeführt`)
  } catch {
    // Optional
  }

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    results
  })
}

// Auch POST erlauben (für manuelle Trigger)
export async function POST(request: NextRequest) {
  return GET(request)
}
