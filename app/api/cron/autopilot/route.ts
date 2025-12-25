/**
 * Vercel Cron Endpoint for Daily Autopilot
 * Triggered daily at 10:00 UTC (11:00 MEZ)
 */

import { NextResponse } from 'next/server'

const AUTOPILOT_URL = 'https://mymoi-bot.vercel.app/api/autopilot'

export async function GET(request: Request) {
  // Verify Vercel Cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    console.log('[Cron] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Starting daily autopilot at', new Date().toISOString())

  try {
    const response = await fetch(AUTOPILOT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})  // No testVideoUrl = create new video
    })

    const result = await response.json()
    console.log('[Cron] Autopilot result:', JSON.stringify(result).substring(0, 500))

    return NextResponse.json({
      success: true,
      message: 'Daily autopilot triggered',
      timestamp: new Date().toISOString(),
      autopilotResult: result
    })
  } catch (error: any) {
    console.error('[Cron] Error:', error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error'
    }, { status: 500 })
  }
}
