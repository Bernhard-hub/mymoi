import './globals.css'

export const metadata = {
  title: 'Moi – Du sprichst. Es entsteht.',
  description: 'Sprachnachricht rein, fertiges Asset raus.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
