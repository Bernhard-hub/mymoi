import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function GET() {
  const keySet = !!process.env.RESEND_API_KEY
  const keyPrefix = process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT SET'

  let testResult = null
  let error = null

  if (keySet) {
    try {
      const result = await sendEmail({
        to: 'delivered@resend.dev',
        subject: 'MOI Test Email',
        body: 'Dies ist ein Test von MOI Bot!'
      })
      testResult = result
    } catch (e: any) {
      error = e.message
    }
  }

  return NextResponse.json({
    keySet,
    keyPrefix,
    testResult,
    error
  })
}
