'use client'

import { useState, useRef, useEffect } from 'react'

// MOI Brand Colors - Emerald Green Theme
const COLORS = {
  primary: '#10b981',      // Emerald-500
  primaryDark: '#059669',  // Emerald-600
  primaryLight: '#34d399', // Emerald-400
  glow: 'rgba(16, 185, 129, 0.5)',
  bg: '#0a0f0d',           // Dark green-tinted black
  bgCard: '#0d1512',       // Slightly lighter
  text: '#ecfdf5',         // Emerald-50
  textMuted: '#6ee7b7',    // Emerald-300
}

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
    <main className="min-h-screen text-white flex flex-col" style={{ background: 'linear-gradient(to bottom, #0a0f0d, #061009)' }}>
      {/* Header */}
      <header className="p-4 text-center border-b" style={{ borderColor: '#1a2f25' }}>
        <div className="flex items-center justify-center gap-2">
          <svg viewBox="0 0 100 60" className="w-10 h-6">
            {/* Soundwave Logo */}
            <rect x="5" y="20" width="6" height="20" rx="3" fill="#10b981"/>
            <rect x="15" y="12" width="6" height="36" rx="3" fill="#10b981"/>
            <rect x="25" y="18" width="6" height="24" rx="3" fill="#10b981"/>
            <rect x="35" y="8" width="6" height="44" rx="3" fill="#10b981"/>
            <rect x="45" y="4" width="6" height="52" rx="3" fill="#10b981"/>
            <rect x="55" y="8" width="6" height="44" rx="3" fill="#10b981"/>
            <rect x="65" y="14" width="6" height="32" rx="3" fill="#10b981"/>
            <rect x="75" y="10" width="6" height="40" rx="3" fill="#10b981"/>
            <rect x="85" y="18" width="6" height="24" rx="3" fill="#10b981"/>
          </svg>
          <h1 className="text-2xl font-bold" style={{ color: '#10b981' }}>MOI</h1>
        </div>
        <p className="text-xs mt-1" style={{ color: '#34d399' }}>Genesis Engine</p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center mt-20" style={{ color: '#6ee7b7' }}>
            <div className="mb-6">
              <svg viewBox="0 0 100 60" className="w-24 h-14 mx-auto opacity-60">
                <rect x="5" y="20" width="6" height="20" rx="3" fill="#10b981"/>
                <rect x="15" y="12" width="6" height="36" rx="3" fill="#10b981"/>
                <rect x="25" y="18" width="6" height="24" rx="3" fill="#10b981"/>
                <rect x="35" y="8" width="6" height="44" rx="3" fill="#10b981"/>
                <rect x="45" y="4" width="6" height="52" rx="3" fill="#10b981"/>
                <rect x="55" y="8" width="6" height="44" rx="3" fill="#10b981"/>
                <rect x="65" y="14" width="6" height="32" rx="3" fill="#10b981"/>
                <rect x="75" y="10" width="6" height="40" rx="3" fill="#10b981"/>
                <rect x="85" y="18" width="6" height="24" rx="3" fill="#10b981"/>
              </svg>
            </div>
            <p className="text-lg">Tippe auf den Button und sprich</p>
            <p className="text-sm mt-2 opacity-70">Du sprichst. Es entsteht.</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3`} style={{
                background: msg.role === 'user' ? '#10b981' : '#0d1f17',
                color: msg.role === 'user' ? '#0a0f0d' : '#ecfdf5'
              }}>
                <p>{msg.text}</p>
                <p className="text-xs opacity-50 mt-1">
                  {msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}

        {transcript && (
          <div className="text-center animate-pulse" style={{ color: '#6ee7b7' }}>
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
          className="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 transform"
          style={{
            background: isListening
              ? '#ef4444'
              : isProcessing
                ? '#1a2f25'
                : 'linear-gradient(135deg, #10b981, #059669)',
            transform: isListening ? 'scale(1.1)' : 'scale(1)',
            boxShadow: isListening
              ? '0 0 30px rgba(239, 68, 68, 0.5)'
              : isProcessing
                ? 'none'
                : '0 0 30px rgba(16, 185, 129, 0.4)',
            cursor: isProcessing ? 'wait' : 'pointer'
          }}
        >
          {isProcessing ? (
            <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="4"/>
              <path className="opacity-75" fill="#10b981" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
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
      <p className="text-center text-xs pb-4" style={{ color: '#34d399' }}>
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
    <div className="fixed bottom-20 left-4 right-4 rounded-2xl p-4 flex items-center gap-4 shadow-xl" style={{ background: '#0d1f17', border: '1px solid #1a3d2e' }}>
      <div className="flex-1">
        <p className="font-semibold" style={{ color: '#ecfdf5' }}>MOI installieren</p>
        <p className="text-sm" style={{ color: '#6ee7b7' }}>Schneller Zugriff vom Homescreen</p>
      </div>
      <button
        onClick={install}
        className="px-4 py-2 rounded-lg font-medium"
        style={{ background: '#10b981', color: '#0a0f0d' }}
      >
        Installieren
      </button>
      <button
        onClick={() => setShowPrompt(false)}
        className="p-2"
        style={{ color: '#6ee7b7' }}
      >
        ✕
      </button>
    </div>
  )
}
