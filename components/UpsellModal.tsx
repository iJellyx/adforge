'use client'
import { X, Check, ArrowUpRight, Sparkles } from 'lucide-react'
import { PRODUCT_META, type ProductSlug } from '@/lib/access-types'

type Props = {
  open: boolean
  product: ProductSlug | null
  onClose: () => void
  /** Called when the user clicks "Upgrade" — wire to Stripe checkout in Phase 4. */
  onUpgrade?: (product: ProductSlug) => void
}

// Placeholder pricing — wire to real Stripe price IDs in Phase 4.
const PRICING: Record<ProductSlug, { price: string; cadence: string; bundleSavings?: string }> = {
  forge: { price: '$99', cadence: '/month', bundleSavings: 'Save 20% with the Suite plan' },
  split: { price: '$49', cadence: '/month', bundleSavings: 'Save 20% with the Suite plan' },
  stash: { price: '$29', cadence: '/month' },
}

const FEATURES: Record<ProductSlug, string[]> = {
  forge: [
    '50 AI-generated video ads / month',
    'Auto-clipping, voiceover, and music',
    'Stash included — unlimited brand assets',
    'Direct render to MP4 in 1080p',
  ],
  split: [
    '200 static ad concepts / month',
    'Website crawl + brand intelligence',
    'Avatar-targeted concept generation',
    'One-click Meta / IG export',
  ],
  stash: [
    'Unlimited videos, clips, and images',
    'Drive-style nested folders',
    'AI auto-tagging + smart search',
    'Reusable across Forge and Split',
  ],
}

export function UpsellModal({ open, product, onClose, onUpgrade }: Props) {
  if (!open || !product) return null

  const meta = PRODUCT_META[product]
  const pricing = PRICING[product]
  const features = FEATURES[product]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--af-card)',
          border: '1px solid var(--af-border)',
          borderRadius: 16,
          overflow: 'hidden',
          color: 'var(--af-text)',
        }}
      >
        {/* Header — solid black banner with white sparkle, like AdSplit's CTA pills */}
        <div style={{
          padding: '24px 28px 20px',
          background: 'var(--af-accent)',
          color: 'var(--af-accent-text)',
          position: 'relative',
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'transparent', border: 'none',
              color: 'var(--af-accent-text)', opacity: 0.7,
              cursor: 'pointer', padding: 6, display: 'flex',
              borderRadius: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
          ><X size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Sparkles size={18} strokeWidth={2.5} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
              Add to your plan
            </span>
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {meta.name}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.5, margin: 0 }}>
            {meta.tagline}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: 28 }}>
          <p style={{ fontSize: 14, color: 'var(--af-text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
            {meta.longCopy}
          </p>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 24 }}>
            {features.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', fontSize: 13.5 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 99,
                  background: 'var(--af-green-soft)',
                  border: '1px solid var(--af-green)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Check size={10} color="var(--af-green)" strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          {/* Pricing */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 6,
            paddingTop: 16, borderTop: '1px solid var(--af-border-soft)',
          }}>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>{pricing.price}</span>
            <span style={{ fontSize: 14, color: 'var(--af-text-secondary)' }}>{pricing.cadence}</span>
          </div>
          {pricing.bundleSavings && (
            <div style={{ fontSize: 12, color: 'var(--af-text-secondary)', marginTop: 4 }}>
              {pricing.bundleSavings}
            </div>
          )}

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              onClick={() => onUpgrade?.(product)}
              style={{
                flex: 1, padding: '12px 18px',
                background: 'var(--af-accent)',
                color: 'var(--af-accent-text)',
                border: '1px solid var(--af-accent)',
                borderRadius: 9999,
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <ArrowUpRight size={15} strokeWidth={2.5} /> Upgrade
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '12px 22px',
                background: 'transparent',
                color: 'var(--af-text-secondary)',
                border: '1px solid var(--af-border)',
                borderRadius: 9999,
                fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Not now
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--af-muted)', marginTop: 12, textAlign: 'center' }}>
            Stripe checkout opens in a new tab — your access updates automatically once payment completes.
          </div>
        </div>
      </div>
    </div>
  )
}
