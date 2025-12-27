// ============================================
// RESEARCH ACCESS - Wissenschaftliche Artikel lesen
// ============================================
// Zugang zu Zenodo, ResearchGate, arXiv, PubMed, etc.

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY || '').replace(/\\n/g, '').trim()
})

// ============================================
// ARTICLE FETCHERS
// ============================================

interface ArticleResult {
  success: boolean
  title?: string
  authors?: string[]
  abstract?: string
  content?: string
  doi?: string
  url?: string
  source?: string
  error?: string
}

// Zenodo API (Open Access)
export async function fetchZenodoArticle(query: string): Promise<ArticleResult> {
  try {
    // Suche nach Artikel
    const searchUrl = `https://zenodo.org/api/records?q=${encodeURIComponent(query)}&size=1`
    const searchResponse = await fetch(searchUrl)
    const searchData = await searchResponse.json()

    if (!searchData.hits?.hits?.length) {
      return { success: false, error: 'Kein Artikel gefunden auf Zenodo' }
    }

    const record = searchData.hits.hits[0]
    const metadata = record.metadata

    return {
      success: true,
      title: metadata.title,
      authors: metadata.creators?.map((c: any) => c.name) || [],
      abstract: metadata.description,
      doi: metadata.doi,
      url: record.links?.html || `https://zenodo.org/record/${record.id}`,
      source: 'Zenodo'
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// arXiv API (Open Access)
export async function fetchArxivArticle(query: string): Promise<ArticleResult> {
  try {
    const searchUrl = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=1`
    const response = await fetch(searchUrl)
    const xmlText = await response.text()

    // Simple XML parsing
    const titleMatch = xmlText.match(/<title>([^<]+)<\/title>/g)
    const summaryMatch = xmlText.match(/<summary>([^<]+)<\/summary>/)
    const authorMatches = xmlText.match(/<name>([^<]+)<\/name>/g)
    const idMatch = xmlText.match(/<id>([^<]+)<\/id>/)

    if (!titleMatch || titleMatch.length < 2) {
      return { success: false, error: 'Kein Artikel gefunden auf arXiv' }
    }

    // Erster Titel ist der Feed-Titel, zweiter ist der Artikel
    const title = titleMatch[1]?.replace(/<\/?title>/g, '').trim()
    const abstract = summaryMatch?.[1]?.trim()
    const authors = authorMatches?.map(a => a.replace(/<\/?name>/g, '').trim()) || []
    const arxivId = idMatch?.[1]?.split('/').pop()

    return {
      success: true,
      title,
      authors,
      abstract,
      url: `https://arxiv.org/abs/${arxivId}`,
      source: 'arXiv'
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// PubMed API (Biomedical)
export async function fetchPubmedArticle(query: string): Promise<ArticleResult> {
  try {
    // Erst ID suchen
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=1&retmode=json`
    const searchResponse = await fetch(searchUrl)
    const searchData = await searchResponse.json()

    const pmid = searchData.esearchresult?.idlist?.[0]
    if (!pmid) {
      return { success: false, error: 'Kein Artikel gefunden auf PubMed' }
    }

    // Details abrufen
    const detailUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`
    const detailResponse = await fetch(detailUrl)
    const xmlText = await detailResponse.text()

    const titleMatch = xmlText.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/)
    const abstractMatch = xmlText.match(/<AbstractText[^>]*>([^<]+)<\/AbstractText>/)

    return {
      success: true,
      title: titleMatch?.[1],
      abstract: abstractMatch?.[1],
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
      source: 'PubMed'
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Semantic Scholar API (AI-powered)
export async function fetchSemanticScholarArticle(query: string): Promise<ArticleResult> {
  try {
    const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=1&fields=title,authors,abstract,url,externalIds`
    const response = await fetch(searchUrl)
    const data = await response.json()

    if (!data.data?.length) {
      return { success: false, error: 'Kein Artikel gefunden auf Semantic Scholar' }
    }

    const paper = data.data[0]

    return {
      success: true,
      title: paper.title,
      authors: paper.authors?.map((a: any) => a.name) || [],
      abstract: paper.abstract,
      doi: paper.externalIds?.DOI,
      url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
      source: 'Semantic Scholar'
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// CrossRef API (DOI Resolver)
export async function fetchByDOI(doi: string): Promise<ArticleResult> {
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOI/1.0 (mailto:support@mymoi.app)' }
    })
    const data = await response.json()

    if (data.status !== 'ok') {
      return { success: false, error: 'DOI nicht gefunden' }
    }

    const work = data.message

    return {
      success: true,
      title: work.title?.[0],
      authors: work.author?.map((a: any) => `${a.given} ${a.family}`) || [],
      abstract: work.abstract?.replace(/<[^>]*>/g, ''), // HTML entfernen
      doi: work.DOI,
      url: work.URL,
      source: 'CrossRef'
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Web-Artikel von beliebiger URL lesen
export async function fetchWebArticle(url: string): Promise<ArticleResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MOI/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    })

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` }
    }

    const html = await response.text()

    // Titel extrahieren
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    const title = titleMatch?.[1]?.trim()

    // Meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    const description = descMatch?.[1]

    // Artikel-Content extrahieren (vereinfacht)
    // Entferne Scripts, Styles, Navigation
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Auf sinnvolle Länge kürzen
    content = content.substring(0, 10000)

    return {
      success: true,
      title,
      abstract: description,
      content,
      url,
      source: 'Web'
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================
// MAIN RESEARCH FUNCTION
// ============================================

export async function researchArticle(query: string): Promise<{
  success: boolean
  article?: ArticleResult
  summary?: string
  error?: string
}> {
  // DOI erkennen
  if (query.includes('10.') && query.includes('/')) {
    const doiMatch = query.match(/10\.\d{4,}\/[^\s]+/)
    if (doiMatch) {
      const article = await fetchByDOI(doiMatch[0])
      if (article.success) {
        const summary = await summarizeArticle(article)
        return { success: true, article, summary }
      }
    }
  }

  // URL erkennen
  if (query.startsWith('http')) {
    const article = await fetchWebArticle(query)
    if (article.success) {
      const summary = await summarizeArticle(article)
      return { success: true, article, summary }
    }
  }

  // Spezifische Plattformen erkennen
  if (query.toLowerCase().includes('arxiv')) {
    const searchQuery = query.replace(/arxiv/i, '').trim()
    const article = await fetchArxivArticle(searchQuery)
    if (article.success) {
      const summary = await summarizeArticle(article)
      return { success: true, article, summary }
    }
  }

  if (query.toLowerCase().includes('pubmed') || query.toLowerCase().includes('medical')) {
    const searchQuery = query.replace(/pubmed|medical/gi, '').trim()
    const article = await fetchPubmedArticle(searchQuery)
    if (article.success) {
      const summary = await summarizeArticle(article)
      return { success: true, article, summary }
    }
  }

  // Parallele Suche auf allen Plattformen
  const results = await Promise.all([
    fetchSemanticScholarArticle(query),
    fetchZenodoArticle(query),
    fetchArxivArticle(query)
  ])

  // Ersten erfolgreichen nehmen
  const article = results.find(r => r.success)

  if (article) {
    const summary = await summarizeArticle(article)
    return { success: true, article, summary }
  }

  return { success: false, error: 'Kein Artikel gefunden auf Zenodo, arXiv oder Semantic Scholar' }
}

// Artikel zusammenfassen
async function summarizeArticle(article: ArticleResult): Promise<string> {
  const textToSummarize = article.content || article.abstract || article.title || ''

  if (textToSummarize.length < 100) {
    return textToSummarize
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `Fasse den wissenschaftlichen Artikel kurz und verständlich zusammen (max 3-4 Sätze).
Erwähne: Hauptthema, wichtigste Erkenntnis, Relevanz.
Antworte auf Deutsch, auch wenn der Artikel englisch ist.`,
    messages: [{
      role: 'user',
      content: `Titel: ${article.title}\n\nAutoren: ${article.authors?.join(', ')}\n\nInhalt:\n${textToSummarize.substring(0, 5000)}`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

// ============================================
// VOICE HELPER - Für Sprachausgabe formatieren
// ============================================

export function formatArticleForVoice(article: ArticleResult, summary: string): string {
  let response = ''

  if (article.title) {
    response += `Der Artikel heißt: ${article.title}. `
  }

  if (article.authors?.length) {
    const authorText = article.authors.length > 3
      ? `${article.authors.slice(0, 2).join(', ')} und andere`
      : article.authors.join(' und ')
    response += `Von ${authorText}. `
  }

  if (summary) {
    response += summary
  }

  if (article.url) {
    response += ` Den vollständigen Artikel findest du unter ${article.source}.`
  }

  return response
}
