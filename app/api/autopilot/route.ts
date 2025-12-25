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

// Discord Webhook - Private #autopilot-intern channel (only visible to owner)
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1453837269529006222/Erp30x784b1dnPxo0g6ML1yAJsrjR1GmjD0YFJwp95IB6jHgZlLNnUhRvL0569G7Ivnc'

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

// Generate OAuth signature for media upload (includes body params)
function generateOAuthSignatureWithParams(method: string, url: string, oauthParams: Record<string, string>, bodyParams: Record<string, string>): string {
  const allParams = { ...oauthParams, ...bodyParams }
  const sortedParams = Object.keys(allParams).sort().map(key =>
    `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`
  ).join('&')

  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&')

  const signingKey = `${encodeURIComponent(TWITTER_CONFIG.apiSecretKey)}&${encodeURIComponent(TWITTER_CONFIG.accessTokenSecret)}`
  return crypto.createHmac('sha1', signingKey).update(signatureBaseString).digest('base64')
}

function generateOAuthHeaderWithParams(method: string, url: string, bodyParams: Record<string, string> = {}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: TWITTER_CONFIG.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: TWITTER_CONFIG.accessToken,
    oauth_version: '1.0'
  }

  const signature = generateOAuthSignatureWithParams(method, url, oauthParams, bodyParams)
  oauthParams.oauth_signature = signature

  return `OAuth ${Object.keys(oauthParams).sort().map(key =>
    `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`
  ).join(', ')}`
}

// Upload video to Twitter using chunked media upload
async function uploadVideoToTwitter(videoUrl: string): Promise<string | null> {
  console.log('[Autopilot] Uploading video to Twitter...')

  try {
    // Download video
    const videoBuffer = await new Promise<Buffer>((resolve, reject) => {
      https.get(videoUrl, (res) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    })

    console.log('[Autopilot] Video downloaded:', videoBuffer.length, 'bytes')

    const mediaUploadUrl = 'https://upload.twitter.com/1.1/media/upload.json'

    // INIT
    const initParams = {
      command: 'INIT',
      total_bytes: videoBuffer.length.toString(),
      media_type: 'video/mp4',
      media_category: 'tweet_video'
    }

    const initAuth = generateOAuthHeaderWithParams('POST', mediaUploadUrl, initParams)
    const initBody = new URLSearchParams(initParams).toString()

    const initResult = await httpsRequest({
      hostname: 'upload.twitter.com',
      path: '/1.1/media/upload.json',
      method: 'POST',
      headers: {
        'Authorization': initAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, initBody)

    if (!initResult.media_id_string) {
      console.log('[Autopilot] Twitter INIT failed:', JSON.stringify(initResult))
      return null
    }

    const mediaId = initResult.media_id_string
    console.log('[Autopilot] Twitter media_id:', mediaId)

    // APPEND - upload in chunks (max 5MB each)
    const chunkSize = 5 * 1024 * 1024
    const totalChunks = Math.ceil(videoBuffer.length / chunkSize)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, videoBuffer.length)
      const chunk = videoBuffer.slice(start, end)
      const chunkBase64 = chunk.toString('base64')

      const appendParams = {
        command: 'APPEND',
        media_id: mediaId,
        segment_index: i.toString(),
        media_data: chunkBase64
      }

      const appendAuth = generateOAuthHeaderWithParams('POST', mediaUploadUrl, {
        command: 'APPEND',
        media_id: mediaId,
        segment_index: i.toString()
      })
      const appendBody = new URLSearchParams(appendParams).toString()

      await httpsRequest({
        hostname: 'upload.twitter.com',
        path: '/1.1/media/upload.json',
        method: 'POST',
        headers: {
          'Authorization': appendAuth,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }, appendBody)

      console.log('[Autopilot] Twitter APPEND chunk', i + 1, '/', totalChunks)
    }

    // FINALIZE
    const finalizeParams = {
      command: 'FINALIZE',
      media_id: mediaId
    }

    const finalizeAuth = generateOAuthHeaderWithParams('POST', mediaUploadUrl, finalizeParams)
    const finalizeBody = new URLSearchParams(finalizeParams).toString()

    const finalizeResult = await httpsRequest({
      hostname: 'upload.twitter.com',
      path: '/1.1/media/upload.json',
      method: 'POST',
      headers: {
        'Authorization': finalizeAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, finalizeBody)

    console.log('[Autopilot] Twitter FINALIZE:', JSON.stringify(finalizeResult).substring(0, 200))

    // Check processing status if needed
    if (finalizeResult.processing_info) {
      let checkAfter = finalizeResult.processing_info.check_after_secs || 5
      let state = finalizeResult.processing_info.state

      while (state === 'pending' || state === 'in_progress') {
        console.log('[Autopilot] Twitter video processing, waiting', checkAfter, 's...')
        await new Promise(r => setTimeout(r, checkAfter * 1000))

        const statusParams = { command: 'STATUS', media_id: mediaId }
        const statusAuth = generateOAuthHeaderWithParams('GET', mediaUploadUrl, statusParams)

        const statusResult = await httpsRequest({
          hostname: 'upload.twitter.com',
          path: `/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
          method: 'GET',
          headers: { 'Authorization': statusAuth }
        })

        state = statusResult.processing_info?.state
        checkAfter = statusResult.processing_info?.check_after_secs || 5

        if (state === 'failed') {
          console.log('[Autopilot] Twitter video processing failed:', statusResult.processing_info?.error)
          return null
        }
      }
    }

    console.log('[Autopilot] Twitter video upload complete:', mediaId)
    return mediaId

  } catch (e: any) {
    console.log('[Autopilot] Twitter video upload error:', e.message)
    return null
  }
}

async function postToTwitter(text: string, videoUrl?: string): Promise<{ success: boolean; tweetUrl?: string; error?: string }> {
  console.log('[Autopilot] Step 3: Posting to Twitter...')

  try {
    let mediaId: string | null = null

    // Upload video if provided
    if (videoUrl) {
      mediaId = await uploadVideoToTwitter(videoUrl)
      if (!mediaId) {
        console.log('[Autopilot] Video upload failed, posting without video')
      }
    }

    const tweetUrl = 'https://api.twitter.com/2/tweets'
    const auth = generateOAuthHeader('POST', tweetUrl)

    const tweetBody: any = { text }
    if (mediaId) {
      tweetBody.media = { media_ids: [mediaId] }
    }

    const result = await httpsRequest({
      hostname: 'api.twitter.com',
      path: '/2/tweets',
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      }
    }, JSON.stringify(tweetBody))

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
// 4. DISCORD NOTIFICATION (Extended with Social Media Posts)
// ============================================

async function generateSocialMediaPosts(youtubeUrl: string, videoScript: string): Promise<string> {
  const shortUrl = 'evidenra.com/pricing'

  // Use Claude to generate unique posts based on the video script
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Du bist ein Social Media Marketing Experte für EVIDENRA, ein KI-Tool für qualitative Forschungsanalyse.

Video-Script des heutigen Videos: "${videoScript}"
YouTube Link: ${youtubeUrl}
Website: ${shortUrl}

Erstelle EINZIGARTIGE, FRISCHE Posts für heute. Beziehe dich auf das Video-Script!

Format (exakt so):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📸 **INSTAGRAM** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Kreativer Post mit Emojis, 3-5 Sätze, dann "Link in bio", dann 10 relevante Hashtags]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎵 **TIKTOK** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[POV-Style oder trendy Format, kurz und catchy, "Link in bio for 60% off!", dann 8 Hashtags mit Tok-Varianten]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💼 **LINKEDIN** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Professioneller Post, Problem-Lösung Format, mit Bullet Points, endet mit Frage für Engagement, 5 Hashtags]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📘 **FACEBOOK** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Freundlicher, persönlicher Ton, mit Emojis, YouTube Link einbauen]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 **REDDIT** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Title:** [Catchy aber nicht clickbait]
**Subreddits:** r/QualitativeResearch, r/AskAcademia, r/GradSchool, r/PhD
**Post:** [Authentisch, helpful, nicht zu werblich, YouTube Link am Ende]

WICHTIG: Jeder Post muss ANDERS sein und zum heutigen Video-Script passen!`
        }]
      })
    })

    const result = await response.json()
    if (result.content?.[0]?.text) {
      return result.content[0].text
    }
  } catch (e) {
    console.log('[Autopilot] Claude API error, using fallback:', e)
  }

  // Fallback if Claude API fails
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📸 **INSTAGRAM** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔬 New EVIDENRA demo just dropped!

${videoScript}

✅ Try it free for 30 days
✅ 60% founding member discount

Link in bio 👆

#QualitativeResearch #PhD #AcademicTwitter #ResearchLife #ThesisWriting #DataAnalysis #AI #GradSchool #Academia #Dissertation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎵 **TIKTOK** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${videoScript}

Link in bio for 60% off! 🔥

#QualitativeResearch #PhDLife #ThesisTok #AcademiaTok #ResearchTok #GradSchool #AI #StudentLife

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💼 **LINKEDIN** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔬 ${videoScript}

EVIDENRA transforms qualitative research with AI-powered analysis.

→ 7 expert AI personas
→ Multi-perspective coding
→ Publication-ready exports

60% off for founding members: ${shortUrl}

#QualitativeResearch #Research #AI #Academia #PhD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📘 **FACEBOOK** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 New demo video!

${videoScript}

Watch here: ${youtubeUrl}

60% off: ${shortUrl}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 **REDDIT** (Copy & Paste):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Title:** ${videoScript.substring(0, 50)}...

**Subreddits:** r/QualitativeResearch, r/AskAcademia, r/GradSchool, r/PhD

**Post:**
${videoScript}

Demo: ${youtubeUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}

async function notifyDiscord(youtubeUrl: string, twitterUrl: string, videoUrl: string, scriptName: string): Promise<void> {
  console.log('[Autopilot] Step 4: Discord notification...')

  const socialPosts = await generateSocialMediaPosts(youtubeUrl, scriptName)

  const message = `**🎬 EVIDENRA AUTOPILOT - NEUES VIDEO**

📺 **YouTube:** ${youtubeUrl}
🐦 **Twitter:** ${twitterUrl}
📹 **Video-Datei:** ${videoUrl}

${socialPosts}`

  try {
    // Discord has 2000 char limit, so we send multiple messages
    const chunks = message.match(/[\s\S]{1,1900}/g) || [message]

    for (const chunk of chunks) {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'EVIDENRA Autopilot',
          avatar_url: 'https://evidenra.com/logo.png',
          content: chunk
        })
      })
      // Small delay between messages
      await new Promise(r => setTimeout(r, 500))
    }
  } catch (e) {
    console.log('[Autopilot] Discord error:', e)
  }
}

// ============================================
// 5. TELEGRAM NOTIFICATION
// ============================================

async function notifyTelegram(youtubeUrl: string, twitterUrl: string, videoUrl: string, scriptName: string): Promise<void> {
  console.log('[Autopilot] Step 5: Telegram notification...')

  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Autopilot] Telegram not configured')
    return
  }

  // Generate AI-based social media posts
  const socialPosts = await generateSocialMediaPosts(youtubeUrl, scriptName)

  // Plain text messages (no Markdown to avoid parsing errors)
  const messages = [
    `🎬 EVIDENRA AUTOPILOT - NEUES VIDEO

📺 YouTube: ${youtubeUrl}
🐦 Twitter: ${twitterUrl}
📹 Video: ${videoUrl}`,
    socialPosts
  ]

  try {
    for (const msg of messages) {
      // Telegram has 4096 char limit, split long messages
      const chunks = msg.match(/[\s\S]{1,4000}/g) || [msg]

      for (const chunk of chunks) {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: chunk
          })
        })
        const result = await response.json()
        console.log('[Autopilot] Telegram msg sent:', result.ok)
        await new Promise(r => setTimeout(r, 500))
      }
    }
    console.log('[Autopilot] Telegram: All messages sent')
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

    // 3. Post to Twitter (with video)
    const tweetText = `🚀 New EVIDENRA Demo!

AI-powered qualitative research made easy:
✅ Automatic interview analysis
✅ 7-Persona AKIH method
✅ Publication-ready exports

60% OFF: evidenra.com/pricing

#QualitativeResearch #AI #PhD #Academia`

    const twitterResult = await postToTwitter(tweetText, videoResult.url)
    results.twitter = twitterResult

    // 4. Discord Notification (with all social media post templates)
    await notifyDiscord(
      youtubeResult.youtubeUrl || '',
      twitterResult.tweetUrl || '',
      videoResult.url || '',
      videoResult.script || 'EVIDENRA Demo'
    )
    results.notifications.discord = true

    // 5. Telegram Notification (with all social media post templates)
    await notifyTelegram(
      youtubeResult.youtubeUrl || '',
      twitterResult.tweetUrl || '',
      videoResult.url || '',
      videoResult.script || 'EVIDENRA Demo'
    )
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

    // Error notification via simple fetch
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'EVIDENRA Autopilot',
          content: `**❌ EVIDENRA Autopilot FEHLER**\n\n${errorMsg}`
        })
      })
    } catch (discordErr) {
      console.log('[Autopilot] Discord error notification failed:', discordErr)
    }

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
