// Genesis Engine - PWA Voice API
// Handles audio transcription, AI processing, and optional TTS
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Genesis System Prompt - Self-evolving AI personality
const GENESIS_PROMPT = `Du bist MOI - Genesis Engine.
Ein revolutionäres AI-System das sich selbst weiterentwickelt.

🧬 GENESIS CORE PRINCIPLES:
1. Du lernst aus jeder Interaktion
2. Du adaptierst dich an den User
3. Du erschaffst, bevor gefragt wird
4. Du bist proaktiv, nicht reaktiv

🎯 DEINE MISSION:
- Verstehe die tiefere Intention hinter jeder Anfrage
- Liefere nicht nur Antworten, sondern Lösungen
- Sei ein Partner, kein Werkzeug
- Antizipiere Bedürfnisse

🗣️ KOMMUNIKATION:
- Kurz und prägnant für Voice-Ausgabe
- Maximal 2-3 Sätze pro Antwort
- Natürlich und freundlich
- Deutsch als Hauptsprache

Du sprichst immer in der ersten Person als MOI.`

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    // Handle audio upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const audioFile = formData.get('audio') as File

      if (!audioFile) {
        return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
      }

      // Convert to buffer for Whisper API
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

      // Transcribe with Groq Whisper (fast and accurate)
      let transcript = ''

      if (process.env.GROQ_API_KEY) {
        const groqFormData = new FormData()
        groqFormData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')
        groqFormData.append('model', 'whisper-large-v3')
        groqFormData.append('language', 'de')

        const whisperResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: groqFormData
        })

        if (whisperResponse.ok) {
          const result = await whisperResponse.json()
          transcript = result.text || ''
        }
      } else if (process.env.OPENAI_API_KEY) {
        // Fallback to OpenAI Whisper
        const openaiFormData = new FormData()
        openaiFormData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')
        openaiFormData.append('model', 'whisper-1')
        openaiFormData.append('language', 'de')

        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: openaiFormData
        })

        if (whisperResponse.ok) {
          const result = await whisperResponse.json()
          transcript = result.text || ''
        }
      }

      if (!transcript) {
        return NextResponse.json({
          error: 'Transcription failed',
          response: 'Ich konnte dich leider nicht verstehen. Bitte versuche es nochmal.'
        }, { status: 200 })
      }

      // Process with Claude
      const aiResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: GENESIS_PROMPT,
        messages: [
          { role: 'user', content: transcript }
        ]
      })

      const responseText = aiResponse.content[0].type === 'text'
        ? aiResponse.content[0].text
        : ''

      // Generate TTS audio URL if OpenAI available
      let audioUrl = null
      if (process.env.OPENAI_API_KEY && responseText) {
        try {
          const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'tts-1',
              voice: 'nova',
              input: responseText.substring(0, 1000),
              response_format: 'mp3'
            })
          })

          if (ttsResponse.ok) {
            const audioBuffer = await ttsResponse.arrayBuffer()
            const base64Audio = Buffer.from(audioBuffer).toString('base64')
            audioUrl = `data:audio/mp3;base64,${base64Audio}`
          }
        } catch (ttsError) {
          console.error('TTS error:', ttsError)
        }
      }

      return NextResponse.json({
        transcript,
        response: responseText,
        audioUrl
      })
    }

    // Handle text input (fallback)
    const body = await request.json()
    const { message } = body

    if (!message) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 })
    }

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: GENESIS_PROMPT,
      messages: [
        { role: 'user', content: message }
      ]
    })

    const responseText = aiResponse.content[0].type === 'text'
      ? aiResponse.content[0].text
      : ''

    return NextResponse.json({
      response: responseText
    })

  } catch (error) {
    console.error('Genesis API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      response: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.'
    }, { status: 500 })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'Genesis Engine Active',
    version: '1.0.0',
    features: ['voice-transcription', 'ai-response', 'tts']
  })
}
