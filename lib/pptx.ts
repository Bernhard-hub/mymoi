import PptxGenJS from 'pptxgenjs'

interface Slide {
  title: string
  bullets?: string[]
  text?: string
}

export async function createPresentation(slides: Slide[], title: string): Promise<Buffer> {
  const pptx = new PptxGenJS()
  
  pptx.author = 'Moi'
  pptx.title = title
  pptx.subject = title

  // Titelfolie
  const titleSlide = pptx.addSlide()
  titleSlide.addText(title, {
    x: 0.5,
    y: '40%',
    w: '90%',
    fontSize: 44,
    bold: true,
    align: 'center',
    color: '363636'
  })

  // Inhaltsfolien
  for (const slide of slides) {
    const s = pptx.addSlide()
    
    s.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: '90%',
      fontSize: 32,
      bold: true,
      color: '363636'
    })

    if (slide.bullets && slide.bullets.length > 0) {
      s.addText(
        slide.bullets.map(b => ({ text: b, options: { bullet: true } })),
        {
          x: 0.5,
          y: 1.5,
          w: '90%',
          fontSize: 18,
          color: '666666',
          lineSpacing: 28
        }
      )
    }

    if (slide.text) {
      s.addText(slide.text, {
        x: 0.5,
        y: 1.5,
        w: '90%',
        fontSize: 18,
        color: '666666'
      })
    }
  }

  // Als Buffer zurückgeben
  const data = await pptx.write({ outputType: 'nodebuffer' })
  return data as Buffer
}
