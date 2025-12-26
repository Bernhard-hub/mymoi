/**
 * EVIDENRA Daily Video Cron Job
 * ==============================
 * Läuft täglich um 9:00 UTC und sendet ein Video an Telegram
 *
 * Vercel Cron: Konfiguriert in vercel.json
 */

import { NextRequest, NextResponse } from 'next/server'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8475164997:AAHTyTQQK6-8dGfXbip7RGAxdmsoc7yY95c'
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7804985180'

// 50 EVIDENRA Marketing Videos
const VIDEOS = [
  { id: 1, title: "AKIH-Methode", script: "Kennst du die AKIH-Methode? EVIDENRA analysiert deine Interviews mit künstlicher Intelligenz - zehnmal schneller als herkömmliche Methoden." },
  { id: 2, title: "7-Persona-System", script: "Das 7-Persona-System von EVIDENRA garantiert wissenschaftliche Qualität. Sieben KI-Experten analysieren deine Daten aus verschiedenen Perspektiven." },
  { id: 3, title: "Automatische Transkription", script: "Schluss mit stundenlangem Transkribieren! EVIDENRA transkribiert deine Interviews automatisch mit 99% Genauigkeit." },
  { id: 4, title: "Thematische Analyse", script: "Thematische Analyse war noch nie so einfach. EVIDENRA erkennt automatisch Themen und Muster in deinen qualitativen Daten." },
  { id: 5, title: "Coding mit KI", script: "Manuelles Coding gehört der Vergangenheit an. EVIDENRA's KI erstellt automatisch Codes und Kategorien." },
  { id: 6, title: "Multi-Interview Analyse", script: "Analysiere hunderte Interviews gleichzeitig! EVIDENRA vergleicht automatisch Muster über alle deine Daten hinweg." },
  { id: 7, title: "Export Funktionen", script: "Von EVIDENRA direkt in deine Thesis! Exportiere deine Analyse als PDF, Word oder PowerPoint." },
  { id: 8, title: "Teamarbeit", script: "Forsche im Team mit EVIDENRA! Teile Projekte, kommentiere Codes und arbeite gemeinsam an der Analyse." },
  { id: 9, title: "Datensicherheit", script: "Deine Forschungsdaten sind sicher bei EVIDENRA. DSGVO-konform, verschlüsselt und auf europäischen Servern." },
  { id: 10, title: "Schneller Start", script: "In 5 Minuten startklar! Registriere dich, lade dein erstes Interview hoch und lass die KI arbeiten." },
  { id: 11, title: "Für Studierende", script: "Bachelor- oder Masterarbeit? EVIDENRA hilft dir, qualitative Interviews professionell zu analysieren." },
  { id: 12, title: "Für Doktoranden", script: "Deine Dissertation verdient die beste Analyse. EVIDENRA unterstützt Grounded Theory und thematische Analyse." },
  { id: 13, title: "Für Marktforscher", script: "Kundeninterviews analysieren war noch nie so effizient. EVIDENRA liefert actionable Insights." },
  { id: 14, title: "Für UX Researcher", script: "User Research auf dem nächsten Level! EVIDENRA analysiert deine Nutzerinterviews und findet Patterns." },
  { id: 15, title: "Für Therapeuten", script: "Therapiesitzungen auswerten mit KI-Unterstützung. EVIDENRA hilft bei der Analyse von Gesprächsprotokollen." },
  { id: 16, title: "Für Journalisten", script: "Investigativer Journalismus trifft KI. EVIDENRA analysiert Interviews und Quellenaussagen." },
  { id: 17, title: "Für HR Teams", script: "Exit-Interviews, Mitarbeiterbefragungen, Kulturanalysen - EVIDENRA hilft HR-Teams systematisch auszuwerten." },
  { id: 18, title: "Für Berater", script: "Consulting wird datengetrieben. EVIDENRA analysiert Stakeholder-Interviews für fundierte Empfehlungen." },
  { id: 19, title: "Für NGOs", script: "Impact messen mit qualitativer Forschung. EVIDENRA hilft Non-Profits ihre Geschichten zu dokumentieren." },
  { id: 20, title: "Für Agenturen", script: "Kreativ-Briefings basieren auf echten Insights. EVIDENRA analysiert Zielgruppen-Interviews." },
  { id: 21, title: "Zeitproblem lösen", script: "Zu wenig Zeit für die Analyse? EVIDENRA reduziert deinen Aufwand um 90%." },
  { id: 22, title: "Bias reduzieren", script: "Forschungs-Bias minimieren mit EVIDENRA. Sieben unabhängige KI-Perspektiven garantieren objektive Analyse." },
  { id: 23, title: "Konsistenz sichern", script: "Inkonsistente Codes? EVIDENRA sorgt für einheitliche Analyse über alle deine Interviews." },
  { id: 24, title: "Große Datenmengen", script: "50, 100, 200 Interviews? Kein Problem für EVIDENRA. Unsere KI skaliert mit deinem Projekt." },
  { id: 25, title: "Keine Erfahrung", script: "Neu in qualitativer Forschung? EVIDENRA führt dich Schritt für Schritt durch die Analyse." },
  { id: 26, title: "Teure Software", script: "ATLAS.ti und NVivo zu teuer? EVIDENRA bietet mehr Features zu einem Bruchteil des Preises." },
  { id: 27, title: "Komplexe Methoden", script: "Grounded Theory klingt kompliziert? EVIDENRA macht es einfach mit KI-Unterstützung." },
  { id: 28, title: "Interrater Probleme", script: "Interrater-Reliabilität war noch nie so einfach. EVIDENRA's KI-Personas liefern konsistente Analysen." },
  { id: 29, title: "Zitat-Management", script: "Nie wieder wichtige Zitate verlieren! EVIDENRA organisiert alle Belege automatisch." },
  { id: 30, title: "Report-Stress", script: "Der Abgabetermin naht? EVIDENRA generiert automatisch Zusammenfassungen und Reports." },
  { id: 31, title: "100 Founding Members", script: "Werde einer von 100 Founding Members! 70% Lifetime-Rabatt und Priority Support." },
  { id: 32, title: "Community wächst", script: "Über 500 Forscher nutzen bereits EVIDENRA. Werde Teil der Revolution!" },
  { id: 33, title: "Universitäten vertrauen", script: "Führende Universitäten setzen auf EVIDENRA. Von Wien bis Berlin." },
  { id: 34, title: "5-Sterne Bewertungen", script: "Durchschnittlich 4.9 Sterne! Nutzer lieben EVIDENRA für Zeitersparnis und Qualität." },
  { id: 35, title: "Preis steigt bald", script: "Jetzt noch zum Einführungspreis! Sichere dir heute noch deinen Zugang." },
  { id: 36, title: "Erfolgsgeschichte", script: "Maria hat ihre Masterarbeit 3 Wochen früher abgegeben - dank EVIDENRA." },
  { id: 37, title: "Team-Erfolg", script: "Ein Marktforschungs-Team analysierte 200 Kundeninterviews in einer Woche. Mit EVIDENRA." },
  { id: 38, title: "Made in Austria", script: "EVIDENRA - entwickelt in Österreich für Forscher weltweit. Europäische Qualität." },
  { id: 39, title: "Geld-zurück-Garantie", script: "Nicht zufrieden? 30 Tage Geld-zurück-Garantie. Wir sind überzeugt von EVIDENRA." },
  { id: 40, title: "Kostenlose Demo", script: "Überzeuge dich selbst! Buche eine kostenlose 15-Minuten Demo auf evidenra.com." },
  { id: 41, title: "Tipp: Upload", script: "EVIDENRA Tipp: Lade Interviews als Audio, Video oder Text hoch. Wir transkribieren automatisch!" },
  { id: 42, title: "Tipp: KI-Prompts", script: "EVIDENRA Tipp: Gib der KI Kontext zu deiner Forschungsfrage für bessere Analyse!" },
  { id: 43, title: "Tipp: Codes", script: "EVIDENRA Tipp: Die KI schlägt Codes vor - du entscheidest! Verfeinere für perfekte Ergebnisse." },
  { id: 44, title: "Tipp: Memos", script: "EVIDENRA Tipp: Nutze die Memo-Funktion für deine Gedanken und Interpretationen." },
  { id: 45, title: "Tipp: Vergleichen", script: "EVIDENRA Tipp: Vergleiche Interviews nach Kriterien - finde verborgene Muster!" },
  { id: 46, title: "Tipp: Visualisieren", script: "EVIDENRA Tipp: Nutze die Code-Map zur Visualisierung. Perfekt für Präsentationen!" },
  { id: 47, title: "Tipp: Export", script: "EVIDENRA Tipp: Exportiere Zitate mit einem Klick - mit Zeitstempel und Referenz." },
  { id: 48, title: "Tipp: Team", script: "EVIDENRA Tipp: Lade Kollegen ein! Kommentare und Codes in Echtzeit synchronisiert." },
  { id: 49, title: "Tipp: Backup", script: "EVIDENRA Tipp: Deine Projekte werden automatisch gesichert. Nie wieder Datenverlust!" },
  { id: 50, title: "Jetzt starten", script: "Bereit für bessere qualitative Forschung? Starte jetzt auf evidenra.com!" }
]

async function sendTelegramMessage(text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown'
    })
  })
}

export async function GET(request: NextRequest) {
  // Verify cron secret (optional security)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Hole aktuellen Tag (1-50, dann Reset)
    const today = new Date()
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000)
    const videoIndex = ((dayOfYear - 1) % 50) // 0-49

    const video = VIDEOS[videoIndex]

    // Sende Daily Video Message
    const message = `🎬 *EVIDENRA Daily Video* (${video.id}/50)

📌 *${video.title}*

${video.script}

━━━━━━━━━━━━━━━━━━━━

🚀 Mehr auf: [evidenra.com](https://evidenra.com)
💬 Discord: [Jetzt beitreten](https://discord.gg/2AqxmquXkz)`

    await sendTelegramMessage(message)

    console.log(`[Daily Video] Sent video ${video.id}: ${video.title}`)

    return NextResponse.json({
      success: true,
      video: video.id,
      title: video.title,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('[Daily Video] Error:', error)
    await sendTelegramMessage(`❌ *Daily Video Error*\n\n${error.message}`)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
