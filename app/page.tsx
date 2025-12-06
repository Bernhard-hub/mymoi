'use client'

import { useState, useRef, useEffect } from 'react'

export default function Home() {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<{role: 'user' | 'moi', text: string, timestamp: Date}[]>([])
  const [transcript, setTranscript] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Service Worker registrieren
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.log('SW registration failed:', err))
    }
  }, [])

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        await processAudio(audioBlob)
      }

      mediaRecorder.start()
      setIsListening(true)
    } catch (err) {
      console.error('Microphone error:', err)
      alert('Mikrofon-Zugriff benötigt!')
    }
  }

  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop()
      setIsListening(false)
    }
  }

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true)
    setTranscript('Verarbeite...')

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/genesis', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.transcript) {
        setMessages(prev => [...prev,
          { role: 'user', text: data.transcript, timestamp: new Date() }
        ])
      }

      if (data.response) {
        setMessages(prev => [...prev,
          { role: 'moi', text: data.response, timestamp: new Date() }
        ])

        // Text-to-Speech
        if (data.audioUrl) {
          const audio = new Audio(data.audioUrl)
          audio.play()
        } else if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(data.response)
          utterance.lang = 'de-DE'
          speechSynthesis.speak(utterance)
        }
      }

      setTranscript('')
    } catch (err) {
      console.error('Processing error:', err)
      setTranscript('Fehler beim Verarbeiten')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 text-white flex flex-col">
      {/* Header */}
      <header className="p-4 text-center border-b border-zinc-800">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-500 to-cyan-500 bg-clip-text text-transparent">
          MOI
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Genesis Engine</p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-zinc-500 mt-20">
            <div className="text-6xl mb-4">🎤</div>
            <p className="text-lg">Tippe auf den Button und sprich</p>
            <p className="text-sm mt-2">Du sprichst. Es entsteht.</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-100'
              }`}>
                <p>{msg.text}</p>
                <p className="text-xs opacity-50 mt-1">
                  {msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}

        {transcript && (
          <div className="text-center text-zinc-400 animate-pulse">
            {transcript}
          </div>
        )}
      </div>

      {/* Voice Button */}
      <div className="p-6 flex justify-center">
        <button
          onMouseDown={startListening}
          onMouseUp={stopListening}
          onTouchStart={startListening}
          onTouchEnd={stopListening}
          disabled={isProcessing}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-200 transform
            ${isListening
              ? 'bg-red-500 scale-110 animate-pulse shadow-lg shadow-red-500/50'
              : isProcessing
                ? 'bg-zinc-700 cursor-wait'
                : 'bg-gradient-to-r from-violet-600 to-cyan-600 hover:scale-105 active:scale-95 shadow-lg shadow-violet-500/30'
            }
          `}
        >
          {isProcessing ? (
            <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          )}
        </button>
      </div>

      {/* Hint */}
      <p className="text-center text-xs text-zinc-600 pb-4">
        {isListening ? 'Loslassen zum Senden' : 'Gedrückt halten zum Sprechen'}
      </p>

      {/* Install PWA prompt */}
      <InstallPrompt />
    </main>
  )
}

function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 bg-zinc-800 rounded-2xl p-4 flex items-center gap-4 shadow-xl">
      <div className="flex-1">
        <p className="font-semibold">MOI installieren</p>
        <p className="text-sm text-zinc-400">Schneller Zugriff vom Homescreen</p>
      </div>
      <button
        onClick={install}
        className="bg-violet-600 px-4 py-2 rounded-lg font-medium"
      >
        Installieren
      </button>
      <button
        onClick={() => setShowPrompt(false)}
        className="text-zinc-400 p-2"
      >
        ✕
      </button>
    </div>
  )
}
