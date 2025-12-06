// ============================================
// MICROSOFT OFFICE INTEGRATION
// ============================================
// OneDrive, Word, Excel, PowerPoint via Microsoft Graph API
// Vollständige Cloud-Office Suite Integration

import { supabase } from './supabase'

// ============================================
// INTERFACES
// ============================================

export interface DriveFile {
  id: string
  name: string
  type: 'file' | 'folder'
  mimeType: string
  size?: number
  modifiedTime: Date
  webUrl: string
  downloadUrl?: string
  thumbnailUrl?: string
}

export interface WordDocument {
  id: string
  name: string
  content: string
  webUrl: string
}

export interface ExcelWorkbook {
  id: string
  name: string
  sheets: ExcelSheet[]
  webUrl: string
}

export interface ExcelSheet {
  name: string
  data: any[][]
}

export interface PowerPointPresentation {
  id: string
  name: string
  slides: PowerPointSlide[]
  webUrl: string
}

export interface PowerPointSlide {
  slideNumber: number
  title: string
  content: string
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

async function getMicrosoftToken(userId: number): Promise<string | null> {
  const { data } = await supabase
    .from('user_email_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'microsoft')
    .single()

  if (!data) return null

  // Token noch gültig?
  if (Date.now() < data.expires_at - 60000) {
    return data.access_token
  }

  // Token refresh
  try {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/.default offline_access'
      })
    })

    if (!response.ok) return null

    const tokens = await response.json()

    await supabase
      .from('user_email_configs')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || data.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000
      })
      .eq('user_id', userId)

    return tokens.access_token
  } catch (e) {
    console.error('Microsoft token refresh error:', e)
    return null
  }
}

// ============================================
// ONEDRIVE - Dateiverwaltung
// ============================================

/**
 * Liste alle Dateien in OneDrive
 */
export async function listOneDriveFiles(
  userId: number,
  folderId?: string,
  limit: number = 50
): Promise<DriveFile[]> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  const endpoint = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`

  const response = await fetch(`${endpoint}?$top=${limit}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!response.ok) {
    throw new Error(`OneDrive API error: ${await response.text()}`)
  }

  const data = await response.json()

  return data.value.map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.folder ? 'folder' : 'file',
    mimeType: item.file?.mimeType || 'application/octet-stream',
    size: item.size,
    modifiedTime: new Date(item.lastModifiedDateTime),
    webUrl: item.webUrl,
    downloadUrl: item['@microsoft.graph.downloadUrl'],
    thumbnailUrl: item.thumbnails?.[0]?.large?.url
  }))
}

/**
 * OneDrive-Datei hochladen
 */
export async function uploadToOneDrive(
  userId: number,
  fileName: string,
  fileContent: Buffer | string,
  folderPath?: string
): Promise<DriveFile> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  const uploadPath = folderPath
    ? `/me/drive/root:/${folderPath}/${fileName}:/content`
    : `/me/drive/root:/${fileName}:/content`

  // Convert Buffer to Uint8Array for fetch compatibility
  const body = typeof fileContent === 'string'
    ? fileContent
    : new Uint8Array(fileContent)

  const response = await fetch(`https://graph.microsoft.com/v1.0${uploadPath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream'
    },
    body
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${await response.text()}`)
  }

  const item = await response.json()

  return {
    id: item.id,
    name: item.name,
    type: 'file',
    mimeType: item.file?.mimeType || 'application/octet-stream',
    size: item.size,
    modifiedTime: new Date(item.lastModifiedDateTime),
    webUrl: item.webUrl,
    downloadUrl: item['@microsoft.graph.downloadUrl']
  }
}

/**
 * OneDrive-Datei herunterladen
 */
export async function downloadFromOneDrive(
  userId: number,
  fileId: string
): Promise<Buffer> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  // Download-URL holen
  const metaResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )

  if (!metaResponse.ok) {
    throw new Error('Datei nicht gefunden')
  }

  const meta = await metaResponse.json()
  const downloadUrl = meta['@microsoft.graph.downloadUrl']

  // Datei herunterladen
  const fileResponse = await fetch(downloadUrl)
  const arrayBuffer = await fileResponse.arrayBuffer()

  return Buffer.from(arrayBuffer)
}

/**
 * OneDrive-Ordner erstellen
 */
export async function createOneDriveFolder(
  userId: number,
  folderName: string,
  parentFolderId?: string
): Promise<DriveFile> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  const endpoint = parentFolderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentFolderId}/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename'
    })
  })

  if (!response.ok) {
    throw new Error(`Ordner-Erstellung fehlgeschlagen: ${await response.text()}`)
  }

  const item = await response.json()

  return {
    id: item.id,
    name: item.name,
    type: 'folder',
    mimeType: 'folder',
    modifiedTime: new Date(item.lastModifiedDateTime),
    webUrl: item.webUrl
  }
}

/**
 * OneDrive-Datei/Ordner löschen
 */
export async function deleteFromOneDrive(
  userId: number,
  itemId: string
): Promise<boolean> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  return response.ok
}

/**
 * OneDrive-Datei teilen (Share-Link erstellen)
 */
export async function shareOneDriveFile(
  userId: number,
  fileId: string,
  scope: 'anonymous' | 'organization' = 'anonymous'
): Promise<string> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/createLink`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'view',
        scope
      })
    }
  )

  if (!response.ok) {
    throw new Error('Share-Link-Erstellung fehlgeschlagen')
  }

  const data = await response.json()
  return data.link.webUrl
}

// ============================================
// WORD - Dokumente erstellen & bearbeiten
// ============================================

/**
 * Word-Dokument erstellen
 */
export async function createWordDocument(
  userId: number,
  title: string,
  content: string,
  folderPath?: string
): Promise<WordDocument> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  // Word-Dokument als HTML formatieren
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
      </head>
      <body>
        ${content.split('\n\n').map(p => `<p>${p}</p>`).join('\n')}
      </body>
    </html>
  `

  const fileName = `${title}.docx`
  const uploadPath = folderPath
    ? `/me/drive/root:/${folderPath}/${fileName}:/content`
    : `/me/drive/root:/${fileName}:/content`

  // Word-Dokument hochladen (Microsoft konvertiert HTML automatisch)
  const response = await fetch(`https://graph.microsoft.com/v1.0${uploadPath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    },
    body: htmlContent
  })

  if (!response.ok) {
    throw new Error(`Word-Erstellung fehlgeschlagen: ${await response.text()}`)
  }

  const item = await response.json()

  return {
    id: item.id,
    name: item.name,
    content: content,
    webUrl: item.webUrl
  }
}

/**
 * Word-Dokument lesen
 */
export async function readWordDocument(
  userId: number,
  fileId: string
): Promise<WordDocument> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  // Dokument-Metadaten holen
  const metaResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )

  if (!metaResponse.ok) {
    throw new Error('Dokument nicht gefunden')
  }

  const meta = await metaResponse.json()

  // Inhalt als Text extrahieren (vereinfacht - für komplexere Extraktion würde man Office.js verwenden)
  const contentResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )

  const content = await contentResponse.text()

  return {
    id: meta.id,
    name: meta.name,
    content: content,
    webUrl: meta.webUrl
  }
}

// ============================================
// EXCEL - Arbeitsmappen erstellen & lesen
// ============================================

/**
 * Excel-Arbeitsmappe erstellen
 */
export async function createExcelWorkbook(
  userId: number,
  title: string,
  sheets: ExcelSheet[],
  folderPath?: string
): Promise<ExcelWorkbook> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  // Leere Arbeitsmappe erstellen
  const fileName = `${title}.xlsx`
  const uploadPath = folderPath
    ? `/me/drive/root:/${folderPath}/${fileName}:/content`
    : `/me/drive/root:/${fileName}:/content`

  // Leere Excel-Datei hochladen
  const createResponse = await fetch(`https://graph.microsoft.com/v1.0${uploadPath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    },
    body: Buffer.from([]) // Leeres Excel
  })

  if (!createResponse.ok) {
    throw new Error('Excel-Erstellung fehlgeschlagen')
  }

  const workbook = await createResponse.json()

  // Sheets befüllen
  for (const sheet of sheets) {
    await addExcelSheet(userId, workbook.id, sheet.name, sheet.data)
  }

  return {
    id: workbook.id,
    name: workbook.name,
    sheets: sheets,
    webUrl: workbook.webUrl
  }
}

/**
 * Excel-Sheet hinzufügen
 */
async function addExcelSheet(
  userId: number,
  workbookId: string,
  sheetName: string,
  data: any[][]
): Promise<void> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  // Sheet erstellen
  const sheetResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: sheetName })
    }
  )

  if (!sheetResponse.ok) {
    throw new Error('Sheet-Erstellung fehlgeschlagen')
  }

  const sheet = await sheetResponse.json()

  // Daten einfügen
  if (data.length > 0) {
    const range = `A1:${columnIndexToLetter(data[0].length - 1)}${data.length}`

    await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${sheet.id}/range(address='${range}')`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: data })
      }
    )
  }
}

/**
 * Excel-Arbeitsmappe lesen
 */
export async function readExcelWorkbook(
  userId: number,
  fileId: string
): Promise<ExcelWorkbook> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  // Workbook-Metadaten
  const metaResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )

  const meta = await metaResponse.json()

  // Sheets auflisten
  const sheetsResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )

  const sheetsData = await sheetsResponse.json()

  const sheets: ExcelSheet[] = []

  for (const sheet of sheetsData.value) {
    // Verwendeten Bereich lesen
    const rangeResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheet.id}/usedRange`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    )

    const range = await rangeResponse.json()

    sheets.push({
      name: sheet.name,
      data: range.values || []
    })
  }

  return {
    id: meta.id,
    name: meta.name,
    sheets,
    webUrl: meta.webUrl
  }
}

// ============================================
// POWERPOINT - Präsentationen erstellen
// ============================================

/**
 * PowerPoint-Präsentation erstellen
 */
export async function createPowerPointPresentation(
  userId: number,
  title: string,
  slides: PowerPointSlide[],
  folderPath?: string
): Promise<PowerPointPresentation> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  // Leere Präsentation erstellen
  const fileName = `${title}.pptx`
  const uploadPath = folderPath
    ? `/me/drive/root:/${folderPath}/${fileName}:/content`
    : `/me/drive/root:/${fileName}:/content`

  const createResponse = await fetch(`https://graph.microsoft.com/v1.0${uploadPath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    },
    body: Buffer.from([]) // Leere Präsentation
  })

  if (!createResponse.ok) {
    throw new Error('PowerPoint-Erstellung fehlgeschlagen')
  }

  const presentation = await createResponse.json()

  // Hinweis: Vollständige Slide-Bearbeitung über Graph API ist limitiert
  // Für produktives Szenario würde man Office.js oder PowerPoint REST API verwenden

  return {
    id: presentation.id,
    name: presentation.name,
    slides,
    webUrl: presentation.webUrl
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function columnIndexToLetter(index: number): string {
  let letter = ''
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter
    index = Math.floor(index / 26) - 1
  }
  return letter
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

/**
 * OneDrive durchsuchen
 */
export async function searchOneDrive(
  userId: number,
  query: string,
  limit: number = 20
): Promise<DriveFile[]> {
  const token = await getMicrosoftToken(userId)
  if (!token) throw new Error('Keine Microsoft-Verbindung')

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')?$top=${limit}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )

  if (!response.ok) {
    throw new Error('Suche fehlgeschlagen')
  }

  const data = await response.json()

  return data.value.map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.folder ? 'folder' : 'file',
    mimeType: item.file?.mimeType || 'application/octet-stream',
    size: item.size,
    modifiedTime: new Date(item.lastModifiedDateTime),
    webUrl: item.webUrl,
    downloadUrl: item['@microsoft.graph.downloadUrl']
  }))
}
