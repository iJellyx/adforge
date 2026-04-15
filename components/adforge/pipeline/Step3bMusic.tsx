'use client'
import { useState } from 'react'
import { Music, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react'
import { C } from '../constants'
import { Btn, STitle } from '../ui-primitives'
import { MusicPicker } from '../MusicPicker'

export function Step3bMusic({
  onDecision,
  onBack,
  currentUrl,
  currentName,
}: {
  onDecision: (decision: 'yes' | 'no', url?: string, name?: string) => void
  onBack: () => void
  currentUrl: string | null
  currentName: string | null
}) {
  const [choice, setChoice] = useState<'yes' | 'no' | null>(
    currentUrl ? 'yes' : null
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      <STitle size={24}>Add background music?</STitle>
      <div style={{ fontSize: 14, color: 'var(--af-text-secondary)', marginBottom: 32 }}>
        Music plays under the voiceover at 20% volume to add energy without overpowering.
      </div>

      {/* Two big choice cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <button
          onClick={() => setChoice('yes')}
          style={{
            padding: 24, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            background: choice === 'yes' ? 'var(--af-accent-soft)' : 'var(--af-card)',
            border: '2px solid ' + (choice === 'yes' ? 'var(--af-accent)' : 'var(--af-border)'),
            textAlign: 'left', transition: 'all 0.15s',
          }}
        >
          <Music size={28} color="var(--af-accent)" />
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12, color: 'var(--af-text)' }}>Yes, add music</div>
          <div style={{ fontSize: 12, color: 'var(--af-text-secondary)', marginTop: 4 }}>Energetic backdrop for your ad</div>
        </button>
        <button
          onClick={() => setChoice('no')}
          style={{
            padding: 24, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            background: choice === 'no' ? 'var(--af-accent-soft)' : 'var(--af-card)',
            border: '2px solid ' + (choice === 'no' ? 'var(--af-accent)' : 'var(--af-border)'),
            textAlign: 'left', transition: 'all 0.15s',
          }}
        >
          <VolumeX size={28} color="var(--af-muted)" />
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12, color: 'var(--af-text)' }}>No music</div>
          <div style={{ fontSize: 12, color: 'var(--af-text-secondary)', marginTop: 4 }}>Keep voiceover clean and focused</div>
        </button>
      </div>

      {/* Conditional content */}
      {choice === 'yes' && (
        <MusicPicker
          suggestedMood="Uplifting"
          onSave={(url: string | null, name: string | null) => {
            if (!url) return
            onDecision('yes', url, name || undefined)
          }}
        />
      )}

      {choice === 'no' && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Btn onClick={() => onDecision('no')} style={{ background: 'var(--af-accent)', color: '#fff', padding: '12px 32px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Continue without music <ChevronRight size={16} />
          </Btn>
        </div>
      )}

      {/* Back button */}
      <div style={{ marginTop: 24 }}>
        <Btn onClick={onBack} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChevronLeft size={14} /> Back to Voiceover
        </Btn>
      </div>
    </div>
  )
}
