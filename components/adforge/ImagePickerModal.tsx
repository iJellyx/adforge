'use client'
import { useEffect, useState } from 'react'
import { X, Image as ImageIcon, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { C } from './constants'
import type { Item } from './types'

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  /** Currently selected image id, if any. */
  selectedId?: string | null
  /** User picked an image — receives the items row. Null = clear selection. */
  onPick: (item: Item | null) => void
  /** Window title — defaults to "Pick an image from your Stash". */
  title?: string
}

/**
 * ImagePickerModal — lets the user browse Stash images for the active
 * brand and pick one. Used by AdStudio's end-card picker; reusable for
 * any future feature that needs to surface a Stash image (logos, B-roll
 * stills, watermarks, etc.).
 *
 * Strategy: query items where workspace_id = brand and type = 'image'.
 * No folder tree (intentional — picker should be quick) but search by
 * title is on the roadmap once tagging lands.
 */
export function ImagePickerModal({ open, onClose, workspaceId, selectedId, onPick, title }: Props) {
  const supabase = createClient()
  const [images, setImages] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    let mounted = true
    setLoading(true)
    supabase
      .from('items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('type', 'image')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (mounted) {
          setImages((data || []) as Item[])
          setLoading(false)
        }
      })
    return () => { mounted = false }
  }, [open, workspaceId])

  if (!open) return null

  const q = search.trim().toLowerCase()
  const filtered = q
    ? images.filter(i => i.title.toLowerCase().includes(q))
    : images

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, maxHeight: '85vh',
          background: 'var(--af-card)',
          border: '1px solid var(--af-border)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--af-border-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--af-text)', letterSpacing: '-0.02em' }}>
              {title || 'Pick an image from your Stash'}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {images.length === 0 ? 'No images uploaded yet — head to Stash → Images.' : `${filtered.length} of ${images.length} images`}
            </div>
          </div>
          <input
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: 'var(--af-text)', outline: 'none', width: 200, fontFamily: 'inherit' }}
          />
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: 6, display: 'flex', borderRadius: 8 }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 50, color: C.muted, fontSize: 13 }}>Loading images…</div>
          ) : images.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50, color: C.muted }}>
              <ImageIcon size={32} style={{ opacity: 0.4, marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--af-text)', marginBottom: 4 }}>
                No images in your Stash
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                Upload some logos, end-card art, or product photos in Stash → Images,<br />
                then come back here to pick one.
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50, color: C.muted, fontSize: 13 }}>
              No images match "{search}".
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {filtered.map(img => {
                const isSelected = selectedId === img.id
                return (
                  <button
                    key={img.id}
                    onClick={() => { onPick(img); onClose() }}
                    style={{
                      position: 'relative',
                      background: 'var(--af-card)',
                      border: '2px solid ' + (isSelected ? 'var(--af-accent)' : 'var(--af-border)'),
                      borderRadius: 10,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      padding: 0,
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, transform 0.15s',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--af-accent)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--af-border)' }}
                  >
                    <div style={{ position: 'relative', paddingTop: '100%', background: '#f3f0e8' }}>
                      {img.src_url ? (
                        <img src={img.src_url} alt={img.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : null}
                      {isSelected && (
                        <div style={{ position: 'absolute', top: 6, right: 6, background: 'var(--af-accent)', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={13} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '6px 8px', textAlign: 'left' as const }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--af-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {img.title}
                      </div>
                      {img.width && img.height && (
                        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{img.width}×{img.height}</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedId && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--af-border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted }}>An image is currently selected</span>
            <button
              onClick={() => { onPick(null); onClose() }}
              style={{ background: 'transparent', color: 'var(--af-red)', border: '1px solid var(--af-red)', borderRadius: 9999, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Remove end card
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
