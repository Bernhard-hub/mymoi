import { NextRequest, NextResponse } from 'next/server'
import {
  listOneDriveFiles,
  uploadToOneDrive,
  downloadFromOneDrive,
  createOneDriveFolder,
  deleteFromOneDrive,
  shareOneDriveFile,
  createWordDocument,
  readWordDocument,
  createExcelWorkbook,
  readExcelWorkbook,
  createPowerPointPresentation,
  searchOneDrive
} from '@/lib/microsoft-office'

import {
  listGoogleDriveFiles,
  uploadToGoogleDrive,
  downloadFromGoogleDrive,
  createGoogleDriveFolder,
  deleteFromGoogleDrive,
  shareGoogleDriveFile,
  searchGoogleDrive,
  createGoogleDoc,
  readGoogleDoc,
  createGoogleSheet,
  readGoogleSheet,
  createGoogleSlides,
  readGoogleSlides
} from '@/lib/google-drive'

// ============================================
// OFFICE API - Zentrale Schnittstelle
// ============================================
// Microsoft Office 365 & Google Workspace

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      userId, 
      provider, // 'microsoft' oder 'google'
      action, 
      params 
    } = body

    if (!userId || !provider || !action) {
      return NextResponse.json(
        { error: 'Fehlende Parameter: userId, provider, action erforderlich' },
        { status: 400 }
      )
    }

    // ============================================
    // MICROSOFT OFFICE 365
    // ============================================
    if (provider === 'microsoft') {
      switch (action) {
        // === ONEDRIVE ===
        case 'onedrive:list':
          const msFiles = await listOneDriveFiles(userId, params?.folderId, params?.limit)
          return NextResponse.json({ success: true, files: msFiles })

        case 'onedrive:upload':
          const msUpload = await uploadToOneDrive(
            userId,
            params.fileName,
            Buffer.from(params.content, params.encoding || 'utf-8'),
            params.folderPath
          )
          return NextResponse.json({ success: true, file: msUpload })

        case 'onedrive:download':
          const msDownload = await downloadFromOneDrive(userId, params.fileId)
          return NextResponse.json({ 
            success: true, 
            content: msDownload.toString(params.encoding || 'base64')
          })

        case 'onedrive:createFolder':
          const msFolder = await createOneDriveFolder(userId, params.folderName, params.parentFolderId)
          return NextResponse.json({ success: true, folder: msFolder })

        case 'onedrive:delete':
          const msDeleted = await deleteFromOneDrive(userId, params.itemId)
          return NextResponse.json({ success: msDeleted })

        case 'onedrive:share':
          const msShareLink = await shareOneDriveFile(userId, params.fileId, params.scope)
          return NextResponse.json({ success: true, shareLink: msShareLink })

        case 'onedrive:search':
          const msSearchResults = await searchOneDrive(userId, params.query, params.limit)
          return NextResponse.json({ success: true, results: msSearchResults })

        // === WORD ===
        case 'word:create':
          const wordDoc = await createWordDocument(
            userId,
            params.title,
            params.content,
            params.folderPath
          )
          return NextResponse.json({ success: true, document: wordDoc })

        case 'word:read':
          const wordContent = await readWordDocument(userId, params.fileId)
          return NextResponse.json({ success: true, document: wordContent })

        // === EXCEL ===
        case 'excel:create':
          const excelBook = await createExcelWorkbook(
            userId,
            params.title,
            params.sheets,
            params.folderPath
          )
          return NextResponse.json({ success: true, workbook: excelBook })

        case 'excel:read':
          const excelContent = await readExcelWorkbook(userId, params.fileId)
          return NextResponse.json({ success: true, workbook: excelContent })

        // === POWERPOINT ===
        case 'powerpoint:create':
          const pptPresentation = await createPowerPointPresentation(
            userId,
            params.title,
            params.slides,
            params.folderPath
          )
          return NextResponse.json({ success: true, presentation: pptPresentation })

        default:
          return NextResponse.json({ error: 'Unbekannte Action' }, { status: 400 })
      }
    }

    // ============================================
    // GOOGLE WORKSPACE
    // ============================================
    if (provider === 'google') {
      switch (action) {
        // === GOOGLE DRIVE ===
        case 'drive:list':
          const gFiles = await listGoogleDriveFiles(userId, params?.folderId, params?.limit)
          return NextResponse.json({ success: true, files: gFiles })

        case 'drive:upload':
          const gUpload = await uploadToGoogleDrive(
            userId,
            params.fileName,
            params.content,
            params.mimeType,
            params.folderId
          )
          return NextResponse.json({ success: true, file: gUpload })

        case 'drive:download':
          const gDownload = await downloadFromGoogleDrive(userId, params.fileId)
          return NextResponse.json({ 
            success: true, 
            content: gDownload.toString(params.encoding || 'base64')
          })

        case 'drive:createFolder':
          const gFolder = await createGoogleDriveFolder(userId, params.folderName, params.parentFolderId)
          return NextResponse.json({ success: true, folder: gFolder })

        case 'drive:delete':
          const gDeleted = await deleteFromGoogleDrive(userId, params.fileId)
          return NextResponse.json({ success: gDeleted })

        case 'drive:share':
          const gShareLink = await shareGoogleDriveFile(
            userId,
            params.fileId,
            params.emailAddress,
            params.role,
            params.type
          )
          return NextResponse.json({ success: true, shareLink: gShareLink })

        case 'drive:search':
          const gSearchResults = await searchGoogleDrive(userId, params.query, params.limit)
          return NextResponse.json({ success: true, results: gSearchResults })

        // === GOOGLE DOCS ===
        case 'docs:create':
          const gDoc = await createGoogleDoc(
            userId,
            params.title,
            params.content,
            params.folderId
          )
          return NextResponse.json({ success: true, document: gDoc })

        case 'docs:read':
          const gDocContent = await readGoogleDoc(userId, params.documentId)
          return NextResponse.json({ success: true, document: gDocContent })

        // === GOOGLE SHEETS ===
        case 'sheets:create':
          const gSheet = await createGoogleSheet(
            userId,
            params.title,
            params.sheets,
            params.folderId
          )
          return NextResponse.json({ success: true, spreadsheet: gSheet })

        case 'sheets:read':
          const gSheetContent = await readGoogleSheet(userId, params.spreadsheetId)
          return NextResponse.json({ success: true, spreadsheet: gSheetContent })

        // === GOOGLE SLIDES ===
        case 'slides:create':
          const gSlides = await createGoogleSlides(
            userId,
            params.title,
            params.slides,
            params.folderId
          )
          return NextResponse.json({ success: true, presentation: gSlides })

        case 'slides:read':
          const gSlidesContent = await readGoogleSlides(userId, params.presentationId)
          return NextResponse.json({ success: true, presentation: gSlidesContent })

        default:
          return NextResponse.json({ error: 'Unbekannte Action' }, { status: 400 })
      }
    }

    return NextResponse.json({ error: 'Ungültiger Provider' }, { status: 400 })

  } catch (error: any) {
    console.error('Office API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Interner Fehler' },
      { status: 500 }
    )
  }
}

// ============================================
// GET - Status & verfügbare Aktionen
// ============================================
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'online',
    version: '1.0.0',
    providers: {
      microsoft: {
        name: 'Microsoft Office 365',
        features: [
          'OneDrive Dateiverwaltung',
          'Word Dokumente',
          'Excel Arbeitsmappen',
          'PowerPoint Präsentationen'
        ],
        actions: [
          'onedrive:list', 'onedrive:upload', 'onedrive:download',
          'onedrive:createFolder', 'onedrive:delete', 'onedrive:share', 'onedrive:search',
          'word:create', 'word:read',
          'excel:create', 'excel:read',
          'powerpoint:create'
        ]
      },
      google: {
        name: 'Google Workspace',
        features: [
          'Google Drive Dateiverwaltung',
          'Google Docs',
          'Google Sheets',
          'Google Slides'
        ],
        actions: [
          'drive:list', 'drive:upload', 'drive:download',
          'drive:createFolder', 'drive:delete', 'drive:share', 'drive:search',
          'docs:create', 'docs:read',
          'sheets:create', 'sheets:read',
          'slides:create', 'slides:read'
        ]
      }
    },
    documentation: {
      usage: 'POST mit { userId, provider, action, params }',
      example: {
        userId: 12345,
        provider: 'microsoft',
        action: 'onedrive:list',
        params: { folderId: 'optional', limit: 50 }
      }
    }
  })
}
