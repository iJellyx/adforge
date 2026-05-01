'use client'
import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Check, User2, Mic2 } from 'lucide-react'

export type VoiceMeta = {
  id: string
  name: string
  category?: string
  description?: string
  gender?: string
  age?: string
  accent?: string
  preview_url?: string | null
}

type Props = {
  selectedVoiceId: string | null
  onSelect: (voice: VoiceMeta) => void
  /** Compact card grid (auto-fill) by default, or list mode for inspector. */
  layout?: 'grid' | 'list'
}

/**
 * Voice picker with one-tap previews. Fetches the brand's ElevenLabs
 * voices via /api/elevenlabs/voices (each voice ships with a free
 * `preview_url` from ElevenLabs — no extra render cost).
 *
 * Single shared <audio> element so picking a new voice instantly
 * swaps the playback without overlapping clips.
 */
export function VoicePicker({ selectedVoiceId, onSelect, layout = 'grid' }: Props) {
  const [voices, setVoices] = useState<VoiceMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [filter, setFilter] = useState<'all' | 'male' | 'female'>('all')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch('/api/elevenlabs/voices')
      .then(r => r.json())
      .then(d => {
        if (!mounted) return
        if (d.voices?.length) setVoices(d.voices)
        else setError(d.error || 'No voices available')
      })
      .catch(() => mounted && setError('Could not connect to ElevenLabs'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  function togglePreview(voice: VoiceMeta) {
    if (!voice.preview_url) return
    if (playingId === voice.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    const a = new Audio(voice.preview_url)
    audioRef.current = a
    a.addEventListener('ended', () => setPlayingId(null))
    a.addEventListener('error', () => setPlayingId(null))
    a.play().catch(() => setPlayingId(null))
    setPlayingId(voice.id)
  }

  const filtered = voices.filter(v => {
    if (filter === 'all') return true
    return (v.gender || '').toLowerCase() === filter
  })

  const C = {
    bg: 'var(--af-bg)',
    surface: 'var(--af-surface)',
    card: 'var(--af-card)',
    border: 'var(--af-border)',
    text: 'var(--af-text)',
    muted: 'var(--af-text-secondary)',
    accent: 'var(--af-accent)',
    accentSoft: 'var(--af-accent-soft)',
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading voices…</div>
  }
  if (error) {
    return <div style={{ padding: 16, background: 'var(--af-red-soft)', borderRadius: 8, color: 'var(--af-red)', fontSize: 13 }}>⚠ {error}</div>
  }

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['all', 'female', 'male'] as const).map(f => {
          const active = filter === f
          const label = f === 'all' ? 'All voices' : f === 'female' ? 'Female' : 'Male'
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px',
                background: active ? C.accent : 'transparent',
                color: active ? '#fff' : C.muted,
                border: '1px solid ' + (active ? C.accent : C.border),
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: layout === 'list' ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {filtered.map(v => {
          const isSelected = selectedVoiceId === v.id
          const isPlaying = playingId === v.id
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 12,
                background: isSelected ? 'var(--af-accent)' : C.card,
                border: '1.5px solid ' + (isSelected ? 'var(--af-accent)' : C.border),
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: isSelected ? 'var(--af-accent-text)' : C.text,
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.borderColor = 'var(--af-accent)'
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.borderColor = C.border
              }}
            >
              {/* Avatar / play button — inverts to white circle when card is selected */}
              <div
                onClick={e => { e.stopPropagation(); togglePreview(v) }}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: isSelected ? '#FFFFFF' : (isPlaying ? C.accent : 'var(--af-surface)'),
                  border: '1px solid ' + (isSelected ? '#FFFFFF' : (isPlaying ? C.accent : C.border)),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  cursor: v.preview_url ? 'pointer' : 'default',
                  color: isSelected ? 'var(--af-accent)' : (isPlaying ? '#fff' : C.text),
                }}
                title={v.preview_url ? (isPlaying ? 'Pause preview' : 'Play preview') : 'No preview available'}
              >
                {!v.preview_url ? <User2 size={16} /> : isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 2 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
                  {isSelected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                </div>
                <div style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.65)' : C.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[v.gender, v.age, v.accent].filter(Boolean).join(' · ') || v.description || 'Voice'}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {!filtered.length && (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>
          <Mic2 size={20} style={{ marginBottom: 6, opacity: 0.5 }} /><br />
          No voices in this filter.
        </div>
      )}
    </div>
  )
}
