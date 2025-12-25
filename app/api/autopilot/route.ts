/**
 * EVIDENRA Autopilot - Vollautomatisches Marketing
 * ================================================
 * Täglich aufrufen via Cron: POST /api/autopilot
 *
 * Flow:
 * 1. Genesis Cloud erstellt Video (Website + Avatar)
 * 2. Upload zu YouTube
 * 3. Post auf Twitter/X
 * 4. Discord Notification
 * 5. Telegram Notification
 */

import { NextResponse } from 'next/server'
import * as https from 'https'

// Genesis Cloud API
const GENESIS_CLOUD_URL = 'https://web-production-ab08c.up.railway.app'
const GENESIS_API_KEY = (process.env.GENESIS_API_KEY || 'genesis-evidenra-2024-secret').trim()

// Discord Webhook
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1449139420052852920/oZVS25FIQkarF9snGf1QB-cXZQNuZPNHGLfYhRE07pJ64zRFsnQz5NSYsvjVKfEIPQJu'

// Telegram Bot - EVIDENRA Marketing
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8475164997:AAHTyTQQK6-8dGfXbip7RGAxdmsoc7yY95c'
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7804985180'

// Twitter Config - Updated with Read+Write permissions
const TWITTER_CONFIG = {
  apiKey: '5tkc2DtB1FNjjWHQ6oDK3kUgN',
  apiSecretKey: 'i23uBMrdDVHEZyrrhdNlFoqMzqU4p5F0SjfQpszB6iaVZDUS0Z',
  accessToken: '2003734522517663745-aOrEHqGgyvoi3hagsoYHxhhO1856MK',
  accessTokenSecret: 'bm0I8xn28fewdmssnvQJAd5QWtFNkezYKlogxx7u7sNlQ'
}

// YouTube Config (from env) - trim to remove any whitespace
const YOUTUBE_CONFIG = {
  clientId: (process.env.YOUTUBE_CLIENT_ID || '').trim(),
  clientSecret: (process.env.YOUTUBE_CLIENT_SECRET || '').trim(),
  refreshToken: (process.env.YOUTUBE_REFRESH_TOKEN || '').trim()
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function httpsRequest(options: https.RequestOptions, body?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // Add Content-Length if body is provided
    if (body && options.headers) {
      (options.headers as Record<string, any>)['Content-Length'] = Buffer.byteLength(body)
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve({ rawData: data })
        }
      })
    })
    req.on('error', (err) => {
      reject(new Error(`HTTPS error: ${err?.message || JSON.stringify(err)}`))
    })
    if (body) req.write(body)
    req.end()
  })
}

// ============================================
// 1. GENESIS CLOUD - Video erstellen
// ============================================

async function createVideo(): Promise<{ success: boolean; url?: string; script?: string; avatar?: string; error?: string }> {
  console.log('[Autopilot] Step 1: Creating video via Genesis Cloud...')

  const payload = JSON.stringify({
    topic: 'auto',
    demoType: 'auto'  // Wird täglich rotiert
  })

  try {
    const result = await httpsRequest({
      hostname: new URL(GENESIS_CLOUD_URL).hostname,
      path: '/create-full-video',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GENESIS_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, payload)

    if (result.success) {
      console.log('[Autopilot] Video created:', result.supabaseUrl)
      return {
        success: true,
        url: result.supabaseUrl,
        script: result.script,
        avatar: result.avatar
      }
    } else {
      const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error || result)
      return { success: false, error: errMsg || 'Genesis Cloud error' }
    }
  } catch (e: any) {
    return { success: false, error: e?.message || JSON.stringify(e) || 'Unknown error' }
  }
}

// ============================================
// 2. YOUTUBE UPLOAD
// ============================================

async function uploadToYouTube(videoUrl: string, title: string): Promise<{ success: boolean; youtubeUrl?: string; error?: string }> {
  console.log('[Autopilot] Step 2: Uploading to YouTube...')
  console.log('[Autopilot] YouTube Config check - clientId:', YOUTUBE_CONFIG.clientId?.substring(0, 20) + '...')
  console.log('[Autopilot] YouTube Config check - refreshToken:', YOUTUBE_CONFIG.refreshToken?.substring(0, 20) + '...')

  if (!YOUTUBE_CONFIG.clientId || !YOUTUBE_CONFIG.refreshToken) {
    return { success: false, error: `YouTube not configured - clientId: ${!!YOUTUBE_CONFIG.clientId}, refreshToken: ${!!YOUTUBE_CONFIG.refreshToken}` }
  }

  try {
    // Refresh token
    const tokenBody = new URLSearchParams({
      refresh_token: YOUTUBE_CONFIG.refreshToken,
      client_id: YOUTUBE_CONFIG.clientId,
      client_secret: YOUTUBE_CONFIG.clientSecret || '',
      grant_type: 'refresh_token'
    }).toString()

    console.log('[Autopilot] Refreshing YouTube token...')
    const tokenResult = await httpsRequest({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, tokenBody)

    console.log('[Autopilot] Token result:', JSON.stringify(tokenResult).substring(0, 200))

    if (!tokenResult.access_token) {
      return { success: false, error: `Token refresh failed: ${JSON.stringify(tokenResult)}` }
    }

    // Download video
    const videoBuffer = await new Promise<Buffer>((resolve, reject) => {
      https.get(videoUrl, (res) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    })

    // Upload to YouTube
    const metadata = {
      snippet: {
        title,
        description: `EVIDENRA - AI-Powered Qualitative Research

Transform your research with the AKIH method:
- 7 AI Personas for maximum reliability
- Automatic theme identification
- Publication-ready exports

60% OFF for Founding Members: https://evidenra.com/pricing

#EVIDENRA #QualitativeResearch #AI #PhD #Research`,
        tags: ['EVIDENRA', 'Qualitative Research', 'AI', 'Research', 'PhD', 'Academia'],
        categoryId: '28'
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    }

    // Init resumable upload
    const initResponse = await new Promise<string | null>((resolve) => {
      const req = https.request({
        hostname: 'www.googleapis.com',
        path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenResult.access_token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': videoBuffer.length,
          'X-Upload-Content-Type': 'video/mp4'
        }
      }, (res) => {
        resolve(res.headers['location'] || null)
      })
      req.on('error', () => resolve(null))
      req.write(JSON.stringify(metadata))
      req.end()
    })

    if (!initResponse) {
      return { success: false, error: 'YouTube init failed' }
    }

    // Upload video
    const uploadResult = await new Promise<any>((resolve) => {
      const url = new URL(initResponse)
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': videoBuffer.length
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch { resolve(null) }
        })
      })
      req.on('error', () => resolve(null))
      req.write(videoBuffer)
      req.end()
    })

    if (uploadResult?.id) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${uploadResult.id}`
      console.log('[Autopilot] YouTube upload success:', youtubeUrl)
      return { success: true, youtubeUrl }
    }

    return { success: false, error: 'YouTube upload failed' }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 3. TWITTER POST
// ============================================

import * as crypto from 'crypto'

function generateOAuthSignature(method: string, url: string, params: Record<string, string>): string {
  const sortedParams = Object.keys(params).sort().map(key =>
    `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
  ).join('&')

  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&')

  const signingKey = `${encodeURIComponent(TWITTER_CONFIG.apiSecretKey)}&${encodeURIComponent(TWITTER_CONFIG.accessTokenSecret)}`
  return crypto.createHmac('sha1', signingKey).update(signatureBaseString).digest('base64')
}

function generateOAuthHeader(method: string, url: string): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: TWITTER_CONFIG.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: TWITTER_CONFIG.accessToken,
    oauth_version: '1.0'
  }

  const signature = generateOAuthSignature(method, url, oauthParams)
  oauthParams.oauth_signature = signature

  return `OAuth ${Object.keys(oauthParams).sort().map(key =>
    `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`
  ).join(', ')}`
}

async function postToTwitter(text: string): Promise<{ success: boolean; tweetUrl?: string; error?: string }> {
  console.log('[Autopilot] Step 3: Posting to Twitter...')

  const tweetUrl = 'https://api.twitter.com/2/tweets'
  const auth = generateOAuthHeader('POST', tweetUrl)

  try {
    const result = await httpsRequest({
      hostname: 'api.twitter.com',
      path: '/2/tweets',
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({ text }))

    if (result.data?.id) {
      const url = `https://twitter.com/evidenra/status/${result.data.id}`
      console.log('[Autopilot] Twitter success:', url)
      return { success: true, tweetUrl: url }
    }

    return { success: false, error: JSON.stringify(result) }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// 4. DISCORD NOTIFICATION
// ============================================

async function notifyDiscord(message: string): Promise<void> {
  console.log('[Autopilot] Step 4: Discord notification...')

  try {
    await httpsRequest({
      hostname: 'discord.com',
      path: new URL(DISCORD_WEBHOOK).pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      username: 'EVIDENRA Autopilot',
      avatar_url: 'https://evidenra.com/logo.png',
      content: message
    }))
  } catch (e) {
    console.log('[Autopilot] Discord error:', e)
  }
}

// ============================================
// 5. TELEGRAM NOTIFICATION
// ============================================

async function notifyTelegram(message: string): Promise<void> {
  console.log('[Autopilot] Step 5: Telegram notification...')
  console.log('[Autopilot] Telegram Token:', TELEGRAM_BOT_TOKEN?.substring(0, 10) + '...')
  console.log('[Autopilot] Telegram Chat:', TELEGRAM_CHAT_ID)

  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Autopilot] Telegram not configured')
    return
  }

  try {
    // Use fetch instead of httpsRequest for reliability
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    })
    const result = await response.json()
    console.log('[Autopilot] Telegram result:', JSON.stringify(result).substring(0, 200))
  } catch (e: any) {
    console.log('[Autopilot] Telegram error:', e?.message || e)
  }
}

// ============================================
// MAIN AUTOPILOT ENDPOINT
// ============================================

export async function POST(request: Request) {
  console.log('[Autopilot] === STARTING DAILY AUTOMATION ===')
  console.log('[Autopilot] Time:', new Date().toISOString())

  // Check for test mode with existing video
  let testVideoUrl: string | null = null
  try {
    const body = await request.json()
    testVideoUrl = body.testVideoUrl || null
    console.log('[Autopilot] Test mode:', testVideoUrl ? 'YES' : 'NO')
  } catch {
    // No body or invalid JSON - normal mode
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    video: null,
    youtube: null,
    twitter: null,
    notifications: { discord: false, telegram: false }
  }

  try {
    // 1. Create Video (or use test video)
    let videoResult: { success: boolean; url?: string; script?: string; avatar?: string; error?: string }

    if (testVideoUrl) {
      console.log('[Autopilot] Using test video:', testVideoUrl)
      videoResult = { success: true, url: testVideoUrl, script: 'test', avatar: 'test' }
    } else {
      videoResult = await createVideo()
    }
    results.video = videoResult

    if (!videoResult.success || !videoResult.url) {
      const errStr = typeof videoResult.error === 'string' ? videoResult.error : JSON.stringify(videoResult.error)
      throw new Error(errStr || 'Video creation failed')
    }

    // Generate title based on script
    const today = new Date()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const title = `EVIDENRA AI Research Tool | ${dayNames[today.getDay()]} Demo | 60% OFF`

    // 2. Upload to YouTube
    const youtubeResult = await uploadToYouTube(videoResult.url, title)
    results.youtube = youtubeResult

    // 3. Post to Twitter
    const tweetText = `🚀 New EVIDENRA Demo Video!

AI-powered qualitative research made easy:
✅ Automatic interview analysis
✅ 7-Persona AKIH method
✅ Publication-ready exports

60% OFF Founding Members: evidenra.com/pricing

${youtubeResult.youtubeUrl || videoResult.url}

#QualitativeResearch #AI #PhD #Academia`

    const twitterResult = await postToTwitter(tweetText)
    results.twitter = twitterResult

    // 4. Discord Notification
    const discordMessage = `**🎬 EVIDENRA Autopilot - Tägliches Update**

✅ **Video erstellt:** ${videoResult.script} (${videoResult.avatar})
${youtubeResult.success ? `✅ **YouTube:** ${youtubeResult.youtubeUrl}` : `❌ YouTube: ${youtubeResult.error}`}
${twitterResult.success ? `✅ **Twitter:** ${twitterResult.tweetUrl}` : `❌ Twitter: ${twitterResult.error}`}

📹 **Supabase:** ${videoResult.url}`

    await notifyDiscord(discordMessage)
    results.notifications.discord = true

    // 5. Telegram Notification
    const telegramMessage = `🤖 *EVIDENRA Autopilot*

✅ Video: ${videoResult.script}
${youtubeResult.success ? `✅ YouTube: ${youtubeResult.youtubeUrl}` : `❌ YouTube fehlgeschlagen`}
${twitterResult.success ? `✅ Twitter: ${twitterResult.tweetUrl}` : `❌ Twitter fehlgeschlagen`}`

    await notifyTelegram(telegramMessage)
    results.notifications.telegram = true

    console.log('[Autopilot] === AUTOMATION COMPLETE ===')

    return NextResponse.json({
      success: true,
      message: 'Daily automation completed successfully',
      results
    })

  } catch (e: any) {
    console.error('[Autopilot] ERROR:', e)
    const errorMsg = e?.message || JSON.stringify(e) || 'Unknown error'

    // Error notification
    await notifyDiscord(`**❌ EVIDENRA Autopilot FEHLER**\n\n${errorMsg}`)

    return NextResponse.json({
      success: false,
      error: errorMsg,
      results
    }, { status: 500 })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'EVIDENRA Autopilot',
    endpoints: {
      'POST /api/autopilot': 'Run daily automation (video + youtube + twitter + notifications)'
    },
    config: {
      genesisCloud: GENESIS_CLOUD_URL,
      youtube: !!YOUTUBE_CONFIG.clientId,
      twitter: !!TWITTER_CONFIG.apiKey,
      discord: !!DISCORD_WEBHOOK,
      telegram: !!TELEGRAM_BOT_TOKEN
    }
  })
}
