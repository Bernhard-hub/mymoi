/**
 * HeyGen Integration
 * ==================
 * AI Avatar Video Erstellung mit realistisch sprechenden Menschen
 *
 * Docs: https://docs.heygen.com/reference/create-an-avatar-video-v2
 */

// API Key wird aus Environment geladen
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || ''

const API_BASE = 'https://api.heygen.com/v2'
const API_V1 = 'https://api.heygen.com/v1'

// HeyGen Avatare - NUR JUNGE AVATARE (<35 Jahre)
// IDs von https://api.heygen.com/v2/avatars
export const AVATARS = {
  // Weibliche Avatare - Jung & Professional (20-30 Jahre)
  abigail: { id: 'Abigail_expressive_2024112501', name: 'Abigail', gender: 'female', style: 'professional', age: 25 },
  anna: { id: 'Abigail_expressive_2024112501', name: 'Abigail', gender: 'female', style: 'professional', age: 25 },
  amanda: { id: 'Amanda_in_Blue_Shirt_Front', name: 'Amanda', gender: 'female', style: 'casual', age: 28 },

  // Maennliche Avatare - Jung & Professional (25-35 Jahre)
  aditya: { id: 'Aditya_public_1', name: 'Aditya', gender: 'male', style: 'professional', age: 28 },
  adrian: { id: 'Adrian_public_2_20240312', name: 'Adrian', gender: 'male', style: 'business', age: 32 },

  // Aliases fuer Kompatibilitaet
  marcus: { id: 'Adrian_public_2_20240312', name: 'Adrian', gender: 'male', style: 'business', age: 32 },
  josh: { id: 'Aditya_public_1', name: 'Aditya', gender: 'male', style: 'professional', age: 28 },
  kayla: { id: 'Amanda_in_Blue_Shirt_Front', name: 'Amanda', gender: 'female', style: 'casual', age: 28 }
}

// HeyGen Stimmen - Native HeyGen voices mit Deutsch-Support via Locale
export const VOICES = {
  // HeyGen Native Stimmen (mit support_locale fuer Deutsch)
  german_female: { voice_id: '6bc024e311ee41dbb66ae24c9c53f0b5', locale: 'de-DE' }, // Ann - IA (weiblich)
  german_male: { voice_id: '6f94c8b2a6784a1d92ffbe0339138f31', locale: 'de-DE' },   // Anthony - IA (maennlich)

  // Alternative deutsche Stimmen
  ann: { voice_id: '6bc024e311ee41dbb66ae24c9c53f0b5', locale: 'de-DE' },
  anthony: { voice_id: '6f94c8b2a6784a1d92ffbe0339138f31', locale: 'de-DE' },
  georgia: { voice_id: '6e4d89218fa24eb3b3fe4faa16a15895', locale: 'de-DE' }, // Georgia - Lifelike
  chloe: { voice_id: '6e05e310c3f14ed4ba1545578ce82ff6', locale: 'de-DE' },   // Chloe - Lifelike

  // Englische Stimmen (fuer englische Videos)
  english_female: { voice_id: '6bc024e311ee41dbb66ae24c9c53f0b5', locale: 'en-US' },
  english_male: { voice_id: '6f94c8b2a6784a1d92ffbe0339138f31', locale: 'en-US' }
}

export interface VideoConfig {
  avatar?: keyof typeof AVATARS | string  // Avatar ID oder Name
  voice?: keyof typeof VOICES | string    // Voice ID oder Name
  script: string                          // Der Text der gesprochen wird
  title?: string                          // Video Titel
  background?: {
    type: 'color' | 'image' | 'video'
    value: string  // Hex color, URL, oder Video URL
  }
  dimension?: {
    width: number
    height: number
  }
  aspectRatio?: '16:9' | '9:16' | '1:1'   // Fuer Social Media
}

export interface VideoStatus {
  video_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  video_url?: string
  thumbnail_url?: string
  duration?: number
  error?: string
}

/**
 * Avatar Video erstellen
 */
export async function createAvatarVideo(
  config: VideoConfig
): Promise<{ success: boolean; video_id?: string; error?: string }> {

  if (!HEYGEN_API_KEY) {
    return { success: false, error: 'HEYGEN_API_KEY nicht konfiguriert' }
  }

  // Avatar ID bestimmen
  let avatarId = config.avatar || 'anna'
  if (avatarId in AVATARS) {
    avatarId = AVATARS[avatarId as keyof typeof AVATARS].id
  }

  // Voice bestimmen - mit Locale Support fuer deutsche Aussprache
  let voiceConfig: any = { type: 'text', input_text: config.script }
  if (config.voice) {
    if (config.voice in VOICES) {
      const voice = VOICES[config.voice as keyof typeof VOICES]
      voiceConfig.voice_id = voice.voice_id
      // Locale hinzufuegen fuer korrekte Sprache
      if ('locale' in voice && voice.locale) {
        voiceConfig.locale = voice.locale
      }
    } else {
      voiceConfig.voice_id = config.voice
    }
  } else {
    // Default: Deutsche HeyGen Stimme (Ann)
    voiceConfig.voice_id = VOICES.german_female.voice_id
    voiceConfig.locale = 'de-DE'
  }

  // Dimension bestimmen - 720p als Default (Creator Plan kompatibel)
  let dimension = config.dimension || { width: 1280, height: 720 }
  if (config.aspectRatio === '9:16') {
    dimension = { width: 720, height: 1280 }
  } else if (config.aspectRatio === '1:1') {
    dimension = { width: 720, height: 720 }
  }

  const requestBody = {
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal'
        },
        voice: voiceConfig,
        background: config.background || {
          type: 'color',
          value: '#00FF00'  // Gruen fuer Chromakey-Compositing
        }
      }
    ],
    dimension,
    title: config.title || 'EVIDENRA Video'
  }

  try {
    const response = await fetch(`${API_BASE}/video/generate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY
      },
      body: JSON.stringify(requestBody)
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      return { success: false, error: data.error?.message || `API Error: ${response.status}` }
    }

    return { success: true, video_id: data.data?.video_id }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Video Status pruefen
 */
export async function getVideoStatus(videoId: string): Promise<VideoStatus> {
  if (!HEYGEN_API_KEY) {
    return { video_id: videoId, status: 'failed', error: 'HEYGEN_API_KEY nicht konfiguriert' }
  }

  try {
    const response = await fetch(`${API_V1}/video_status.get?video_id=${videoId}`, {
      headers: {
        'Accept': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY
      }
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      return { video_id: videoId, status: 'failed', error: data.error?.message }
    }

    return {
      video_id: videoId,
      status: data.data?.status || 'pending',
      video_url: data.data?.video_url,
      thumbnail_url: data.data?.thumbnail_url,
      duration: data.data?.duration
    }

  } catch (error: any) {
    return { video_id: videoId, status: 'failed', error: error.message }
  }
}

/**
 * Auf Video-Fertigstellung warten
 */
export async function waitForVideo(
  videoId: string,
  maxWaitMs: number = 300000,  // 5 Minuten default
  checkIntervalMs: number = 10000  // Alle 10 Sekunden
): Promise<VideoStatus> {

  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getVideoStatus(videoId)

    if (status.status === 'completed' || status.status === 'failed') {
      return status
    }

    await new Promise(r => setTimeout(r, checkIntervalMs))
  }

  return {
    video_id: videoId,
    status: 'failed',
    error: 'Timeout: Video-Erstellung dauerte zu lange'
  }
}

/**
 * Verfuegbare Avatare abrufen
 */
export async function listAvatars(): Promise<{ success: boolean; avatars?: any[]; error?: string }> {
  if (!HEYGEN_API_KEY) {
    return { success: false, error: 'HEYGEN_API_KEY nicht konfiguriert' }
  }

  try {
    const response = await fetch(`${API_V1}/avatars`, {
      headers: {
        'Accept': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY
      }
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: `API Error: ${response.status}` }
    }

    return { success: true, avatars: data.data?.avatars || [] }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Verfuegbare Stimmen abrufen
 */
export async function listVoices(): Promise<{ success: boolean; voices?: any[]; error?: string }> {
  if (!HEYGEN_API_KEY) {
    return { success: false, error: 'HEYGEN_API_KEY nicht konfiguriert' }
  }

  try {
    const response = await fetch(`${API_V1}/voices`, {
      headers: {
        'Accept': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY
      }
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: `API Error: ${response.status}` }
    }

    return { success: true, voices: data.data?.voices || [] }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Kontolimits pruefen
 */
export async function getQuota(): Promise<{
  success: boolean
  remaining_quota?: number
  error?: string
}> {
  if (!HEYGEN_API_KEY) {
    return { success: false, error: 'HEYGEN_API_KEY nicht konfiguriert' }
  }

  try {
    const response = await fetch(`${API_V1}/user/remaining_quota`, {
      headers: {
        'Accept': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY
      }
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: `API Error: ${response.status}` }
    }

    return { success: true, remaining_quota: data.data?.remaining_quota }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Video herunterladen
 */
export async function downloadVideo(
  videoUrl: string,
  outputPath: string
): Promise<{ success: boolean; path?: string; error?: string }> {

  try {
    const response = await fetch(videoUrl)

    if (!response.ok) {
      return { success: false, error: `Download Error: ${response.status}` }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const fs = await import('fs')
    fs.writeFileSync(outputPath, buffer)

    return { success: true, path: outputPath }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * EVIDENRA Marketing Video erstellen
 * Kompletter Workflow: Script -> Avatar Video -> Download
 */
export async function createEvidenraVideo(options: {
  script?: string
  avatar?: keyof typeof AVATARS
  voice?: keyof typeof VOICES
  aspectRatio?: '16:9' | '9:16' | '1:1'
  outputPath?: string
} = {}): Promise<{
  success: boolean
  video_id?: string
  video_url?: string
  local_path?: string
  error?: string
}> {

  const defaultScript = `
Hallo! Ich bin hier, um Ihnen EVIDENRA vorzustellen.

EVIDENRA ist die fuehrende Software fuer qualitative Forschung mit kuenstlicher Intelligenz.

Mit unserer AKIH-Methode analysieren Sie Interviews zehnmal schneller als mit herkoemmlichen Methoden.

Unser einzigartiges 7-Persona-System garantiert hoechste wissenschaftliche Qualitaet.

Jetzt mit 60 Prozent Rabatt fuer Founding Members!

Besuchen Sie evidenra punkt com und starten Sie Ihre kostenlose Testversion noch heute.

EVIDENRA - Qualitative Forschung neu definiert.
  `.trim()

  // 1. Video erstellen
  const createResult = await createAvatarVideo({
    script: options.script || defaultScript,
    avatar: options.avatar || 'anna',
    voice: options.voice || 'german_female',
    aspectRatio: options.aspectRatio || '16:9',
    title: 'EVIDENRA Marketing Video',
    background: {
      type: 'color',
      value: '#1a1a2e'  // Dunkler Hintergrund
    }
  })

  if (!createResult.success || !createResult.video_id) {
    return { success: false, error: createResult.error }
  }

  // 2. Auf Fertigstellung warten
  const status = await waitForVideo(createResult.video_id, 600000)  // Max 10 Minuten

  if (status.status !== 'completed' || !status.video_url) {
    return {
      success: false,
      video_id: createResult.video_id,
      error: status.error || 'Video-Erstellung fehlgeschlagen'
    }
  }

  // 3. Optional: Herunterladen
  let localPath: string | undefined
  if (options.outputPath) {
    const downloadResult = await downloadVideo(status.video_url, options.outputPath)
    if (downloadResult.success) {
      localPath = downloadResult.path
    }
  }

  return {
    success: true,
    video_id: createResult.video_id,
    video_url: status.video_url,
    local_path: localPath
  }
}

/**
 * Talking Photo Video erstellen (guenstiger als Avatar)
 */
export async function createTalkingPhotoVideo(config: {
  photoUrl: string      // URL zum Foto
  script: string        // Text zum Sprechen
  voice?: keyof typeof VOICES | string
}): Promise<{ success: boolean; video_id?: string; error?: string }> {

  if (!HEYGEN_API_KEY) {
    return { success: false, error: 'HEYGEN_API_KEY nicht konfiguriert' }
  }

  let voiceId = config.voice || 'german_female'
  if (voiceId in VOICES) {
    voiceId = VOICES[voiceId as keyof typeof VOICES].voice_id
  }

  const requestBody = {
    video_inputs: [
      {
        character: {
          type: 'talking_photo',
          talking_photo_url: config.photoUrl
        },
        voice: {
          type: 'text',
          input_text: config.script,
          voice_id: voiceId
        }
      }
    ],
    dimension: { width: 1280, height: 720 }  // 720p fuer Creator Plan
  }

  try {
    const response = await fetch(`${API_BASE}/video/generate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY
      },
      body: JSON.stringify(requestBody)
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      return { success: false, error: data.error?.message || `API Error: ${response.status}` }
    }

    return { success: true, video_id: data.data?.video_id }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
