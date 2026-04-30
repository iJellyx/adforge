'use client'
import { useState } from 'react'
import { X, Sparkles, Wand2, Loader2 } from 'lucide-react'
import { STAGES, FORM_CTYPES } from './constants'
import type { Brief } from './pipeline/pipeline-types'
import type { BrandProfile, Product, Item, ForgedAd } from './types'
import { VoicePicker, type VoiceMeta } from './VoicePicker'
import { GenerationFlow } from './GenerationFlow'

const TARGET_LENGTHS = [15, 30, 45, 60, 90]
const WORDS_PER_SECOND = 2.5

type Props = {
  open: boolean
  onClose: () => void
  brand: BrandProfile
  products: Product[]
  items: Item[]
  workspaceId: string
  /** Called after the ad is fully generated. Hands the ad row to the parent so it can switch to AdStudio. */
  onComplete: (ad: ForgedAd) => void
}

/**
 * Single-screen ad brief — replaces the 6-step pipeline funnel.
 * Marketers fill in product, awareness, content type, length, voice, and a
 * one-line custom request, then hit Generate. Everything else (script, VO,
 * music, clip matching) runs in `GenerationFlow` and lands the user
 * directly in `AdStudio`.
 */
export function NewAdModal({ open, onClose, brand, products, items, workspaceId, onComplete }: Props) {
  const [productId, setProductId] = useState(products.length === 1 ? String((products[0] as any).id) : '')
  const [awarenessStage, setAwarenessStage] = useState('problem_aware')
  const [contentType, setContentType] = useState('UGC')
  const [targetLengthSec, setTargetLengthSec] = useState(30)
  const [customerAvatar, setCustomerAvatar] = useState('')
  const [request, setRequest] = useState('')
  const [voice, setVoice] = useState<VoiceMeta | null>(null)
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const savedAvatars = brand?.customer_avatars || []
  const wordBudget = Math.round(targetLengthSec * WORDS_PER_SECOND)

  function buildBrief(): Brief {
    const prod = products.find((x: Product) => String((x as any).id) === String(productId)) || null
    const avatar = savedAvatars.find(a => a.name === customerAvatar)
    return {
      productId,
      productName: prod?.name || 'General',
      awarenessStage,
      contentType,
      targetLengthSec,
      customerAvatar,
      painPoints: avatar?.pains || '',
      desires: avatar?.desires || '',
      objections: avatar?.objections || '',
      request,
    }
  }

  function handleStart() {
    if (!productId) return setError('Pick a product to advertise.')
    if (!voice) return setError('Pick a voice for the voiceover.')
    setError('')
    setGenerating(true)
  }

  if (!open) return null

  // Once generation kicks off the modal swaps to GenerationFlow which runs
  // the whole pipeline server/client-side and hands an `ad` row back.
  if (generating && voice) {
    return (
      <GenerationFlow
        brief={buildBrief()}
        brand={brand}
        products={products}
        items={items}
        workspaceId={workspaceId}
        voice={voice}
        onCancel={() => { setGenerating(false) }}
        onComplete={(ad) => { setGenerating(false); onComplete(ad) }}
      />
    )
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: voicePickerOpen ? 880 : 640,
          maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--af-card)',
          border: '1px solid var(--af-border)',
          borderRadius: 16,
          padding: 28,
          fontFamily: 'inherit',
          color: 'var(--af-text)',
          transition: 'max-width 0.2s',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#8B7FFF,#5B49FF)' }}>
            <Wand2 size={18} color="#fff" strokeWidth={2.5} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>New Ad</div>
            <div style={{ fontSize: 12, color: 'var(--af-text-secondary)' }}>Tell us what you want — we'll write, voice, and assemble it.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--af-text-secondary)', display: 'flex', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Product */}
        <Field label="Product">
          <select
            value={productId}
            onChange={e => setProductId(e.target.value)}
            style={selectStyle}
          >
            <option value="">Choose a product…</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        {/* Awareness stage */}
        <Field label="Awareness Stage">
          <ChipRow
            options={STAGES.map(s => ({ value: s.value, label: s.label, hint: s.desc }))}
            value={awarenessStage}
            onChange={setAwarenessStage}
          />
        </Field>

        {/* Content type */}
        <Field label="Content Type">
          <ChipRow
            options={FORM_CTYPES.map((c: string) => ({ value: c, label: c }))}
            value={contentType}
            onChange={setContentType}
          />
        </Field>

        {/* Length */}
        <Field label="Target Length">
          <div style={{ display: 'flex', gap: 8 }}>
            {TARGET_LENGTHS.map(s => {
              const active = targetLengthSec === s
              return (
                <button
                  key={s}
                  onClick={() => setTargetLengthSec(s)}
                  style={{
                    flex: 1, padding: '14px 8px',
                    background: active ? 'var(--af-accent-soft)' : 'var(--af-surface)',
                    border: '1.5px solid ' + (active ? 'var(--af-accent)' : 'var(--af-border)'),
                    borderRadius: 10,
                    cursor: 'pointer', fontFamily: 'inherit',
                    color: active ? 'var(--af-accent)' : 'var(--af-text)',
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{s}s</div>
                  <div style={{ fontSize: 10, color: 'var(--af-text-secondary)', marginTop: 2 }}>{Math.round(s * WORDS_PER_SECOND)} words</div>
                </button>
              )
            })}
          </div>
        </Field>

        {/* Customer avatar (optional) */}
        {savedAvatars.length > 0 && (
          <Field label="Customer Avatar (optional)">
            <select value={customerAvatar} onChange={e => setCustomerAvatar(e.target.value)} style={selectStyle}>
              <option value="">— No specific avatar —</option>
              {savedAvatars.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </Field>
        )}

        {/* Voice picker */}
        <Field label="Voice">
          {!voicePickerOpen && voice ? (
            <button
              onClick={() => setVoicePickerOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: 12,
                background: 'var(--af-accent-soft)',
                border: '1.5px solid var(--af-accent)',
                borderRadius: 10,
                cursor: 'pointer', textAlign: 'left',
                color: 'var(--af-text)', fontFamily: 'inherit',
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--af-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                {voice.name[0]}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{voice.name}</div>
                <div style={{ fontSize: 11, color: 'var(--af-text-secondary)' }}>{[voice.gender, voice.accent, voice.age].filter(Boolean).join(' · ')}</div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--af-accent)', fontWeight: 600 }}>Change</span>
            </button>
          ) : (
            <div style={{ background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 10, padding: 14 }}>
              <VoicePicker
                selectedVoiceId={voice?.id || null}
                onSelect={v => { setVoice(v); setVoicePickerOpen(false) }}
              />
            </div>
          )}
        </Field>

        {/* Custom request */}
        <Field label="Custom Request (optional)">
          <textarea
            value={request}
            onChange={e => setRequest(e.target.value)}
            placeholder="e.g. Focus on the new formula, mention the 30-day guarantee, keep tone playful…"
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--af-surface)',
              border: '1px solid var(--af-border)',
              borderRadius: 10, padding: '11px 14px',
              color: 'var(--af-text)', fontFamily: 'inherit',
              fontSize: 13, outline: 'none', resize: 'vertical',
            }}
          />
        </Field>

        {error && <div style={{ background: 'var(--af-red-soft)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--af-red)', marginBottom: 14 }}>{error}</div>}

        <button
          onClick={handleStart}
          style={{
            width: '100%', padding: 14,
            background: 'linear-gradient(135deg,#8B7FFF,#5B49FF)',
            color: '#fff', border: 'none', borderRadius: 11,
            fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 8px 20px rgba(91,73,255,0.25)',
            letterSpacing: '-0.005em',
          }}
        >
          <Sparkles size={16} /> Generate Ad
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--af-text-secondary)', marginTop: 12 }}>
          About {wordBudget} words · ~{Math.ceil(targetLengthSec / 60 * 60)} second ad · using <strong>{voice?.name || '(pick a voice)'}</strong>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-text-secondary)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

function ChipRow({ options, value, onChange }: { options: { value: string; label: string; hint?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.hint}
            style={{
              padding: '8px 12px',
              background: active ? 'var(--af-accent-soft)' : 'var(--af-surface)',
              color: active ? 'var(--af-accent)' : 'var(--af-text)',
              border: '1.5px solid ' + (active ? 'var(--af-accent)' : 'var(--af-border)'),
              borderRadius: 99,
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--af-surface)',
  border: '1px solid var(--af-border)',
  borderRadius: 10, padding: '11px 14px',
  color: 'var(--af-text)', fontFamily: 'inherit',
  fontSize: 14, outline: 'none', cursor: 'pointer',
}
