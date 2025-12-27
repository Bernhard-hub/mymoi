/**
 * ElevenLabs Integration
 * ======================
 * Text-to-Speech mit ultra-realistischen deutschen Stimmen
 *
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech
 */

// API Key wird aus Environment geladen
const ELEVENLABS_API_KEY = (process.env.ELEVENLABS_API_KEY || '').trim()

const API_BASE = 'https://api.elevenlabs.io/v1'

// Verfuegbare deutsche Stimmen (Premium)
export const GERMAN_VOICES = {
  // Weibliche Stimmen
  sarah: { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', description: 'Warm und professionell' },
  bella: { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', description: 'Jung und energisch' },
  rachel: { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', description: 'Amerikanisch, klar' },

  // Maennliche Stimmen
  adam: { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', description: 'Tief und vertrauenswuerdig' },
  josh: { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', description: 'Jung und dynamisch' },
  arnold: { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', description: 'Amerikanisch, stark' },

  // Multilingual (beste fuer Deutsch)
  multilingual_v2: { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Multilingual', gender: 'neutral', description: 'Beste Qualitaet fuer Deutsch' }
}

// Models
export const MODELS = {
  multilingual_v2: 'eleven_multilingual_v2',  // Beste Qualitaet
  flash_v2_5: 'eleven_flash_v2_5',            // Schnellste (75ms Latenz)
  turbo_v2_5: 'eleven_turbo_v2_5',            // Schnell + Gut
}

export interface VoiceSettings {
  stability?: number       // 0-1, default 0.5
  similarity_boost?: number // 0-1, default 0.75
  style?: number           // 0-1, default 0 (nur multilingual_v2)
  use_speaker_boost?: boolean
}

export interface TTSOptions {
  voice?: keyof typeof GERMAN_VOICES | string  // Voice ID oder Name
  model?: keyof typeof MODELS
  settings?: VoiceSettings
  language?: string  // ISO 639-1 code, z.B. 'de' fuer Deutsch
  output_format?: 'mp3_44100_128' | 'mp3_22050_32' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000'
}

/**
 * Text zu Sprache konvertieren
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<{ success: boolean; audio?: Buffer; error?: string }> {

  if (!ELEVENLABS_API_KEY) {
    return { success: false, error: 'ELEVENLABS_API_KEY nicht konfiguriert' }
  }

  // Voice ID bestimmen
  let voiceId = options.voice || 'multilingual_v2'
  if (voiceId in GERMAN_VOICES) {
    voiceId = GERMAN_VOICES[voiceId as keyof typeof GERMAN_VOICES].id
  }

  // Model bestimmen
  const modelId = options.model
    ? MODELS[options.model]
    : MODELS.multilingual_v2

  const requestBody = {
    text,
    model_id: modelId,
    language_code: options.language || 'de',
    voice_settings: {
      stability: options.settings?.stability ?? 0.5,
      similarity_boost: options.settings?.similarity_boost ?? 0.75,
      style: options.settings?.style ?? 0.3,
      use_speaker_boost: options.settings?.use_speaker_boost ?? true
    }
  }

  try {
    const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `ElevenLabs API Error: ${response.status} - ${errorText}` }
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer())
    return { success: true, audio: audioBuffer }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Text zu Sprache streamen (fuer lange Texte)
 */
export async function textToSpeechStream(
  text: string,
  options: TTSOptions = {}
): Promise<{ success: boolean; stream?: ReadableStream; error?: string }> {

  if (!ELEVENLABS_API_KEY) {
    return { success: false, error: 'ELEVENLABS_API_KEY nicht konfiguriert' }
  }

  let voiceId = options.voice || 'multilingual_v2'
  if (voiceId in GERMAN_VOICES) {
    voiceId = GERMAN_VOICES[voiceId as keyof typeof GERMAN_VOICES].id
  }

  const modelId = options.model
    ? MODELS[options.model]
    : MODELS.multilingual_v2

  try {
    const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        language_code: options.language || 'de',
        voice_settings: {
          stability: options.settings?.stability ?? 0.5,
          similarity_boost: options.settings?.similarity_boost ?? 0.75,
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Stream Error: ${response.status} - ${errorText}` }
    }

    return { success: true, stream: response.body as ReadableStream }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Verfuegbare Stimmen abrufen
 */
export async function getVoices(): Promise<{ success: boolean; voices?: any[]; error?: string }> {
  if (!ELEVENLABS_API_KEY) {
    return { success: false, error: 'ELEVENLABS_API_KEY nicht konfiguriert' }
  }

  try {
    const response = await fetch(`${API_BASE}/voices`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    })

    if (!response.ok) {
      return { success: false, error: `API Error: ${response.status}` }
    }

    const data = await response.json()
    return { success: true, voices: data.voices }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Nutzungslimits pruefen
 */
export async function getUsage(): Promise<{
  success: boolean
  character_count?: number
  character_limit?: number
  remaining?: number
  error?: string
}> {
  if (!ELEVENLABS_API_KEY) {
    return { success: false, error: 'ELEVENLABS_API_KEY nicht konfiguriert' }
  }

  try {
    const response = await fetch(`${API_BASE}/user/subscription`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    })

    if (!response.ok) {
      return { success: false, error: `API Error: ${response.status}` }
    }

    const data = await response.json()
    return {
      success: true,
      character_count: data.character_count,
      character_limit: data.character_limit,
      remaining: data.character_limit - data.character_count
    }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Audio-Datei mit Voiceover erstellen
 * Speichert direkt als MP3 Datei
 */
export async function createVoiceover(
  text: string,
  outputPath: string,
  options: TTSOptions = {}
): Promise<{ success: boolean; path?: string; error?: string }> {

  const result = await textToSpeech(text, options)

  if (!result.success || !result.audio) {
    return { success: false, error: result.error }
  }

  try {
    const fs = await import('fs')
    fs.writeFileSync(outputPath, result.audio)
    return { success: true, path: outputPath }
  } catch (error: any) {
    return { success: false, error: `Datei speichern fehlgeschlagen: ${error.message}` }
  }
}

/**
 * EVIDENRA Marketing Voiceover generieren
 */
export async function createEvidenraVoiceover(
  customText?: string
): Promise<{ success: boolean; audio?: Buffer; error?: string }> {

  const defaultText = `
    EVIDENRA Professional - Die fuehrende Software fuer qualitative Forschung mit kuenstlicher Intelligenz.

    Analysieren Sie Interviews zehnmal schneller mit der AKIH-Methode.
    Unser 7-Persona-System garantiert hoechste Inter-Rater-Reliabilitaet.

    Jetzt mit 60 Prozent Founding Members Rabatt!

    Besuchen Sie evidenra.com und starten Sie Ihre kostenlose Testversion.
  `

  const text = customText || defaultText

  return textToSpeech(text, {
    voice: 'sarah',
    model: 'multilingual_v2',
    language: 'de',
    settings: {
      stability: 0.6,
      similarity_boost: 0.8,
      style: 0.4
    }
  })
}
