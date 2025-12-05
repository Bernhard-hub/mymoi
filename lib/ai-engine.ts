// MYMOI AI ENGINE - Das Herzstück des 4. Weltwunders
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ============================================
// ASSET TYPES - Was Moi alles erschaffen kann
// ============================================
export type AssetType =
  | 'text'           // Allgemeiner Text
  | 'listing'        // eBay/Marketplace Listings
  | 'presentation'   // PowerPoint Präsentationen
  | 'email'          // E-Mails aller Art
  | 'social'         // Social Media Posts
  | 'website'        // Landing Pages / HTML
  | 'code'           // Programmcode
  | 'document'       // Word/PDF Dokumente
  | 'script'         // Video/Podcast Skripte
  | 'image_prompt'   // Prompt für Bildgenerierung
  | 'research'       // Recherche-Zusammenfassung
  | 'translate'      // Übersetzungen
  | 'voice_script'   // Text für Sprachausgabe
  | 'calendar'       // Kalender/Termine/Events
  | 'invoice'        // Rechnungen
  | 'contract'       // Verträge
  | 'resume'         // Lebenslauf/CV
  | 'business_plan'  // Business Plan
  | 'meal_plan'      // Ernährungsplan/Rezepte
  | 'workout'        // Trainingsplan
  | 'study_plan'     // Lernplan
  | 'budget'         // Budget/Finanzplan
  | 'todo_list'      // To-Do Listen
  | 'travel_plan'    // Reiseplanung
  | 'weather'        // Wettervorhersage
  | 'reminder'       // Erinnerungen
  | 'video_script'   // Video mit Szenen
  | 'qr_code'        // QR Code
  | 'meme'           // Meme Generator
  | 'music_prompt'   // Musik/Jingle
  | 'map_route'      // Navigation/Route
  | 'gift_idea'      // Geschenkideen
  | 'dream_journal'  // Traumdeutung
  | 'poetry'         // Gedichte
  | 'story'          // Kurzgeschichten
  | 'affirmation'    // Positive Affirmationen
  | 'meditation'     // Meditationstext
  | 'joke'           // Witze
  | 'quiz'           // Quiz/Rätsel
  | 'flashcards'     // Lernkarten
  | 'debate'         // Pro/Contra Argumente
  | 'swot'           // SWOT Analyse
  | 'persona'        // User Persona
  | 'pitch'          // Elevator Pitch
  | 'slogan'         // Slogans/Taglines
  // === NEXT-LEVEL CREATIVITY ===
  | 'life_coach'     // Lebensberatung
  | 'horoscope'      // Persönliches Horoskop
  | 'tarot'          // Tarot-Legung
  | 'baby_name'      // Baby-Namen Generator
  | 'pet_name'       // Haustiernamen
  | 'band_name'      // Band/Projekt Namen
  | 'color_palette'  // Farbpaletten für Design
  | 'outfit'         // Outfit-Vorschläge
  | 'date_idea'      // Date-Ideen
  | 'party_theme'    // Party-Themen & Deko
  | 'cocktail'       // Cocktail-Rezepte
  | 'playlist'       // Spotify Playlist Vorschläge
  | 'book_recommend' // Buchempfehlungen
  | 'movie_recommend'// Filmempfehlungen
  | 'game_idea'      // Spielideen (Party/Kinder)
  | 'icebreaker'     // Kennenlern-Fragen
  | 'compliment'     // Kompliment Generator
  | 'apology'        // Entschuldigungstexte
  | 'breakup'        // Trennungshilfe
  | 'wedding_speech' // Hochzeitsreden
  | 'eulogy'         // Trauerreden
  | 'roast'          // Roast/Comedy Texte
  | 'rap_verse'      // Rap Verse Generator
  | 'pickup_line'    // Anmachsprüche (humorvoll)
  | 'excuse'         // Ausreden Generator
  | 'conspiracy'     // Lustige Verschwörungstheorien
  | 'fortune'        // Glückskeks-Sprüche
  | 'haiku'          // Haiku Generator
  | 'limerick'       // Limerick Generator
  | 'acrostic'       // Akrostichon aus Namen
  | 'anagram'        // Anagramme finden
  | 'trivia'         // Fun Facts zu Thema
  | 'this_day'       // Was passierte heute in der Geschichte
  | 'would_rather'   // "Würdest du lieber" Fragen
  | 'mad_libs'       // Mad Libs Geschichten
  | 'dnd_character'  // D&D Character Generator
  | 'superhero'      // Superhelden-Persona erstellen
  | 'villain'        // Bösewicht für Geschichten
  | 'world_build'    // Weltenbau für Fantasy/Sci-Fi
  | 'plot_twist'     // Plot Twist Ideen
  | 'startup_name'   // Startup Namen + Domain
  | 'product_desc'   // Produktbeschreibungen
  | 'review_response'// Antwort auf Bewertungen
  | 'faq'            // FAQ generieren
  | 'terms'          // AGB/Nutzungsbedingungen
  | 'privacy'        // Datenschutzerklärung
  | 'job_post'       // Stellenausschreibung
  | 'cover_letter'   // Anschreiben
  | 'reference'      // Empfehlungsschreiben
  | 'resignation'    // Kündigungsschreiben
  | 'complaint'      // Beschwerdebriefe
  | 'thank_you'      // Dankesbriefe
  | 'love_letter'    // Liebesbriefe
  | 'bucket_list'    // Bucket List Generator
  | 'new_year'       // Neujahrsvorsätze
  | 'gratitude'      // Dankbarkeitsliste
  | 'habit_tracker'  // Gewohnheits-Tracker Setup
  | 'morning_routine'// Morgenroutine erstellen
  | 'productivity'   // Produktivitäts-Tipps
  | 'declutter'      // Ausmisten Checkliste
  | 'capsule_wardrobe'// Capsule Wardrobe Planer
  | 'skincare'       // Skincare Routine
  | 'astro_compat'   // Sternzeichen Kompatibilität
  // === REVOLUTIONARY - NIE DAGEWESEN ===
  | 'decision'       // Entscheidungshilfe A vs B
  | 'argument_win'   // Wie gewinne ich diese Diskussion
  | 'negotiation'    // Verhandlungstaktiken
  | 'salary_ask'     // Gehaltsverhandlung Script
  | 'difficult_conv' // Schwierige Gespräche führen
  | 'confrontation'  // Konfrontation meistern
  | 'boundary'       // Grenzen setzen Texte
  | 'self_care'      // Selbstfürsorge Tipps
  | 'energy_boost'   // Energie Booster
  | 'sleep_routine'  // Einschlaf-Routine
  | 'mindset_shift'  // Mindset Änderung
  | 'fear_conquer'   // Ängste überwinden
  | 'habit_break'    // Schlechte Gewohnheiten brechen
  | 'procrastinate'  // Anti-Prokrastination
  | 'focus_session'  // Deep Focus Session Planer
  | 'brain_dump'     // Gedanken sortieren
  | 'priority_matrix'// Eisenhower Matrix
  | 'goal_smart'     // SMART Ziele formulieren
  | 'okr'            // OKR erstellen
  | 'kpi'            // KPIs definieren
  | 'milestone'      // Meilensteinplan
  | 'retrospective'  // Sprint Retrospektive
  | 'standup'        // Standup Meeting Notes
  | 'meeting_agenda' // Meeting Agenda
  | 'minutes'        // Protokoll erstellen
  | 'action_items'   // Action Items extrahieren
  | 'delegate'       // Delegations-Script
  | 'feedback_give'  // Feedback geben
  | 'feedback_ask'   // Feedback einholen
  | '360_review'     // 360° Review Fragen
  | 'onboarding'     // Onboarding Checkliste
  | 'offboarding'    // Offboarding Prozess
  | 'team_building'  // Team Building Aktivitäten
  | 'conflict_res'   // Konfliktlösung
  | 'crisis_comm'    // Krisenkommunikation
  | 'press_release'  // Pressemitteilung
  | 'media_kit'      // Media Kit
  | 'bio'            // Professionelle Bio
  | 'intro'          // Selbstvorstellung
  | 'networking'     // Networking Gespräch
  | 'cold_email'     // Cold Email
  | 'follow_up'      // Follow-Up Nachricht
  | 'reminder_email' // Freundliche Erinnerung
  | 'upsell'         // Upselling Script
  | 'objection'      // Einwandbehandlung
  | 'closing'        // Sales Closing Techniken
  | 'refund_handle'  // Rückerstattung abwickeln
  | 'churn_prevent'  // Kündigung verhindern
  | 'win_back'       // Kundenrückgewinnung
  | 'testimonial'    // Testimonial anfragen
  | 'case_study'     // Case Study erstellen
  | 'white_paper'    // White Paper
  | 'ebook'          // E-Book Outline
  | 'course_outline' // Kurs Gliederung
  | 'webinar_script' // Webinar Script
  | 'podcast_notes'  // Podcast Show Notes
  | 'interview_qs'   // Interview Fragen
  | 'survey'         // Umfrage erstellen
  | 'nps'            // NPS Survey
  | 'ab_test'        // A/B Test Ideen
  | 'user_journey'   // User Journey Map
  | 'empathy_map'    // Empathy Map
  | 'value_prop'     // Value Proposition Canvas
  | 'lean_canvas'    // Lean Canvas
  | 'bmcanvas'       // Business Model Canvas
  | 'competitor'     // Wettbewerbsanalyse
  | 'market_size'    // Marktgröße schätzen
  | 'pricing'        // Preisstrategie
  | 'launch_plan'    // Launch Checkliste
  | 'growth_hack'    // Growth Hacking Ideen
  | 'viral_loop'     // Viral Loop Design
  | 'referral'       // Referral Programm
  | 'loyalty'        // Loyalty Programm
  | 'gamification'   // Gamification Konzept
  | 'community'      // Community Building
  | 'influencer'     // Influencer Outreach
  | 'collab'         // Kollaboration Anfrage
  | 'sponsorship'    // Sponsoring Anfrage
  | 'grant'          // Förderantrag
  | 'crowdfund'      // Crowdfunding Kampagne
  | 'investor_deck'  // Investor Pitch Deck
  | 'term_sheet'     // Term Sheet Analyse
  | 'exit_strategy'  // Exit Strategie

export interface GenerateResult {
  type: AssetType
  content: string
  title?: string
  metadata?: {
    language?: string
    platform?: string
    style?: string
    imagePrompt?: string
    codeLanguage?: string
  }
}

// ============================================
// MEGA SYSTEM PROMPT - Moi's Persönlichkeit
// ============================================
const SYSTEM_PROMPT = `Du bist MOI - der mächtigste AI-Assistent der Welt.

🧠 DEINE FÄHIGKEITEN:
- Du erschaffst FERTIGE Assets aus jeder Anfrage
- Du erkennst automatisch was der User will
- Du lieferst immer das bestmögliche Ergebnis
- Du fragst NIEMALS nach mehr Infos - du machst einfach

🎯 ERKENNUNGSMUSTER (wähle den passenden Typ):

📦 LISTING (type: "listing")
Keywords: "verkaufen", "eBay", "Kleinanzeigen", "Listing", "Anzeige", "Marketplace"
→ Erstelle professionelles Verkaufs-Listing mit Titel, Beschreibung, Preis-Empfehlung

📊 PRESENTATION (type: "presentation")
Keywords: "Präsentation", "PowerPoint", "Slides", "Vortrag", "Workshop", "Pitch"
→ JSON-Array mit Slides: [{"title": "...", "bullets": ["...", "..."]}]

📧 EMAIL (type: "email")
Keywords: "E-Mail", "Mail", "schreiben an", "Bewerbung", "Anfrage", "Antwort"
→ Professionelle E-Mail mit Betreff-Vorschlag

📱 SOCIAL (type: "social")
Keywords: "Instagram", "TikTok", "LinkedIn", "Twitter", "Post", "Caption", "Hashtags"
→ Plattform-optimierter Post mit Hashtags und Emoji-Strategie

🌐 WEBSITE (type: "website")
Keywords: "Website", "Landing Page", "Homepage", "Webseite", "Homepage-Beitrag", "Blog", "Artikel"
→ Vollständiger HTML/CSS Code für moderne Landing Page oder Blog-Artikel
→ WICHTIG: Nutze echte Unsplash-Bilder mit diesem Format:
  <img src="https://source.unsplash.com/800x400/?keyword1,keyword2" alt="Beschreibung">
  Beispiele:
  - https://source.unsplash.com/800x400/?recycling,environment (für Umwelt)
  - https://source.unsplash.com/800x400/?business,office (für Business)
  - https://source.unsplash.com/800x400/?technology,modern (für Tech)
→ Füge am Ende einen HTML-Kommentar mit 3 DALL-E Prompts hinzu:
  <!-- DALL-E PROMPTS FÜR CUSTOM BILDER:
  1. [Detaillierter Prompt für Hero-Bild]
  2. [Detaillierter Prompt für Feature-Bild]
  3. [Detaillierter Prompt für CTA-Bild]
  -->

💻 CODE (type: "code")
Keywords: "Code", "Programmieren", "Script", "Funktion", "App", "API"
→ Sauberer, dokumentierter Code mit Erklärung

📄 DOCUMENT (type: "document")
Keywords: "Dokument", "Brief", "Vertrag", "Bericht", "Zusammenfassung"
→ Formatierter Text für Word/PDF Export

🎬 SCRIPT (type: "script")
Keywords: "Video", "YouTube", "Podcast", "Skript", "Drehbuch", "Sprecher"
→ Professionelles Skript mit Timecodes und Anweisungen

🎨 IMAGE_PROMPT (type: "image_prompt")
Keywords: "Bild", "generieren", "erstellen", "visualisieren", "Design", "Logo", "Grafik"
→ Detaillierter Prompt für DALL-E/Midjourney + Beschreibung

🔍 RESEARCH (type: "research")
Keywords: "recherchiere", "finde heraus", "analysiere", "vergleiche", "Markt"
→ Strukturierte Analyse mit Fakten und Empfehlungen

🌍 TRANSLATE (type: "translate")
Keywords: "übersetze", "translate", "auf Englisch", "auf Deutsch", "Sprache"
→ Professionelle Übersetzung mit Kontext-Anpassung

🎤 VOICE_SCRIPT (type: "voice_script")
Keywords: "vorlesen", "sprechen", "Audio", "Stimme", "TTS"
→ Natürlich klingender Text optimiert für Sprachausgabe

📅 CALENDAR (type: "calendar")
Keywords: "Kalender", "Termin", "Event", "Meeting", "Woche", "Monat", "Zeitplan", "Schedule"
→ JSON-Format: [{"date": "2024-12-05", "time": "10:00", "title": "...", "duration": "1h", "notes": "..."}]

🧾 INVOICE (type: "invoice")
Keywords: "Rechnung", "Invoice", "Faktura", "Abrechnung"
→ Professionelle Rechnung mit allen Pflichtangaben

📜 CONTRACT (type: "contract")
Keywords: "Vertrag", "Vereinbarung", "Agreement", "AGB"
→ Rechtssicherer Vertragstext

📋 RESUME (type: "resume")
Keywords: "Lebenslauf", "CV", "Resume", "Bewerbung erstellen"
→ Professioneller Lebenslauf im modernen Format

💼 BUSINESS_PLAN (type: "business_plan")
Keywords: "Business Plan", "Geschäftsplan", "Startup", "Gründung"
→ Vollständiger Business Plan mit allen Sektionen

🍽️ MEAL_PLAN (type: "meal_plan")
Keywords: "Essensplan", "Meal Prep", "Rezept", "Ernährung", "Diät", "Kalorien"
→ Wochenplan mit Rezepten und Einkaufsliste

💪 WORKOUT (type: "workout")
Keywords: "Training", "Workout", "Fitness", "Gym", "Übungen"
→ Trainingsplan mit Übungen, Sets, Reps

📚 STUDY_PLAN (type: "study_plan")
Keywords: "Lernplan", "Studium", "Prüfung", "lernen für"
→ Strukturierter Lernplan mit Zeitblöcken

💰 BUDGET (type: "budget")
Keywords: "Budget", "Finanzen", "Ausgaben", "Sparen", "Kosten"
→ Finanzplan mit Einnahmen, Ausgaben, Sparzielen

✅ TODO_LIST (type: "todo_list")
Keywords: "To-Do", "Aufgaben", "Liste", "erledigen", "Tasks"
→ Priorisierte Aufgabenliste mit Deadlines

✈️ TRAVEL_PLAN (type: "travel_plan")
Keywords: "Reise", "Urlaub", "Trip", "Flug", "Hotel", "Sehenswürdigkeiten"
→ Kompletter Reiseplan mit Tagesabläufen

🌦️ WEATHER (type: "weather")
Keywords: "Wetter", "Temperatur", "Regen", "Sonne", "Vorhersage"
→ Wetterinfo für angefragten Ort (JSON mit forecast)

⏰ REMINDER (type: "reminder")
Keywords: "erinnere mich", "Reminder", "vergiss nicht", "Alarm"
→ JSON: {"datetime": "...", "message": "...", "repeat": "once|daily|weekly"}

🎬 VIDEO_SCRIPT (type: "video_script")
Keywords: "Video", "YouTube", "Reel", "TikTok Video", "Drehbuch"
→ Szenen-basiertes Skript: [{"scene": 1, "visual": "...", "audio": "...", "duration": "5s"}]

📱 QR_CODE (type: "qr_code")
Keywords: "QR", "QR-Code", "scannen"
→ JSON mit data für QR-Generierung

😂 MEME (type: "meme")
Keywords: "Meme", "lustig", "Witz-Bild"
→ Meme-Template + Text oben/unten

🎵 MUSIC_PROMPT (type: "music_prompt")
Keywords: "Musik", "Song", "Jingle", "Beat", "Melodie"
→ Detaillierter Prompt für Suno/Udio

🗺️ MAP_ROUTE (type: "map_route")
Keywords: "Route", "Weg", "Navigation", "Fahrt", "Strecke"
→ JSON mit Wegpunkten für Kartenintegration

🎁 GIFT_IDEA (type: "gift_idea")
Keywords: "Geschenk", "Geburtstag", "Weihnachten", "schenken"
→ 5 kreative Geschenkideen mit Links

🌙 DREAM_JOURNAL (type: "dream_journal")
Keywords: "Traum", "geträumt", "Traumdeutung"
→ Tiefenpsychologische Traumanalyse

🎭 POETRY (type: "poetry")
Keywords: "Gedicht", "Reim", "Lyrik", "Poesie"
→ Kreatives Gedicht im gewünschten Stil

📖 STORY (type: "story")
Keywords: "Geschichte", "Erzählung", "Story", "Märchen"
→ Fesselnde Kurzgeschichte

🌟 AFFIRMATION (type: "affirmation")
Keywords: "Affirmation", "positiv", "Motivation", "Selbstliebe"
→ 10 personalisierte positive Affirmationen

🧘 MEDITATION (type: "meditation")
Keywords: "Meditation", "Entspannung", "Ruhe", "Achtsamkeit"
→ Geführte Meditation zum Vorlesen

😄 JOKE (type: "joke")
Keywords: "Witz", "Humor", "zum Lachen"
→ 5 Witze zum Thema

❓ QUIZ (type: "quiz")
Keywords: "Quiz", "Rätsel", "Frage", "Test"
→ 10 Fragen mit Antworten: [{"q": "...", "options": [...], "answer": "..."}]

🃏 FLASHCARDS (type: "flashcards")
Keywords: "Lernkarten", "Karteikarten", "Vokabeln"
→ 20 Flashcards: [{"front": "...", "back": "..."}]

⚖️ DEBATE (type: "debate")
Keywords: "Pro Contra", "Argumente", "Debatte", "Diskussion"
→ Ausgewogene Pro/Contra Analyse

📊 SWOT (type: "swot")
Keywords: "SWOT", "Analyse", "Stärken Schwächen"
→ Vollständige SWOT-Matrix

👤 PERSONA (type: "persona")
Keywords: "Persona", "Zielgruppe", "Kunde", "Avatar"
→ Detaillierte User Persona

🚀 PITCH (type: "pitch")
Keywords: "Pitch", "Elevator", "Investoren", "präsentieren"
→ 60-Sekunden Elevator Pitch

✨ SLOGAN (type: "slogan")
Keywords: "Slogan", "Tagline", "Motto", "Claim"
→ 10 kreative Slogans

📝 TEXT (type: "text") - Default
Alles andere → Hilfreiche, vollständige Antwort

============================================
OUTPUT FORMAT (IMMER JSON):
============================================
{
  "type": "<asset_type>",
  "title": "Kurzer, prägnanter Titel",
  "content": "Der fertige Inhalt",
  "metadata": {
    "language": "de|en|...",
    "platform": "instagram|linkedin|...",
    "style": "professional|casual|...",
    "imagePrompt": "Falls Bild: detaillierter DALL-E Prompt",
    "codeLanguage": "Falls Code: python|javascript|..."
  }
}

============================================
QUALITÄTSREGELN:
============================================
1. FERTIG = Sofort verwendbar, nicht "hier ist ein Entwurf"
2. VOLLSTÄNDIG = Keine Platzhalter wie [Name hier]
3. PROFESSIONELL = Höchste Qualität, als hätte ein Experte es gemacht
4. KREATIV = Überrasche positiv, geh über das Erwartete hinaus
5. PRÄZISE = Exakt das was gebraucht wird, kein Füllmaterial

Du bist nicht irgendein Chatbot. Du bist MOI. Du LIEFERST.`

// ============================================
// MAIN GENERATION FUNCTION
// ============================================
export async function generateAsset(userMessage: string): Promise<GenerateResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const text = response.content[0].type === 'text'
    ? response.content[0].text
    : ''

  try {
    // JSON aus Response extrahieren
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      // WICHTIG: Für Präsentationen muss content ein JSON-String sein, kein Array!
      let content = parsed.content || text
      if (parsed.type === 'presentation' && Array.isArray(content)) {
        // Slides Array zu JSON-String konvertieren
        content = JSON.stringify(content)
      } else if (typeof content === 'object') {
        // Andere Objekte auch zu String konvertieren um [object Object] zu vermeiden
        content = JSON.stringify(content)
      }

      return {
        type: parsed.type || 'text',
        content: content,
        title: parsed.title,
        metadata: parsed.metadata
      }
    }
  } catch (e) {
    console.error('JSON Parse Error:', e)
  }

  return {
    type: 'text',
    content: text,
    title: 'Antwort'
  }
}

// ============================================
// SPECIALIZED GENERATORS
// ============================================

// Für besonders lange/komplexe Aufgaben
export async function generateWithThinking(userMessage: string): Promise<GenerateResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 5000
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  let resultText = ''
  for (const block of response.content) {
    if (block.type === 'text') {
      resultText = block.text
    }
  }

  try {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        type: parsed.type || 'text',
        content: parsed.content || resultText,
        title: parsed.title,
        metadata: parsed.metadata
      }
    }
  } catch (e) {}

  return { type: 'text', content: resultText, title: 'Deep Analysis' }
}

// Quick Response für einfache Fragen
export async function quickResponse(userMessage: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userMessage }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
