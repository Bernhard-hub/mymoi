// PDF Generator für MOI
import PDFDocument from 'pdfkit'

export async function createPDF(title: string, content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: title,
          Author: 'MOI - AI Assistant',
          Creator: 'MOI by MYMOI'
        }
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Header
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .text(title, { align: 'center' })

      doc.moveDown()

      // Trennlinie
      doc.moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke('#333333')

      doc.moveDown()

      // Content - Markdown-ähnliche Formatierung
      const lines = content.split('\n')

      for (const line of lines) {
        if (line.startsWith('# ')) {
          // H1
          doc.fontSize(18)
             .font('Helvetica-Bold')
             .text(line.substring(2))
          doc.moveDown(0.5)
        } else if (line.startsWith('## ')) {
          // H2
          doc.fontSize(14)
             .font('Helvetica-Bold')
             .text(line.substring(3))
          doc.moveDown(0.3)
        } else if (line.startsWith('### ')) {
          // H3
          doc.fontSize(12)
             .font('Helvetica-Bold')
             .text(line.substring(4))
          doc.moveDown(0.2)
        } else if (line.startsWith('- ') || line.startsWith('• ')) {
          // Bullet points
          doc.fontSize(11)
             .font('Helvetica')
             .text('• ' + line.substring(2), { indent: 20 })
        } else if (line.startsWith('* ')) {
          // Bold text (simplified)
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .text(line.substring(2).replace(/\*/g, ''))
        } else if (line.trim() === '') {
          // Empty line
          doc.moveDown(0.5)
        } else {
          // Normal text
          doc.fontSize(11)
             .font('Helvetica')
             .text(line)
        }
      }

      // Footer
      doc.moveDown(2)
      doc.fontSize(9)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text('Erstellt mit MOI - Dein AI-Assistent', { align: 'center' })

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
