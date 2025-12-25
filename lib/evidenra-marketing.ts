/**
 * EVIDENRA Marketing Automation
 * ==============================
 * Video Creation, YouTube Upload, Twitter, Share Links
 * Integrated into MYMOI for unified bot experience
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as crypto from 'crypto'

const execAsync = promisify(exec)

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  videosDir: 'D:\\EVIDENRA-Videos',
  genesisDir: 'D:\\EVIDENRA-Videos',  // Korrigiert - Genesis Videos sind hier
  tiktokDir: 'D:\\EVIDENRA-Videos\\TikTok',
  outputDir: 'D:\\EVIDENRA-Videos\\output',

  // Twitter API - Neues Konto (aktualisiert 24.12.2024)
  twitter: {
    apiKey: '5tkc2DtB1FNjjWHQ6oDK3kUgN',
    apiSecretKey: 'i23uBMrdDVHEZyrrhdNlFoqMzqU4p5F0SjfQpszB6iaVZDUS0Z',
    accessToken: '2003734522517663745-BvOdRewI82rD1uVKgCvSiY3ws94V4e',
    accessTokenSecret: 'Q0HmajumQJDlQg9JwIWMnOr8tlSrlp7geguy0aN0nh28n'
  },

  // YouTube OAuth
  youtubeCredentialsPath: 'D:\\EVIDENRA-Videos\\youtube-credentials.json',

  // Share URLs
  shareUrl: 'https://evidenra.com/pricing'
}

// ============================================================================
// YOUTUBE FUNCTIONS
// ============================================================================

interface YouTubeCredentials {
  clientId: string
  clientSecret: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

function loadYouTubeCredentials(): YouTubeCredentials | null {
  // Zuerst Environment Variables pruefen (fuer Vercel)
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
    return {
      clientId: process.env.YOUTUBE_CLIENT_ID.trim(),
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET?.trim() || '',
      accessToken: process.env.YOUTUBE_ACCESS_TOKEN?.trim() || '',
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN.trim(),
      expiresAt: 0 // Force refresh
    }
  }

  // Fallback: Lokale Datei
  try {
    if (fs.existsSync(CONFIG.youtubeCredentialsPath)) {
      return JSON.parse(fs.readFileSync(CONFIG.youtubeCredentialsPath, 'utf8'))
    }
  } catch {}
  return null
}

function saveYouTubeCredentials(credentials: YouTubeCredentials) {
  fs.writeFileSync(CONFIG.youtubeCredentialsPath, JSON.stringify(credentials, null, 2))
}

async function refreshYouTubeToken(credentials: YouTubeCredentials): Promise<string | null> {
  console.log('[YouTube] Refreshing token...')
  console.log('[YouTube] Client ID:', credentials.clientId?.substring(0, 20) + '...')
  console.log('[YouTube] Refresh Token:', credentials.refreshToken?.substring(0, 20) + '...')

  return new Promise((resolve) => {
    const postData = new URLSearchParams({
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'refresh_token'
    }).toString()

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log('[YouTube] Token response status:', res.statusCode)
        try {
          const tokens = JSON.parse(data)
          if (tokens.access_token) {
            console.log('[YouTube] Got new access token!')
            credentials.accessToken = tokens.access_token
            credentials.expiresAt = Date.now() + (tokens.expires_in * 1000)
            // Nicht speichern auf Vercel (read-only filesystem)
            try { saveYouTubeCredentials(credentials) } catch {}
            resolve(tokens.access_token)
          } else {
            console.log('[YouTube] Token error:', data)
            resolve(null)
          }
        } catch (e) {
          console.log('[YouTube] Parse error:', e)
          resolve(null)
        }
      })
    })

    req.on('error', (e) => {
      console.log('[YouTube] Request error:', e.message)
      resolve(null)
    })
    req.write(postData)
    req.end()
  })
}

export interface YouTubeUploadResult {
  success: boolean
  videoId?: string
  url?: string
  error?: string
}

export async function uploadToYouTube(videoPath: string, title?: string): Promise<YouTubeUploadResult> {
  const credentials = loadYouTubeCredentials()

  if (!credentials) {
    return { success: false, error: 'YouTube nicht konfiguriert. Bitte zuerst /youtube-setup ausfuehren.' }
  }

  // Check if token needs refresh
  let accessToken = credentials.accessToken
  if (Date.now() >= credentials.expiresAt - 60000) {
    const newToken = await refreshYouTubeToken(credentials)
    if (!newToken) {
      return { success: false, error: 'YouTube Token konnte nicht erneuert werden.' }
    }
    accessToken = newToken
  }

  // Read video file
  const videoBuffer = fs.readFileSync(videoPath)
  const fileSize = videoBuffer.length

  const metadata = {
    snippet: {
      title: title || 'EVIDENRA Professional v7.6 - Qualitative Forschung mit KI (AKIH-Methode)',
      description: `EVIDENRA Professional - Das fuehrende Tool fuer qualitative Forschung mit KI

Was ist EVIDENRA?
- Automatisierte Interview-Analyse mit der AKIH-Methode
- 7-Persona-System fuer hoechste Inter-Rater-Reliabilitaet
- Quantum AKIH Score v3.0 fuer Qualitaetsbewertung

Jetzt 60% Founding Members Rabatt sichern:
https://evidenra.com/pricing

#QualitativeForschung #KI #EVIDENRA #Forschung`,
      tags: ['EVIDENRA', 'Qualitative Forschung', 'KI', 'Interview Analyse', 'AKIH-Methode'],
      categoryId: '28' // Science & Technology
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false
    }
  }

  // Initialize resumable upload
  return new Promise((resolve) => {
    const metadataJson = JSON.stringify(metadata)

    const initReq = https.request({
      hostname: 'www.googleapis.com',
      path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(metadataJson),
        'X-Upload-Content-Length': fileSize,
        'X-Upload-Content-Type': 'video/*'
      }
    }, async (initRes) => {
      const uploadUrl = initRes.headers['location']

      if (!uploadUrl) {
        let errorData = ''
        initRes.on('data', chunk => errorData += chunk)
        initRes.on('end', () => {
          resolve({ success: false, error: `Upload Init fehlgeschlagen: ${errorData}` })
        })
        return
      }

      // Upload the video
      const url = new URL(uploadUrl)
      const uploadReq = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'video/*',
          'Content-Length': videoBuffer.length
        }
      }, (uploadRes) => {
        let data = ''
        uploadRes.on('data', chunk => data += chunk)
        uploadRes.on('end', () => {
          try {
            const result = JSON.parse(data)
            if (result.id) {
              resolve({
                success: true,
                videoId: result.id,
                url: `https://www.youtube.com/watch?v=${result.id}`
              })
            } else {
              resolve({ success: false, error: data })
            }
          } catch {
            resolve({ success: false, error: data })
          }
        })
      })

      uploadReq.on('error', (e) => resolve({ success: false, error: e.message }))
      uploadReq.write(videoBuffer)
      uploadReq.end()
    })

    initReq.on('error', (e) => resolve({ success: false, error: e.message }))
    initReq.write(metadataJson)
    initReq.end()
  })
}

// YouTube Upload von Cloud-URL
export async function uploadToYouTubeFromUrl(videoUrl: string, title?: string): Promise<YouTubeUploadResult> {
  console.log('[YouTube] Lade Video von URL:', videoUrl)

  // Video von URL herunterladen
  const videoBuffer = await downloadVideoBuffer(videoUrl)
  if (!videoBuffer || videoBuffer.length === 0) {
    return { success: false, error: 'Video konnte nicht heruntergeladen werden' }
  }

  console.log('[YouTube] Video geladen:', (videoBuffer.length / 1024 / 1024).toFixed(2), 'MB')

  const credentials = loadYouTubeCredentials()
  if (!credentials) {
    return { success: false, error: 'YouTube nicht konfiguriert' }
  }

  // Token refresh if needed
  let accessToken = credentials.accessToken
  if (Date.now() >= credentials.expiresAt - 60000) {
    const newToken = await refreshYouTubeToken(credentials)
    if (!newToken) {
      return { success: false, error: 'YouTube Token konnte nicht erneuert werden' }
    }
    accessToken = newToken
  }

  const metadata = {
    snippet: {
      title: title || 'EVIDENRA - AI-Powered Qualitative Research (60% OFF)',
      description: `EVIDENRA Professional - Das fuehrende Tool fuer qualitative Forschung mit KI

Was ist EVIDENRA?
- Automatisierte Interview-Analyse mit der AKIH-Methode
- 7-Persona-System fuer hoechste Inter-Rater-Reliabilitaet
- Quantum AKIH Score v3.0 fuer Qualitaetsbewertung

Jetzt 60% Founding Members Rabatt sichern:
https://evidenra.com/pricing

#QualitativeForschung #KI #EVIDENRA #Forschung`,
      tags: ['EVIDENRA', 'Qualitative Forschung', 'KI', 'Interview Analyse', 'AKIH-Methode'],
      categoryId: '28'
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false
    }
  }

  return new Promise((resolve) => {
    const metadataJson = JSON.stringify(metadata)

    const initReq = https.request({
      hostname: 'www.googleapis.com',
      path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(metadataJson),
        'X-Upload-Content-Length': videoBuffer.length,
        'X-Upload-Content-Type': 'video/mp4'
      }
    }, async (initRes) => {
      const uploadUrl = initRes.headers['location']

      if (!uploadUrl) {
        let errorData = ''
        initRes.on('data', chunk => errorData += chunk)
        initRes.on('end', () => {
          resolve({ success: false, error: `Init fehlgeschlagen: ${errorData}` })
        })
        return
      }

      // Upload video
      const url = new URL(uploadUrl)
      const uploadReq = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': videoBuffer.length
        }
      }, (uploadRes) => {
        let data = ''
        uploadRes.on('data', chunk => data += chunk)
        uploadRes.on('end', () => {
          try {
            const result = JSON.parse(data)
            if (result.id) {
              resolve({
                success: true,
                videoId: result.id,
                url: `https://www.youtube.com/watch?v=${result.id}`
              })
            } else {
              resolve({ success: false, error: data })
            }
          } catch {
            resolve({ success: false, error: data })
          }
        })
      })

      uploadReq.on('error', (e) => resolve({ success: false, error: e.message }))
      uploadReq.write(videoBuffer)
      uploadReq.end()
    })

    initReq.on('error', (e) => resolve({ success: false, error: e.message }))
    initReq.write(metadataJson)
    initReq.end()
  })
}

function downloadVideoBuffer(videoUrl: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const url = new URL(videoUrl)
    const protocol = url.protocol === 'https:' ? https : require('http')

    protocol.get(videoUrl, (res: any) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        downloadVideoBuffer(res.headers.location).then(resolve)
        return
      }

      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', () => resolve(null))
    }).on('error', () => resolve(null))
  })
}

// ============================================================================
// TWITTER FUNCTIONS
// ============================================================================

function generateOAuthSignature(method: string, url: string, params: Record<string, string>, consumerSecret: string, tokenSecret: string): string {
  const sortedParams = Object.keys(params).sort().map(key =>
    `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
  ).join('&')

  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&')

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`
  return crypto.createHmac('sha1', signingKey).update(signatureBaseString).digest('base64')
}

function generateOAuthHeader(method: string, url: string, additionalParams: Record<string, string> = {}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: CONFIG.twitter.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: CONFIG.twitter.accessToken,
    oauth_version: '1.0'
  }

  const allParams = { ...oauthParams, ...additionalParams }
  const signature = generateOAuthSignature(
    method, url, allParams,
    CONFIG.twitter.apiSecretKey, CONFIG.twitter.accessTokenSecret
  )

  oauthParams.oauth_signature = signature

  const headerParts = Object.keys(oauthParams).sort().map(key =>
    `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`
  )

  return `OAuth ${headerParts.join(', ')}`
}

function makeRequest(options: https.RequestOptions, postData?: Buffer | string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode || 0, data })
        }
      })
    })
    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

export interface TwitterUploadResult {
  success: boolean
  mediaId?: string
  tweetId?: string
  url?: string
  error?: string
}

export async function uploadVideoToTwitter(videoPath: string): Promise<string | null> {
  const videoBuffer = fs.readFileSync(videoPath)
  const totalBytes = videoBuffer.length

  // Step 1: INIT
  const initUrl = 'https://upload.twitter.com/1.1/media/upload.json'
  const initParams = {
    command: 'INIT',
    total_bytes: totalBytes.toString(),
    media_type: 'video/mp4',
    media_category: 'tweet_video'
  }

  const initAuth = generateOAuthHeader('POST', initUrl, initParams)
  const initBody = Object.keys(initParams).map(k => `${k}=${encodeURIComponent(initParams[k as keyof typeof initParams])}`).join('&')

  const initResult = await makeRequest({
    hostname: 'upload.twitter.com',
    path: '/1.1/media/upload.json',
    method: 'POST',
    headers: {
      'Authorization': initAuth,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }, initBody)

  if (initResult.status !== 200 && initResult.status !== 202) {
    return null
  }

  const mediaId = initResult.data.media_id_string

  // Step 2: APPEND (chunked)
  const chunkSize = 4 * 1024 * 1024
  let segmentIndex = 0

  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const chunk = videoBuffer.slice(offset, Math.min(offset + chunkSize, totalBytes))
    const appendAuth = generateOAuthHeader('POST', initUrl, {})
    const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex')

    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="command"\r\n\r\nAPPEND\r\n`),
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="media_id"\r\n\r\n${mediaId}\r\n`),
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="segment_index"\r\n\r\n${segmentIndex}\r\n`),
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="media"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      chunk,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ])

    const appendResult = await makeRequest({
      hostname: 'upload.twitter.com',
      path: '/1.1/media/upload.json',
      method: 'POST',
      headers: {
        'Authorization': appendAuth,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length.toString()
      }
    }, multipartBody)

    if (appendResult.status !== 200 && appendResult.status !== 204 && appendResult.status !== 202) {
      return null
    }

    segmentIndex++
    await new Promise(r => setTimeout(r, 500))
  }

  // Step 3: FINALIZE
  const finalizeParams = { command: 'FINALIZE', media_id: mediaId }
  const finalizeAuth = generateOAuthHeader('POST', initUrl, finalizeParams)
  const finalizeBody = Object.keys(finalizeParams).map(k => `${k}=${encodeURIComponent(finalizeParams[k as keyof typeof finalizeParams])}`).join('&')

  const finalizeResult = await makeRequest({
    hostname: 'upload.twitter.com',
    path: '/1.1/media/upload.json',
    method: 'POST',
    headers: {
      'Authorization': finalizeAuth,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }, finalizeBody)

  if (finalizeResult.status !== 200 && finalizeResult.status !== 201) {
    return null
  }

  // Wait for processing if needed
  if (finalizeResult.data.processing_info) {
    let checkAfterSecs = finalizeResult.data.processing_info.check_after_secs || 5

    while (true) {
      await new Promise(r => setTimeout(r, checkAfterSecs * 1000))

      const statusParams = { command: 'STATUS', media_id: mediaId }
      const statusAuth = generateOAuthHeader('GET', initUrl, statusParams)
      const statusQuery = Object.keys(statusParams).map(k => `${k}=${encodeURIComponent(statusParams[k as keyof typeof statusParams])}`).join('&')

      const statusResult = await makeRequest({
        hostname: 'upload.twitter.com',
        path: `/1.1/media/upload.json?${statusQuery}`,
        method: 'GET',
        headers: { 'Authorization': statusAuth }
      })

      if (!statusResult.data.processing_info || statusResult.data.processing_info.state === 'succeeded') {
        break
      }
      if (statusResult.data.processing_info.state === 'failed') {
        return null
      }
      checkAfterSecs = statusResult.data.processing_info.check_after_secs || 5
    }
  }

  return mediaId
}

export async function postToTwitter(text: string, mediaId?: string): Promise<TwitterUploadResult> {
  const tweetUrl = 'https://api.twitter.com/2/tweets'
  const tweetData: any = { text }
  if (mediaId) {
    tweetData.media = { media_ids: [mediaId] }
  }

  const auth = generateOAuthHeader('POST', tweetUrl, {})
  const body = JSON.stringify(tweetData)

  const result = await makeRequest({
    hostname: 'api.twitter.com',
    path: '/2/tweets',
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json'
    }
  }, body)

  if (result.status === 201 || result.status === 200) {
    const tweetId = result.data.data?.id
    return {
      success: true,
      tweetId,
      url: `https://twitter.com/evidenra/status/${tweetId}`
    }
  }

  return { success: false, error: JSON.stringify(result.data) }
}

// ============================================================================
// VIDEO FUNCTIONS
// ============================================================================

export function findLatestVideo(): string | undefined {
  // Cloud-Modus: Keine lokalen Dateien verfuegbar
  // Videos werden aus Supabase Storage geladen
  return undefined
}

// ============================================================================
// SUPABASE CLOUD VIDEO FUNCTIONS
// ============================================================================

export async function getLatestCloudVideo(): Promise<{ url: string; filename: string } | null> {
  const supabaseUrl = (process.env.SUPABASE_URL || 'https://qkcukdgrqncahpvrrxtm.supabase.co').trim()
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY?.trim()

  if (!supabaseKey) {
    return null
  }

  return new Promise((resolve) => {
    const url = new URL(`${supabaseUrl}/rest/v1/cloud_videos?is_latest=eq.true&select=url,filename&limit=1`)

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result && result.length > 0) {
            resolve({ url: result[0].url, filename: result[0].filename })
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.end()
  })
}

export async function listCloudVideos(): Promise<Array<{ url: string; filename: string; created_at: string }>> {
  const supabaseUrl = (process.env.SUPABASE_URL || 'https://qkcukdgrqncahpvrrxtm.supabase.co').trim()
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY?.trim()

  if (!supabaseKey) {
    return []
  }

  return new Promise((resolve) => {
    const url = new URL(`${supabaseUrl}/rest/v1/cloud_videos?select=url,filename,created_at&order=created_at.desc&limit=10`)

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) || [])
        } catch {
          resolve([])
        }
      })
    })

    req.on('error', () => resolve([]))
    req.end()
  })
}

// ============================================================================
// HEYGEN CLOUD VIDEO CREATION
// ============================================================================

const HEYGEN_AVATARS = [
  { id: 'Kristin_public_2_20240108', name: 'Kristin' },
  { id: 'josh_lite3_20230714', name: 'Josh' },
  { id: 'Angela-inblackskirt-20220820', name: 'Angela' }
]

const HEYGEN_VOICES = {
  english_female: 'fb8c5c3f02854c57a4da182d4ed59467', // Ivy
  english_male: 'f38a635bee7a4d1f9b0a654a31d050d2',   // Chill Brian
  german_female: '6bc024e311ee41dbb66ae24c9c53f0b5',
  german_male: '6f94c8b2a6784a1d92ffbe0339138f31'
}

const VIDEO_SCRIPTS = {
  founding: `Hello! I'm excited to introduce you to EVIDENRA - the leading AI-powered qualitative research tool.

With our revolutionary AKIH method, you can analyze interviews faster and more reliably than ever before. Our seven-persona AI system ensures scientific quality at the highest level.

As a founding member, you get sixty percent off! Visit evidenra.com today and transform your research.`,

  akih: `The AKIH method is transforming qualitative research.

AKIH stands for Autonomous AI-Guided Hybrid Analysis. Seven specialized AI personas analyze your data from different perspectives simultaneously.

The result? Maximum inter-rater reliability and scientifically sound insights. Try EVIDENRA free at evidenra.com!`,

  students: `Are you writing your bachelor's or master's thesis?

EVIDENRA helps you with qualitative analysis. From research questions to coding to publication-ready reports - everything in one app.

As a founding member, save sixty percent. Start now at evidenra.com!`
}

export interface HeyGenVideoResult {
  success: boolean
  videoId?: string
  videoUrl?: string
  supabaseUrl?: string
  error?: string
}

// Genesis Cloud API - Railway-hosted video generation service
const GENESIS_CLOUD_URL = 'https://web-production-ab08c.up.railway.app'
const GENESIS_API_KEY = process.env.GENESIS_API_KEY || 'genesis-evidenra-2024-secret'

export async function createVideoViaGenesisCloud(topic: string = 'founding', fullMode: boolean = true): Promise<HeyGenVideoResult> {
  // fullMode = true: Screen Recording + Avatar + FFmpeg Composite
  // fullMode = false: Nur HeyGen Avatar
  const endpoint = fullMode ? '/create-full-video' : '/create-video'
  console.log(`[Genesis Cloud] Starte Video-Erstellung via Railway (${fullMode ? 'FULL' : 'avatar-only'})...`)

  return new Promise((resolve) => {
    const url = new URL(`${GENESIS_CLOUD_URL}${endpoint}`)

    const payload = JSON.stringify({
      topic,
      demoType: 'demo',
      waitForCompletion: true
    })

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GENESIS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          console.log('[Genesis Cloud] Antwort:', result.success ? 'OK' : result.error)
          if (result.success) {
            resolve({
              success: true,
              videoId: result.videoId,
              videoUrl: result.heygenUrl,
              supabaseUrl: result.supabaseUrl
            })
          } else {
            resolve({ success: false, error: result.error || 'Genesis Cloud Fehler' })
          }
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })
    req.on('error', (e) => resolve({ success: false, error: e.message }))
    req.write(payload)
    req.end()
  })
}

export async function createHeyGenCloudVideo(topic: keyof typeof VIDEO_SCRIPTS = 'founding'): Promise<HeyGenVideoResult> {
  const apiKey = process.env.HEYGEN_API_KEY?.trim()
  if (!apiKey) {
    return { success: false, error: 'HeyGen API Key nicht konfiguriert' }
  }

  const avatar = HEYGEN_AVATARS[Math.floor(Math.random() * HEYGEN_AVATARS.length)]
  const script = VIDEO_SCRIPTS[topic] || VIDEO_SCRIPTS.founding

  const payload = JSON.stringify({
    video_inputs: [{
      character: {
        type: 'avatar',
        avatar_id: avatar.id,
        avatar_style: 'normal'
      },
      voice: {
        type: 'text',
        input_text: script,
        voice_id: HEYGEN_VOICES.english_female,
        speed: 1.0
      },
      background: {
        type: 'color',
        value: '#1a1a2e'
      }
    }],
    dimension: { width: 1280, height: 720 },  // HD (kostenloser Plan)
    aspect_ratio: '16:9'
  })

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.heygen.com',
      path: '/v2/video/generate',
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.data?.video_id) {
            resolve({ success: true, videoId: result.data.video_id })
          } else {
            resolve({ success: false, error: result.error?.message || 'HeyGen Fehler' })
          }
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })

    req.on('error', (e) => resolve({ success: false, error: e.message }))
    req.write(payload)
    req.end()
  })
}

export async function checkHeyGenVideoStatus(videoId: string): Promise<{ status: string; videoUrl?: string }> {
  const apiKey = process.env.HEYGEN_API_KEY?.trim()

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.heygen.com',
      path: `/v1/video_status.get?video_id=${videoId}`,
      method: 'GET',
      headers: { 'X-Api-Key': apiKey }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          resolve({
            status: result.data?.status || 'unknown',
            videoUrl: result.data?.video_url
          })
        } catch {
          resolve({ status: 'error' })
        }
      })
    })

    req.on('error', () => resolve({ status: 'error' }))
    req.end()
  })
}

export async function waitForHeyGenVideo(videoId: string, maxWaitMs: number = 600000): Promise<string | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkHeyGenVideoStatus(videoId)

    if (status.status === 'completed' && status.videoUrl) {
      return status.videoUrl
    }

    if (status.status === 'failed') {
      return null
    }

    await new Promise(r => setTimeout(r, 15000))
  }

  return null
}

export async function createVideo(): Promise<{ success: boolean; videoPath?: string; error?: string }> {
  // Try Genesis Engine first
  if (fs.existsSync(CONFIG.genesisDir)) {
    try {
      await execAsync('node generate-video.js --skip-record', {
        cwd: CONFIG.genesisDir,
        timeout: 600000
      })

      const genesisOutput = path.join(CONFIG.genesisDir, 'output')
      const files = fs.readdirSync(genesisOutput)
        .filter(f => f.endsWith('.mp4'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(genesisOutput, a))
          const statB = fs.statSync(path.join(genesisOutput, b))
          return statB.mtime.getTime() - statA.mtime.getTime()
        })

      if (files.length > 0) {
        return { success: true, videoPath: path.join(genesisOutput, files[0]) }
      }
    } catch (e: any) {
      console.error('Genesis Engine error:', e.message)
    }
  }

  // Fallback: Find existing video
  const existingVideo = findLatestVideo()
  if (existingVideo) {
    return { success: true, videoPath: existingVideo }
  }

  return { success: false, error: 'Kein Video gefunden oder erstellt' }
}

// ============================================================================
// SHARE LINKS
// ============================================================================

export interface ShareLinks {
  linkedin: string
  facebook: string
  reddit: string
  instagram: string
  tiktok: string
  video?: string
}

export function generateShareLinks(url?: string, title?: string, videoUrl?: string): ShareLinks {
  const shareUrl = url || CONFIG.shareUrl
  const urlToShare = videoUrl || shareUrl

  // Plattform-spezifische Texte
  const linkedinText = `🎬 AI revolutioniert qualitative Forschung!

EVIDENRA analysiert Interviews, Fokusgruppen & Dokumente automatisch - bis zu 10x schneller als manuelle Methoden.

⏰ Jetzt 60% Founding Members Rabatt sichern!`

  const redditTitle = 'EVIDENRA - AI for Qualitative Research (60% Founding Members Discount)'

  const facebookQuote = 'AI-powered qualitative research analysis. Transform interviews, focus groups & documents into insights 10x faster.'

  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(urlToShare)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(urlToShare)}&quote=${encodeURIComponent(facebookQuote)}`,
    reddit: `https://www.reddit.com/submit?url=${encodeURIComponent(urlToShare)}&title=${encodeURIComponent(redditTitle)}`,
    instagram: 'https://www.instagram.com/evidenra/',
    tiktok: 'https://www.tiktok.com/@evidenra',
    video: videoUrl
  }
}

// ============================================================================
// FULL AUTOMATION
// ============================================================================

export interface AutomationResult {
  success: boolean
  video?: { path: string }
  youtube?: YouTubeUploadResult
  twitter?: TwitterUploadResult
  shareLinks?: ShareLinks
  error?: string
}

export async function runFullAutomation(options: {
  createNewVideo?: boolean
  videoPath?: string
  youtubeTitle?: string
  topic?: 'founding' | 'akih' | 'students'
} = {}): Promise<AutomationResult> {
  const result: AutomationResult = { success: false }

  try {
    let videoUrl: string | null = null

    // Step 1: Neues Video erstellen ODER existierendes Cloud-Video nutzen
    if (options.createNewVideo) {
      // Option A: NEUES Video via Genesis Cloud (Railway)
      console.log('[Werbung] Erstelle NEUES Video via Genesis Cloud...')
      const topic = options.topic || 'founding'
      const genesisResult = await createVideoViaGenesisCloud(topic)

      if (!genesisResult.success) {
        return { success: false, error: genesisResult.error || 'Genesis Cloud Video-Erstellung fehlgeschlagen' }
      }

      // Genesis Cloud liefert bereits die Supabase URL
      videoUrl = genesisResult.supabaseUrl || genesisResult.videoUrl || null
      console.log('[Werbung] Genesis Cloud Video erstellt:', videoUrl)
    } else {
      // Option B: Zuerst Cloud-Video suchen
      console.log('[Werbung] Suche Cloud-Video...')
      try {
        const cloudVideo = await getLatestCloudVideo()
        if (cloudVideo) {
          console.log('[Werbung] Cloud-Video gefunden:', cloudVideo.filename)
          videoUrl = cloudVideo.url
        } else {
          console.log('[Werbung] Kein Cloud-Video in Supabase gefunden')
        }
      } catch (cloudErr: any) {
        console.log('[Werbung] Cloud-Video Fehler:', cloudErr?.message || cloudErr)
      }

      // Wenn kein Cloud-Video, Genesis Cloud erstellen
      if (!videoUrl) {
        console.log('[Werbung] Erstelle Video via Genesis Cloud...')
        const topic = options.topic || 'founding'
        const genesisResult = await createVideoViaGenesisCloud(topic)

        if (!genesisResult.success) {
          return { success: false, error: genesisResult.error || 'Genesis Cloud Video-Erstellung fehlgeschlagen' }
        }

        videoUrl = genesisResult.supabaseUrl || genesisResult.videoUrl || null
        console.log('[Werbung] Genesis Cloud Video erstellt:', videoUrl)
      }
    }

    console.log('[Werbung] Video URL:', videoUrl)
    result.video = { path: videoUrl || '' }

    // Step 3: Post to Twitter
    const tweetText = `🚀 EVIDENRA - AI-Powered Qualitative Research

60% OFF for Founding Members!

✅ 7-Persona AKIH Method
✅ Scientific reliability
✅ One-click analysis

Try free: evidenra.com

#QualitativeResearch #AI #PhD #Research`

    console.log('[Werbung] Poste auf Twitter...')
    result.twitter = await postToTwitter(tweetText)
    console.log('[Werbung] Twitter Ergebnis:', result.twitter?.success ? 'OK' : result.twitter?.error)

    // Step 4: YouTube Upload (von Cloud-URL)
    console.log('[Werbung] Starte YouTube Upload...')
    try {
      result.youtube = await uploadToYouTubeFromUrl(videoUrl, options.youtubeTitle)
      console.log('[Werbung] YouTube:', result.youtube?.success ? result.youtube.url : result.youtube?.error)
    } catch (ytErr: any) {
      console.log('[Werbung] YouTube Fehler:', ytErr?.message)
      result.youtube = { success: false, error: ytErr?.message || 'YouTube Upload fehlgeschlagen' }
    }

    // Step 5: Generate share links (YouTube URL bevorzugt, sonst Supabase)
    const shareVideoUrl = result.youtube?.success && result.youtube?.url
      ? result.youtube.url
      : videoUrl
    result.shareLinks = generateShareLinks('https://evidenra.com/pricing', 'EVIDENRA - 60% OFF', shareVideoUrl)

    result.success = true // Video gefunden = Erfolg

  } catch (e: any) {
    console.error('[Werbung] Fehler:', e)
    result.error = e?.message || String(e) || 'Unbekannter Fehler'
  }

  return result
}

// ============================================================================
// STATUS CHECK
// ============================================================================

export interface MarketingStatus {
  youtube: boolean
  twitter: boolean
  genesisEngine: boolean
  latestVideo?: string
}

export function getMarketingStatus(): MarketingStatus {
  return {
    youtube: fs.existsSync(CONFIG.youtubeCredentialsPath),
    twitter: true, // Always configured
    genesisEngine: fs.existsSync(CONFIG.genesisDir),
    latestVideo: findLatestVideo()
  }
}
