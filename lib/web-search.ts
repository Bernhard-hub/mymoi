// Web Search mit DuckDuckGo (kostenlos, kein API Key)
// YouTube Search mit YouTube Data API

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY

// DuckDuckGo Instant Answer API (kostenlos)
export async function searchWeb(query: string): Promise<{title: string, url: string, snippet: string}[]> {
  try {
    // DuckDuckGo HTML search (scraping-like, aber erlaubt)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    const html = await response.text()

    // Parse results from HTML
    const results: {title: string, url: string, snippet: string}[] = []
    const resultMatches = html.matchAll(/<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/g)

    for (const match of resultMatches) {
      if (results.length >= 5) break
      results.push({
        url: match[1],
        title: match[2].trim(),
        snippet: match[3].trim()
      })
    }

    return results
  } catch (error) {
    console.error('Web search error:', error)
    return []
  }
}

// YouTube Search
export async function searchYouTube(query: string): Promise<{title: string, url: string, thumbnail: string, channel: string}[]> {
  try {
    if (!YOUTUBE_API_KEY) {
      // Fallback: YouTube search URL
      return [{
        title: `YouTube Suche: ${query}`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        thumbnail: '',
        channel: 'YouTube'
      }]
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`
    const response = await fetch(searchUrl)
    const data = await response.json()

    if (!data.items) return []

    return data.items.map((item: any) => ({
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails.medium.url,
      channel: item.snippet.channelTitle
    }))
  } catch (error) {
    console.error('YouTube search error:', error)
    return [{
      title: `YouTube Suche: ${query}`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      thumbnail: '',
      channel: 'YouTube'
    }]
  }
}

// Google Maps Link generieren
export function getMapLink(location: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(location)}`
}

// Wetter API (Open-Meteo - kostenlos)
export async function getWeather(city: string): Promise<{temp: number, description: string, humidity: number, wind: number} | null> {
  try {
    // Erst Geocoding - mit language=de für deutsche Städte
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=de`
    const geoRes = await fetch(geoUrl)
    const geoData = await geoRes.json()

    if (!geoData.results?.[0]) return null

    const { latitude, longitude } = geoData.results[0]

    // Dann Wetter
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
    const weatherRes = await fetch(weatherUrl)
    const weatherData = await weatherRes.json()

    const current = weatherData.current
    const weatherCodes: Record<number, string> = {
      0: 'Klar',
      1: 'Überwiegend klar',
      2: 'Teilweise bewölkt',
      3: 'Bewölkt',
      45: 'Nebel',
      48: 'Nebel mit Reif',
      51: 'Leichter Nieselregen',
      53: 'Nieselregen',
      55: 'Starker Nieselregen',
      61: 'Leichter Regen',
      63: 'Regen',
      65: 'Starker Regen',
      71: 'Leichter Schnee',
      73: 'Schnee',
      75: 'Starker Schnee',
      80: 'Regenschauer',
      81: 'Starke Regenschauer',
      82: 'Sehr starke Regenschauer',
      85: 'Schneeschauer',
      86: 'Starke Schneeschauer',
      95: 'Gewitter',
      96: 'Gewitter mit Hagel',
      99: 'Starkes Gewitter mit Hagel'
    }

    return {
      temp: Math.round(current.temperature_2m),
      description: weatherCodes[current.weather_code] || 'Unbekannt',
      humidity: current.relative_humidity_2m,
      wind: Math.round(current.wind_speed_10m)
    }
  } catch (error) {
    console.error('Weather error:', error)
    return null
  }
}

// News API (kostenlos mit RSS)
export async function getNews(topic: string): Promise<{title: string, url: string, source: string}[]> {
  try {
    // Google News RSS
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=de&gl=DE&ceid=DE:de`
    const response = await fetch(rssUrl)
    const xml = await response.text()

    const results: {title: string, url: string, source: string}[] = []
    const itemMatches = xml.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<source[^>]*>([^<]+)<\/source>[\s\S]*?<\/item>/g)

    for (const match of itemMatches) {
      if (results.length >= 5) break
      results.push({
        title: match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
        url: match[2],
        source: match[3]
      })
    }

    return results
  } catch (error) {
    console.error('News error:', error)
    return []
  }
}
