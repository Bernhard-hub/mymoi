// ============================================
// AI IMAGE GENERATION - Echte Bilder in Sekunden
// ============================================
// Verwendet Together.ai FLUX (schnell & günstig)
// ~2-3 Sekunden pro Bild, $0.003/Bild

const TOGETHER_API_KEY = (process.env.TOGETHER_API_KEY || '').trim()

export interface ImageGenResult {
  success: boolean
  imageUrl?: string
  error?: string
}

// Einzelnes Bild generieren
export async function generateImage(prompt: string): Promise<ImageGenResult> {
  if (!TOGETHER_API_KEY) {
    console.log('⚠️ TOGETHER_API_KEY nicht gesetzt, nutze Unsplash Fallback')
    return {
      success: true,
      imageUrl: `https://source.unsplash.com/800x400/?${encodeURIComponent(prompt.split(' ').slice(0, 3).join(','))}`
    }
  }

  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt: prompt,
        width: 1024,
        height: 576, // 16:9 für Hero-Bilder
        steps: 4,    // Schnell!
        n: 1
      })
    })

    const result = await response.json()

    if (result.data?.[0]?.url) {
      return { success: true, imageUrl: result.data[0].url }
    } else if (result.data?.[0]?.b64_json) {
      // Base64 zu Data URL
      return { success: true, imageUrl: `data:image/png;base64,${result.data[0].b64_json}` }
    }

    console.error('Together.ai error:', result)
    return { success: false, error: result.error?.message || 'Bildgenerierung fehlgeschlagen' }

  } catch (error: any) {
    console.error('Image generation error:', error)
    return { success: false, error: error.message }
  }
}

// Mehrere Bilder parallel generieren
export async function generateImages(prompts: string[]): Promise<ImageGenResult[]> {
  const results = await Promise.all(prompts.map(prompt => generateImage(prompt)))
  return results
}

// Bild zu Supabase hochladen und permanente URL bekommen
export async function uploadImageToStorage(
  imageUrl: string,
  fileName: string,
  supabase: any
): Promise<string | null> {
  try {
    // Bild herunterladen
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    const buffer = Buffer.from(await blob.arrayBuffer())

    // Zu Supabase hochladen
    const { error } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true
      })

    if (error) {
      console.error('Upload error:', error)
      return null
    }

    // Public URL holen
    const { data } = supabase.storage.from('assets').getPublicUrl(fileName)
    return data.publicUrl

  } catch (error) {
    console.error('Image upload error:', error)
    return null
  }
}

// Smart Prompts für Website-Bilder generieren
export function generateImagePrompts(topic: string, type: 'landing' | 'blog' | 'business'): string[] {
  const baseStyle = 'professional photography, high quality, modern, clean aesthetic, 4k'

  if (type === 'landing') {
    return [
      `Hero image for ${topic}, wide angle, inspiring, ${baseStyle}`,
      `Feature showcase for ${topic}, detail shot, ${baseStyle}`,
      `Team or people using ${topic}, candid, friendly, ${baseStyle}`
    ]
  }

  if (type === 'blog') {
    return [
      `Header image about ${topic}, editorial style, ${baseStyle}`,
      `Illustrative image for ${topic} article, informative, ${baseStyle}`
    ]
  }

  // Business default
  return [
    `Professional ${topic} business image, corporate, ${baseStyle}`,
    `${topic} in action, workplace setting, ${baseStyle}`,
    `Modern office with ${topic} theme, minimalist, ${baseStyle}`
  ]
}
