'use client'
import type { Item } from './types'
import { muxThumb, secColor, fmt } from './utils'
import { HelpCircle } from 'lucide-react'

type Section = {
  id?: string
  type: string
  selectedClipId?: string
  clipSegments?: any[]
  spokenWords?: string
  targetDuration?: number
}

function getSectionDuration(section: Section, libraryItems: Item[]): number {
  const segs = section.clipSegments && section.clipSegments.length > 0
    ? section.clipSegments
    : [{ clipId: section.selectedClipId }]
  let total = 0
  for (const seg of segs) {
    if (!seg.clipId) continue
    const item = libraryItems.find((i: Item) => i.id === seg.clipId)
    if (!item) continue
    const start = seg.trimStart ?? item.start_seconds ?? 0
    const end = seg.trimEnd ?? item.end_seconds ?? (start + (item.duration_seconds || 3))
    total += Math.max(0, end - start)
  }
  return total
}

function getThumbUrl(section: Section, libraryItems: Item[]): string | null {
  const clipId = section.selectedClipId || section.clipSegments?.[0]?.clipId
  if (!clipId) return null
  const item = libraryItems.find((i: Item) => i.id === clipId)
  if (!item?.mux_playback_id) return null
  const time = item.thumbnail_time ?? item.start_seconds ?? 0
  return muxThumb(item.mux_playback_id, time)
}

export function SectionsRail({
  sections,
  libraryItems,
  activeIdx,
  currentlyPlayingIdx,
  onSelectSection,
}: {
  sections: Section[]
  libraryItems: Item[]
  activeIdx: number
  currentlyPlayingIdx?: number
  onSelectSection: (idx: number) => void
}) {
  if (!sections || sections.length === 0) {
    return (
      <div style={{
        borderTop: '1px solid var(--af-border)',
        padding: '20px 16px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--af-muted)',
      }}>
        No sections yet
      </div>
    )
  }

  return (
    <div style={{
      borderTop: '1px solid var(--af-border)',
      background: 'transparent',
      padding: '12px 12px 16px',
      // Prevent the rail from being squashed when the canvas column runs
      // out of vertical space — without flexShrink:0 the rail collapses
      // into nothing and the cards clip.
      flexShrink: 0,
      minHeight: 138,
      overflowX: 'auto',
      overflowY: 'hidden',
      display: 'flex',
      gap: 10,
      scrollbarWidth: 'thin',
    }}>
      {sections.map((s, i) => {
        const sc = secColor(s.type)
        const dur = getSectionDuration(s, libraryItems)
        const thumb = getThumbUrl(s, libraryItems)
        const isActive = activeIdx === i
        const isPlaying = currentlyPlayingIdx === i
        const hasClip = !!(s.selectedClipId || s.clipSegments?.some((seg: any) => seg.clipId))

        let borderColor = 'var(--af-border)'
        let boxShadow = 'none'
        if (isActive) {
          borderColor = 'var(--af-accent)'
          boxShadow = '0 0 0 3px var(--af-accent-soft)'
        }

        return (
          <div
            key={s.id || i}
            onClick={() => onSelectSection(i)}
            style={{
              flexShrink: 0,
              width: 140,
              borderRadius: 10,
              border: `2px solid ${borderColor}`,
              boxShadow,
              cursor: 'pointer',
              overflow: 'hidden',
              transition: 'transform 0.12s, border-color 0.15s, box-shadow 0.15s',
              background: 'var(--af-card)',
              animation: isPlaying ? 'af-rail-pulse 1.2s ease-in-out infinite' : undefined,
            }}
            onMouseEnter={e => {
              if (!isActive) (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
            }}
          >
            {/* Thumbnail area */}
            <div style={{
              position: 'relative',
              width: '100%',
              height: 66,
              background: hasClip && thumb
                ? `url(${thumb}) center/cover no-repeat`
                : 'var(--af-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {!hasClip && (
                <HelpCircle size={24} style={{ color: 'var(--af-muted)', opacity: 0.5 }} />
              )}

              {/* Section type badge - top left */}
              <span style={{
                position: 'absolute',
                top: 4,
                left: 4,
                background: sc.bg,
                color: sc.color,
                fontSize: 8,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                lineHeight: 1.3,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}>
                {s.type}
              </span>

              {/* Duration badge - bottom right */}
              {dur > 0 && (
                <span style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '2px 5px',
                  borderRadius: 4,
                  lineHeight: 1.3,
                }}>
                  {fmt(dur)}
                </span>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '6px 8px',
              height: 28,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--af-text)',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {s.type}
              </div>
              <div style={{
                fontSize: 9,
                color: 'var(--af-muted)',
                lineHeight: 1.2,
              }}>
                {dur > 0 ? fmt(dur) : 'No clip'}
              </div>
            </div>
          </div>
        )
      })}

      {/* Pulse animation keyframes injected once */}
      <style>{`
        @keyframes af-rail-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
