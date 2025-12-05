import twilio from 'twilio'

// ============================================
// TWILIO DELIVERY - SMS & WhatsApp
// ============================================

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

// SMS senden
export async function sendSMS(to: string, message: string, mediaUrl?: string | null) {
  try {
    const options: any = {
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
      body: message.slice(0, 1600) // SMS-Limit
    }

    // MMS für Dateien (nur USA/Kanada - bei anderen Nummern ignorieren)
    if (mediaUrl && to.startsWith('+1')) {
      options.mediaUrl = [mediaUrl]
    }

    const result = await twilioClient.messages.create(options)
    console.log(`📱 SMS gesendet an ${to}: ${result.sid}`)
    return { success: true, sid: result.sid }
  } catch (error: any) {
    console.error('SMS Fehler:', error.message)
    return { success: false, error: error.message }
  }
}

// WhatsApp senden
export async function sendWhatsApp(to: string, message: string, mediaUrl?: string | null) {
  try {
    if (!process.env.TWILIO_WHATSAPP_NUMBER) {
      console.log('WhatsApp nicht konfiguriert, Fallback auf SMS')
      return sendSMS(to, message, mediaUrl)
    }

    const options: any = {
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`,
      body: message
    }

    if (mediaUrl) {
      options.mediaUrl = [mediaUrl]
    }

    const result = await twilioClient.messages.create(options)
    console.log(`💬 WhatsApp gesendet an ${to}: ${result.sid}`)
    return { success: true, sid: result.sid }
  } catch (error: any) {
    console.error('WhatsApp Fehler:', error.message)
    // Fallback auf SMS
    return sendSMS(to, message, mediaUrl)
  }
}

// Outbound Call machen (für "Ruf meinen Friseur an" Feature - kommt später)
export async function makeOutboundCall(to: string, twimlUrl: string) {
  try {
    const call = await twilioClient.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER!,
      to,
      url: twimlUrl
    })
    console.log(`📞 Outbound Call zu ${to}: ${call.sid}`)
    return { success: true, sid: call.sid }
  } catch (error: any) {
    console.error('Outbound Call Fehler:', error.message)
    return { success: false, error: error.message }
  }
}
