'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type Message = { role: 'user' | 'moi'; text: string; timestamp: Date; image?: string }

export default function Home() {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [transcript, setTranscript] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const silenceStartRef = useRef<number>(0)
  const animationFrameRef = useRef<number>(0)

  // Auto-scroll zu neuen Nachrichten
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true)
    setTranscript('Hoere...')
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      const response = await fetch('/api/genesis', { method: 'POST', body: formData })
      const data = await response.json()
      if (data.transcript) {
        setMessages(prev => [...prev, { role: 'user', text: data.transcript, timestamp: new Date() }])
      }
      if (data.response) {
        setMessages(prev => [...prev, { role: 'moi', text: data.response, timestamp: new Date(), image: data.generatedContent }])
        if (data.audioUrl) {
          const audio = new Audio(data.audioUrl)
          audio.play().catch(() => {
            if ('speechSynthesis' in window) {
              const u = new SpeechSynthesisUtterance(data.response)
              u.lang = 'de-DE'
              speechSynthesis.speak(u)
            }
          })
        } else if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(data.response)
          u.lang = 'de-DE'
          speechSynthesis.speak(u)
        }
      }
      setTranscript('')
    } catch (err) {
      console.error('Processing error:', err)
      setTranscript('Fehler')
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = 0 }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop()
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null }
    analyserRef.current = null
    setIsListening(false)
    setAudioLevel(0)
    silenceStartRef.current = 0
  }, [])

  const startRecording = useCallback(async () => {
    if (isListening || isProcessing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ac = new AudioContext()
      audioContextRef.current = ac
      const an = ac.createAnalyser()
      analyserRef.current = an
      ac.createMediaStreamSource(stream).connect(an)
      an.fftSize = 256
      const check = () => {
        if (!analyserRef.current) return
        const d = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(d)
        const avg = d.reduce((a, b) => a + b) / d.length
        setAudioLevel(avg)
        if (avg < 12) {
          if (!silenceStartRef.current) silenceStartRef.current = Date.now()
          else if (Date.now() - silenceStartRef.current > 1500) { stopRecording(); return }
        } else silenceStartRef.current = 0
        animationFrameRef.current = requestAnimationFrame(check)
      }
      check()
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (blob.size > 2000) await processAudio(blob)
      }
      mr.start()
      setIsListening(true)
      silenceStartRef.current = 0
    } catch (err) {
      console.error('Mic error:', err)
      alert('Mikrofon-Zugriff benoetigt!')
    }
  }, [isListening, isProcessing, stopRecording, processAudio])

  const toggleRecording = useCallback(() => {
    if (isListening) stopRecording()
    else startRecording()
  }, [isListening, startRecording, stopRecording])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      const a = document.createElement('audio')
      a.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      a.loop = true
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'MOI', artist: 'Play/Pause', album: 'MOI' })
      navigator.mediaSession.setActionHandler('play', () => { a.play().catch(() => {}); if (!isListening && !isProcessing) startRecording() })
      navigator.mediaSession.setActionHandler('pause', () => { if (isListening) stopRecording() })
      navigator.mediaSession.setActionHandler('previoustrack', () => { if (!isListening && !isProcessing) startRecording(); else if (isListening) stopRecording() })
      navigator.mediaSession.setActionHandler('nexttrack', () => { if (!isListening && !isProcessing) startRecording(); else if (isListening) stopRecording() })
      a.play().catch(() => {})
    }
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); if (!isListening && !isProcessing) startRecording() }
    }
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); if (isListening) stopRecording() }
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [isListening, isProcessing, startRecording, stopRecording])

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
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center mt-16" style={{ color: '#6ee7b7' }}>
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
            <p className="text-xl font-medium">Hey, ich bin MOI</p>
            <p className="text-sm mt-2 opacity-70">Tippe einmal und sprich - wie Siri</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xs mx-auto">
              {['Wetter', 'Bilder', 'Rechnen', 'QR-Codes'].map(cap => (
                <span key={cap} className="px-3 py-1 rounded-full text-xs" style={{ background: '#1a2f25', color: '#34d399' }}>{cap}</span>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] rounded-2xl px-4 py-3" style={{
                background: msg.role === 'user' ? '#10b981' : '#0d1f17',
                color: msg.role === 'user' ? '#0a0f0d' : '#ecfdf5'
              }}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.image && <img src={msg.image} alt="Generated" className="mt-2 rounded-lg max-w-full" style={{ maxHeight: '300px' }} />}
                <p className="text-xs opacity-50 mt-1">{msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))
        )}
        {transcript && <div className="text-center animate-pulse" style={{ color: '#6ee7b7' }}>{transcript}</div>}
        {isProcessing && !transcript && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3" style={{ background: '#0d1f17' }}>
              <span className="animate-pulse" style={{ color: '#6ee7b7' }}>MOI denkt...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {isListening && (
        <div className="px-8">
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#1a2f25' }}>
            <div className="h-full rounded-full transition-all duration-75" style={{ width: `${Math.min(100, audioLevel * 2.5)}%`, background: audioLevel > 25 ? '#10b981' : '#34d399' }} />
          </div>
        </div>
      )}

      <div className="p-8 flex justify-center">
        <button
          onClick={toggleRecording}
          disabled={isProcessing}
          className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300"
          style={{
            background: isListening ? '#ef4444' : isProcessing ? '#1a2f25' : 'linear-gradient(135deg, #10b981, #059669)',
            transform: isListening ? 'scale(1.15)' : 'scale(1)',
            boxShadow: isListening ? '0 0 60px rgba(239, 68, 68, 0.7)' : isProcessing ? 'none' : '0 0 40px rgba(16, 185, 129, 0.5)',
            cursor: isProcessing ? 'wait' : 'pointer'
          }}
        >
          {isProcessing ? (
            <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="4"/>
              <path className="opacity-75" fill="#10b981" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : isListening ? (
            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          ) : (
            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          )}
        </button>
      </div>

      <p className="text-center text-sm pb-6" style={{ color: '#34d399' }}>
        {isProcessing ? 'Wird verarbeitet...' : isListening ? 'Hoere zu... (stoppt automatisch)' : 'Einmal tippen zum Sprechen'}
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
