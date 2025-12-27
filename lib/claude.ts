import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY || '').replace(/\\n/g, '').trim(),
})

export type AssetType = 'text' | 'listing' | 'presentation' | 'email'

interface GenerateResult {
  type: AssetType
  content: string
  title?: string
}

const SYSTEM_PROMPT = `Du bist Moi. Du erschaffst fertige Assets aus Sprachnachrichten.

REGELN:
- Liefere FERTIGE Ergebnisse, keine Entwürfe
- Frag NIEMALS nach mehr Informationen
- Mach das Beste aus dem was du bekommst
- Sei knapp in Erklärungen, großzügig im Output

ERKENNE automatisch was der User will:
- "Listing", "verkaufen", "eBay" → eBay-Listing
- "Präsentation", "Workshop", "Vortrag" → Präsentation (JSON für PPTX)
- "Mail", "schreiben an" → E-Mail
- Sonst → Passender Text

OUTPUT FORMAT:
Antworte IMMER mit JSON:
{
  "type": "listing" | "presentation" | "email" | "text",
  "title": "Kurzer Titel",
  "content": "Der fertige Inhalt"
}

Für Präsentationen: content ist JSON-Array mit Slides:
[{"title": "...", "bullets": ["...", "..."]}, ...]
`

export async function generateAsset(userMessage: string): Promise<GenerateResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
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
      return JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    // Fallback wenn kein JSON
  }

  return {
    type: 'text',
    content: text,
    title: 'Antwort'
  }
}
