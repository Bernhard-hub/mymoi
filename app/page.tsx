export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-md text-center space-y-8">
        
        <h1 className="text-6xl font-bold">Moi</h1>
        
        <p className="text-xl text-gray-400">
          Du sprichst. Es entsteht.
        </p>

        <div className="space-y-4 text-left bg-zinc-900 p-6 rounded-lg">
          <div className="flex gap-3">
            <span className="text-gray-500">Du:</span>
            <span className="italic text-gray-300">"Präsentation für OneNote Workshop, 90 Minuten, Volksschullehrer..."</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500">Moi:</span>
            <span>📎 Workshop_OneNote.pptx</span>
          </div>
        </div>

        <div className="space-y-4 text-left bg-zinc-900 p-6 rounded-lg">
          <div className="flex gap-3">
            <span className="text-gray-500">Du:</span>
            <span className="italic text-gray-300">"Salvatore Santoro Lederjacke, Größe 50, top Zustand..."</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500">Moi:</span>
            <span>✓ Listing fertig, Preis: 385€</span>
          </div>
        </div>

        <a 
          href="https://t.me/MoiAssistantBot" 
          target="_blank"
          className="inline-block bg-white text-black font-bold py-4 px-8 rounded-full text-lg hover:bg-gray-200 transition"
        >
          Starten
        </a>

        <p className="text-sm text-gray-600">
          Erste 3 Assets kostenlos. Kein Account nötig.
        </p>

      </div>
    </main>
  )
}
