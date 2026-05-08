'use client'
import { useEffect, useState } from 'react'
import { ArrowUpRight, X, Layers, Image as ImageIcon } from 'lucide-react'
import { useAccess } from '@/lib/access-client'
import { PRODUCT_META, type ProductSlug } from '@/lib/access-types'

type Props = {
  /** Where the card is being shown — used in the localStorage key + analytics. */
  surface: string
  /** Product to promote. The card auto-hides if the user already has access. */
  promote: ProductSlug
  onUpsellClick?: (slug: ProductSlug) => void
}

const COPY: Record<ProductSlug, { headline: string; sub: string; bullets: string[] }> = {
  forge: {
    headline: 'Turn this brand into video ads too',
    sub: "You're already running static ads with Split. Forge generates video ads from your own UGC clips using the same brand context.",
    bullets: ['Same brand, same Stash', 'AI-script + voiceover + music + clip-match in one click', '1080p MP4 export'],
  },
  split: {
    headline: 'Run static ads alongside your videos',
    sub: 'Forge handles video. Split generates polished Meta-style static ad funnels from a website crawl. Same brand context.',
    bullets: ['Crawl-driven concept generation', '200+ static variations / month', 'One-click Meta / IG export'],
  },
  stash: {
    headline: 'Organise every brand asset in Stash',
    sub: 'Drive-style folder library for clips, photos, logos, and end-card art — visible to both Forge and Split.',
    bullets: ['Unlimited videos + images', 'AI auto-tag and search', 'Reusable across both products'],
  },
}

const ACCENT_FOR: Record<ProductSlug, string> = {
  forge: 'var(--af-forge)',
  split: 'var(--af-split)',
  stash: 'var(--af-stash)',
}
const ACCENT_SOFT_FOR: Record<ProductSlug, string> = {
  forge: 'var(--af-forge-soft)',
  split: 'var(--af-split-soft)',
  stash: 'var(--af-stash-soft)',
}
const ICON_FOR: Record<ProductSlug, any> = {
  forge: Layers,
  split: Layers,
  stash: ImageIcon,
}

/**
 * Cross-promotion card shown on dashboards when a user has one product
 * but not another. Dismissable, persisted per surface in localStorage so
 * we don't nag.
 */
export function CrossPromoCard({ surface, promote, onUpsellClick }: Props) {
  const { access, loading } = useAccess()
  const [dismissed, setDismissed] = useState<boolean>(false)

  const storageKey = `adforge.crosspromo.${surface}.${promote}`

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === '1') {
        setDismissed(true)
      }
    } catch { /* private mode etc. */ }
  }, [storageKey])

  if (loading) return null

  // Hide if the user already has the product
  const hasIt = (
    (promote === 'forge' && access.hasForge) ||
    (promote === 'split' && access.hasSplit) ||
    (promote === 'stash' && access.hasStash)
  )
  if (hasIt || dismissed) return null

  const meta = PRODUCT_META[promote]
  const copy = COPY[promote]
  const accent = ACCENT_FOR[promote]
  const soft = ACCENT_SOFT_FOR[promote]
  const Icon = ICON_FOR[promote]

  function dismiss() {
    setDismissed(true)
    try { window.localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
  }

  return (
    <div style={{
      position: 'relative',
      background: 'var(--af-card)',
      border: '1px solid var(--af-border)',
      borderRadius: 14,
      padding: 18,
      marginBottom: 18,
      display: 'flex',
      gap: 16,
      alignItems: 'flex-start',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 11,
        background: soft, color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={22} strokeWidth={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {meta.name}
          </span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--af-text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
          {copy.headline}
        </div>
        <div style={{ fontSize: 13, color: 'var(--af-text-secondary)', lineHeight: 1.55, marginBottom: 10 }}>
          {copy.sub}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {copy.bullets.map((b, i) => (
            <li key={i} style={{ fontSize: 11, color: 'var(--af-text-secondary)', background: 'var(--af-surface)', border: '1px solid var(--af-border-soft)', padding: '3px 9px', borderRadius: 99 }}>
              ✓ {b}
            </li>
          ))}
        </ul>
        <button
          onClick={() => onUpsellClick?.(promote)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: accent, color: '#fff',
            border: 'none', borderRadius: 9999,
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Add {meta.name} <ArrowUpRight size={14} strokeWidth={2.5} />
        </button>
      </div>
      <button
        onClick={dismiss}
        title="Dismiss"
        aria-label="Dismiss"
        style={{
          position: 'absolute', top: 10, right: 10,
          background: 'transparent', border: 'none', color: 'var(--af-muted)',
          cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--af-sidebar-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
