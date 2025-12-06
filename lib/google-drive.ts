// ============================================
// GOOGLE DRIVE INTEGRATION
// ============================================
// Google Drive, Docs, Sheets, Slides
// Vollständige Google Workspace Integration

import { supabase } from './supabase'
import { google } from 'googleapis'

// ============================================
// INTERFACES
// ============================================

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  type: 'file' | 'folder'
  size?: number
  modifiedTime: Date
  webViewLink: string
  webContentLink?: string
  thumbnailLink?: string
  iconLink?: string
}

export interface GoogleDoc {
  id: string
  title: string
  content: string
  webViewLink: string
}

export interface GoogleSheet {
  id: string
  title: string
  sheets: SheetData[]
  webViewLink: string
}

export interface SheetData {
  title: string
  data: any[][]
}

export interface GoogleSlide {
  id: string
  title: string
  slides: SlideData[]
  webViewLink: string
}

export interface SlideData {
  slideNumber: number
  elements: any[]
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

async function getGoogleToken(userId: number): Promise<string | null> {
  const { data } = await supabase
    .from('user_email_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single()

  if (!data) return null

  // Token noch gültig?
  if (Date.now() < data.expires_at - 60000) {
    return data.access_token
  }

  // Token refresh
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token'
      })
    })

    if (!response.ok) return null

    const tokens = await response.json()

    await supabase
      .from('user_email_configs')
      .update({
        access_token: tokens.access_token,
        expires_at: Date.now() + tokens.expires_in * 1000
      })
      .eq('user_id', userId)

    return tokens.access_token
  } catch (e) {
    console.error('Google token refresh error:', e)
    return null
  }
}

// ============================================
// GOOGLE DRIVE - Dateiverwaltung
// ============================================

/**
 * Liste Google Drive Dateien
 */
export async function listGoogleDriveFiles(
  userId: number,
  folderId?: string,
  limit: number = 50
): Promise<GoogleDriveFile[]> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const query = folderId
    ? `'${folderId}' in parents and trashed=false`
    : `'root' in parents and trashed=false`

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?` +
    `q=${encodeURIComponent(query)}&` +
    `pageSize=${limit}&` +
    `fields=files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,thumbnailLink,iconLink)&` +
    `orderBy=modifiedTime desc`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  if (!response.ok) {
    throw new Error(`Google Drive API error: ${await response.text()}`)
  }

  const data = await response.json()

  return data.files.map((file: any) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    type: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    size: parseInt(file.size || '0'),
    modifiedTime: new Date(file.modifiedTime),
    webViewLink: file.webViewLink,
    webContentLink: file.webContentLink,
    thumbnailLink: file.thumbnailLink,
    iconLink: file.iconLink
  }))
}

/**
 * Google Drive Datei hochladen
 */
export async function uploadToGoogleDrive(
  userId: number,
  fileName: string,
  fileContent: Buffer | string,
  mimeType: string,
  folderId?: string
): Promise<GoogleDriveFile> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const metadata = {
    name: fileName,
    ...(folderId && { parents: [folderId] })
  }

  // Multipart Upload
  const boundary = '-------314159265358979323846'
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    fileContent +
    closeDelimiter

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    }
  )

  if (!response.ok) {
    throw new Error(`Upload failed: ${await response.text()}`)
  }

  const file = await response.json()

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    type: 'file',
    size: parseInt(file.size || '0'),
    modifiedTime: new Date(file.modifiedTime),
    webViewLink: file.webViewLink,
    webContentLink: file.webContentLink
  }
}

/**
 * Google Drive Datei herunterladen
 */
export async function downloadFromGoogleDrive(
  userId: number,
  fileId: string
): Promise<Buffer> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  if (!response.ok) {
    throw new Error('Download fehlgeschlagen')
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Google Drive Ordner erstellen
 */
export async function createGoogleDriveFolder(
  userId: number,
  folderName: string,
  parentFolderId?: string
): Promise<GoogleDriveFile> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentFolderId && { parents: [parentFolderId] })
  }

  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    }
  )

  if (!response.ok) {
    throw new Error('Ordner-Erstellung fehlgeschlagen')
  }

  const folder = await response.json()

  return {
    id: folder.id,
    name: folder.name,
    mimeType: folder.mimeType,
    type: 'folder',
    modifiedTime: new Date(folder.modifiedTime),
    webViewLink: folder.webViewLink
  }
}

/**
 * Google Drive Datei/Ordner löschen
 */
export async function deleteFromGoogleDrive(
  userId: number,
  fileId: string
): Promise<boolean> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  return response.ok
}

/**
 * Google Drive Datei teilen
 */
export async function shareGoogleDriveFile(
  userId: number,
  fileId: string,
  emailAddress?: string,
  role: 'reader' | 'writer' | 'commenter' = 'reader',
  type: 'user' | 'anyone' = 'anyone'
): Promise<string> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const permission: any = {
    type,
    role
  }

  if (emailAddress && type === 'user') {
    permission.emailAddress = emailAddress
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(permission)
    }
  )

  if (!response.ok) {
    throw new Error('Freigabe fehlgeschlagen')
  }

  // Weblink zurückgeben
  const fileResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  const file = await fileResponse.json()
  return file.webViewLink
}

/**
 * Google Drive durchsuchen
 */
export async function searchGoogleDrive(
  userId: number,
  query: string,
  limit: number = 20
): Promise<GoogleDriveFile[]> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?` +
    `q=${encodeURIComponent(`fullText contains '${query}' and trashed=false`)}&` +
    `pageSize=${limit}&` +
    `fields=files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,thumbnailLink)&` +
    `orderBy=modifiedTime desc`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  if (!response.ok) {
    throw new Error('Suche fehlgeschlagen')
  }

  const data = await response.json()

  return data.files.map((file: any) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    type: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    size: parseInt(file.size || '0'),
    modifiedTime: new Date(file.modifiedTime),
    webViewLink: file.webViewLink,
    webContentLink: file.webContentLink,
    thumbnailLink: file.thumbnailLink
  }))
}

// ============================================
// GOOGLE DOCS - Dokumente
// ============================================

/**
 * Google Doc erstellen
 */
export async function createGoogleDoc(
  userId: number,
  title: string,
  content: string,
  folderId?: string
): Promise<GoogleDoc> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  // Leeres Dokument erstellen
  const metadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.document',
    ...(folderId && { parents: [folderId] })
  }

  const createResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    }
  )

  if (!createResponse.ok) {
    throw new Error('Dokument-Erstellung fehlgeschlagen')
  }

  const doc = await createResponse.json()

  // Inhalt einfügen
  const requests = content.split('\n').map((line, index) => ({
    insertText: {
      location: { index: index === 0 ? 1 : undefined },
      text: line + '\n'
    }
  }))

  await fetch(
    `https://docs.googleapis.com/v1/documents/${doc.id}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    }
  )

  return {
    id: doc.id,
    title: doc.name,
    content,
    webViewLink: doc.webViewLink
  }
}

/**
 * Google Doc lesen
 */
export async function readGoogleDoc(
  userId: number,
  documentId: string
): Promise<GoogleDoc> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  if (!response.ok) {
    throw new Error('Dokument nicht gefunden')
  }

  const doc = await response.json()

  // Text aus dem Dokument extrahieren
  let content = ''
  if (doc.body?.content) {
    for (const element of doc.body.content) {
      if (element.paragraph) {
        for (const textRun of element.paragraph.elements || []) {
          if (textRun.textRun?.content) {
            content += textRun.textRun.content
          }
        }
      }
    }
  }

  return {
    id: doc.documentId,
    title: doc.title,
    content,
    webViewLink: `https://docs.google.com/document/d/${doc.documentId}/edit`
  }
}

// ============================================
// GOOGLE SHEETS - Tabellen
// ============================================

/**
 * Google Sheet erstellen
 */
export async function createGoogleSheet(
  userId: number,
  title: string,
  sheets: SheetData[],
  folderId?: string
): Promise<GoogleSheet> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  // Sheet erstellen
  const spreadsheet = {
    properties: { title },
    sheets: sheets.map(s => ({
      properties: { title: s.title }
    }))
  }

  const createResponse = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(spreadsheet)
    }
  )

  if (!createResponse.ok) {
    throw new Error('Sheet-Erstellung fehlgeschlagen')
  }

  const sheet = await createResponse.json()

  // Daten befüllen
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].data.length > 0) {
      await updateGoogleSheetData(userId, sheet.spreadsheetId, sheets[i].title, sheets[i].data)
    }
  }

  // In Ordner verschieben (falls angegeben)
  if (folderId) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${sheet.spreadsheetId}?addParents=${folderId}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    )
  }

  return {
    id: sheet.spreadsheetId,
    title: sheet.properties.title,
    sheets,
    webViewLink: sheet.spreadsheetUrl
  }
}

/**
 * Google Sheet Daten aktualisieren
 */
async function updateGoogleSheetData(
  userId: number,
  spreadsheetId: string,
  sheetName: string,
  data: any[][]
): Promise<void> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const range = `${sheetName}!A1`

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: data })
    }
  )
}

/**
 * Google Sheet lesen
 */
export async function readGoogleSheet(
  userId: number,
  spreadsheetId: string
): Promise<GoogleSheet> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=true`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  if (!response.ok) {
    throw new Error('Sheet nicht gefunden')
  }

  const sheet = await response.json()

  const sheets: SheetData[] = sheet.sheets.map((s: any) => ({
    title: s.properties.title,
    data: s.data?.[0]?.rowData?.map((row: any) =>
      row.values?.map((cell: any) => cell.formattedValue || '')
    ) || []
  }))

  return {
    id: sheet.spreadsheetId,
    title: sheet.properties.title,
    sheets,
    webViewLink: sheet.spreadsheetUrl
  }
}

// ============================================
// GOOGLE SLIDES - Präsentationen
// ============================================

/**
 * Google Slides Präsentation erstellen
 */
export async function createGoogleSlides(
  userId: number,
  title: string,
  slides: Array<{ title: string; content: string[] }>,
  folderId?: string
): Promise<GoogleSlide> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  // Leere Präsentation erstellen
  const presentation = {
    title
  }

  const createResponse = await fetch(
    'https://slides.googleapis.com/v1/presentations',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(presentation)
    }
  )

  if (!createResponse.ok) {
    throw new Error('Präsentation-Erstellung fehlgeschlagen')
  }

  const pres = await createResponse.json()

  // Slides hinzufügen (vereinfacht - volle API ist komplex)
  const requests = []

  for (const slide of slides) {
    requests.push({
      createSlide: {
        slideLayoutReference: {
          predefinedLayout: 'TITLE_AND_BODY'
        }
      }
    })
  }

  if (requests.length > 0) {
    await fetch(
      `https://slides.googleapis.com/v1/presentations/${pres.presentationId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      }
    )
  }

  // In Ordner verschieben
  if (folderId) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${pres.presentationId}?addParents=${folderId}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    )
  }

  return {
    id: pres.presentationId,
    title: pres.title,
    slides: slides.map((s, i) => ({
      slideNumber: i + 1,
      elements: []
    })),
    webViewLink: `https://docs.google.com/presentation/d/${pres.presentationId}/edit`
  }
}

/**
 * Google Slides lesen
 */
export async function readGoogleSlides(
  userId: number,
  presentationId: string
): Promise<GoogleSlide> {
  const token = await getGoogleToken(userId)
  if (!token) throw new Error('Keine Google-Verbindung')

  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  if (!response.ok) {
    throw new Error('Präsentation nicht gefunden')
  }

  const pres = await response.json()

  const slides: SlideData[] = pres.slides?.map((slide: any, index: number) => ({
    slideNumber: index + 1,
    elements: slide.pageElements || []
  })) || []

  return {
    id: pres.presentationId,
    title: pres.title,
    slides,
    webViewLink: `https://docs.google.com/presentation/d/${pres.presentationId}/edit`
  }
}
