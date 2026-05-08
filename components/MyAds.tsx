'use client'
import { useEffect, useState, useMemo } from 'react'
import { Folder, Film, Image as ImageIcon, ChevronRight, ExternalLink } from 'lucide-react'
import { CrossPromoCard } from '@/components/CrossPromoCard'
import { UpsellModal } from '@/components/UpsellModal'
import type { ProductSlug } from '@/lib/access-types'

type Ad = {
  kind: 'video' | 'static'
  id: string
  workspace_id: string
  title: string
  preview_url: string | null
  primary_url: string | null
  media_type: 'video' | 'image'
  folder_id: string | null
  saved_at: string
  awareness_stage: string | null
  status: string
  render_status: string | null
}

type FolderRow = {
  id: string
  name: string
  parent_id: string | null
  is_system: boolean
}

type Props = {
  workspaceId: string
}

/**
 * MyAds — unified view across Forge (video, auto-saved) + Split (saved
 * statics). Folder tree on the left, grid on the right. Filter chips:
 * All / Video / Static.
 *
 * Designed to be embedded as a dashboard tab (no full-page wrapper) so it
 * keeps SPA-style nav. The standalone /my-ads route imports the same
 * component for direct linking from cross-product sidebars.
 */
export function MyAds({ workspaceId }: Props) {
  const [ads, setAds] = useState<Ad[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | 'all'>('all')
  const [kindFilter, setKindFilter] = useState<'all' | 'video' | 'static'>('all')
  const [loading, setLoading] = useState(true)
  const [upsellFor, setUpsellFor] = useState<ProductSlug | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    fetch(`/api/my-ads?workspace_id=${workspaceId}&kind=${kindFilter}`)
      .then(r => r.json())
      .then(data => {
        setAds(data.ads || [])
        setFolders(data.folders || [])
      })
      .finally(() => setLoading(false))
  }, [workspaceId, kindFilter])

  const tree = useMemo(() => {
    const childrenOf: Record<string, FolderRow[]> = { __root: [] }
    for (const f of folders) {
      const key = f.parent_id || '__root'
      if (!childrenOf[key]) childrenOf[key] = []
      childrenOf[key].push(f)
    }
    return childrenOf
  }, [folders])

  function descendantIds(rootId: string): string[] {
    const out: string[] = [rootId]
    const stack = [rootId]
    while (stack.length) {
      const cur = stack.pop()!
      const kids = tree[cur] || []
      for (const k of kids) { out.push(k.id); stack.push(k.id) }
    }
    return out
  }

  const visibleAds = useMemo(() => {
    if (activeFolderId === 'all') return ads
    const ids = new Set(descendantIds(activeFolderId))
    return ads.filter(a => a.folder_id && ids.has(a.folder_id))
  }, [ads, activeFolderId, tree])

  const C = {
    bg: 'var(--af-bg)', card: 'var(--af-card)', border: 'var(--af-border)',
    borderSoft: 'var(--af-border-soft)', text: 'var(--af-text)',
    muted: 'var(--af-text-secondary)', accent: 'var(--af-accent)',
    accentText: 'var(--af-accent-text)',
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)', background: C.bg, color: C.text }}>
      {/* Folder tree */}
      <aside style={{ width: 260, flexShrink: 0, background: 'var(--af-sidebar)', borderRight: '1px solid ' + C.border, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          My Ads
        </div>
        <FolderRowItem
          label="All ads"
          icon={<Film size={14} />}
          active={activeFolderId === 'all'}
          onClick={() => setActiveFolderId('all')}
          count={ads.length}
        />
        <div style={{ height: 1, background: C.borderSoft, margin: '10px 0' }} />
        {(tree['__root'] || []).map(f => (
          <FolderBranch
            key={f.id}
            folder={f}
            tree={tree}
            depth={0}
            ads={ads}
            activeFolderId={activeFolderId}
            onSelect={setActiveFolderId}
          />
        ))}
      </aside>

      <main style={{ flex: 1, padding: 28, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>My Ads</h1>
            <div style={{ fontSize: 13.5, color: C.muted }}>
              All saved ads from Forge and Split, organised in one place.
            </div>
          </div>
          <a
            href="https://adsplit.io/my-ads"
            target="_blank"
            rel="noopener"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted, textDecoration: 'none', padding: '6px 11px', borderRadius: 9999, border: '1px solid ' + C.border, background: C.card }}
          >
            Open in Split <ExternalLink size={11} />
          </a>
        </div>

        {/* Cross-promo: Forge users see a 'add Split' card if they don't have it.
            Auto-hides when has_split is true, and dismissable per-session. */}
        <CrossPromoCard surface="myads-forge" promote="split" onUpsellClick={setUpsellFor} />

        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {(['all', 'video', 'static'] as const).map(k => {
            const active = kindFilter === k
            const label = k === 'all' ? 'All' : k === 'video' ? 'Video' : 'Static'
            return (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                style={{
                  padding: '6px 14px',
                  background: active ? C.accent : 'transparent',
                  color: active ? C.accentText : C.muted,
                  border: '1px solid ' + (active ? C.accent : C.border),
                  borderRadius: 9999,
                  fontSize: 12.5, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div style={{ color: C.muted, fontSize: 13.5 }}>Loading ads…</div>
        ) : visibleAds.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {visibleAds.map(ad => <AdCard key={ad.kind + ':' + ad.id} ad={ad} />)}
          </div>
        )}
      </main>
      <UpsellModal
        open={!!upsellFor}
        product={upsellFor}
        onClose={() => setUpsellFor(null)}
        onUpgrade={(slug) => { console.log('[upsell] from cross-promo:', slug); setUpsellFor(null) }}
      />
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ background: 'var(--af-card)', border: '1px dashed var(--af-border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--af-text-secondary)' }}>
      <Folder size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--af-text)', marginBottom: 6 }}>No saved ads yet</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
        Generate a video ad in Forge, or save a static ad from Split's project board — both will appear here.
      </div>
    </div>
  )
}

function FolderRowItem({ label, icon, active, onClick, count, indent = 0 }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; count?: number; indent?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 10px', paddingLeft: 10 + indent * 14,
        marginBottom: 1,
        background: active ? 'var(--af-sidebar-active)' : 'transparent',
        border: '1px solid ' + (active ? 'var(--af-border)' : 'transparent'),
        borderRadius: 9999,
        color: active ? 'var(--af-text)' : 'var(--af-text-secondary)',
        fontWeight: active ? 600 : 500,
        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left' as const,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as any).style.background = 'var(--af-sidebar-hover)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as any).style.background = 'transparent' }}
    >
      <span style={{ flexShrink: 0, color: active ? 'var(--af-accent)' : 'inherit' }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {typeof count === 'number' && (
        <span style={{ fontSize: 11, color: 'var(--af-muted)' }}>{count}</span>
      )}
    </button>
  )
}

function FolderBranch({ folder, tree, depth, ads, activeFolderId, onSelect }: {
  folder: FolderRow; tree: Record<string, FolderRow[]>; depth: number; ads: Ad[];
  activeFolderId: string | 'all'; onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true)
  const children = tree[folder.id] || []
  function countDescendants(f: FolderRow): number {
    const direct = ads.filter(a => a.folder_id === f.id).length
    const kids = (tree[f.id] || []).reduce((acc, k) => acc + countDescendants(k), 0)
    return direct + kids
  }
  const count = countDescendants(folder)
  const icon = folder.name === 'Video'
    ? <Film size={14} />
    : folder.name === 'Statics'
      ? <ImageIcon size={14} />
      : <Folder size={14} />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {children.length > 0 ? (
          <button
            onClick={() => setExpanded(x => !x)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--af-muted)', display: 'flex', alignItems: 'center' }}
          >
            <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        ) : <span style={{ width: 16 }} />}
        <div style={{ flex: 1 }}>
          <FolderRowItem
            label={folder.name}
            icon={icon}
            active={activeFolderId === folder.id}
            onClick={() => onSelect(folder.id)}
            count={count}
            indent={depth}
          />
        </div>
      </div>
      {expanded && children.map(c => (
        <FolderBranch
          key={c.id}
          folder={c}
          tree={tree}
          depth={depth + 1}
          ads={ads}
          activeFolderId={activeFolderId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function AdCard({ ad }: { ad: Ad }) {
  const KindBadge = ad.kind === 'video' ? Film : ImageIcon
  return (
    <div style={{
      background: 'var(--af-card)',
      border: '1px solid var(--af-border)',
      borderRadius: 14,
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}>
      <div style={{ position: 'relative', aspectRatio: '9/16', background: '#111', overflow: 'hidden' }}>
        {ad.preview_url ? (
          <img src={ad.preview_url} alt={ad.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff5', fontSize: 11 }}>No preview</div>
        )}
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(0,0,0,0.75)', color: '#fff',
          padding: '3px 8px', borderRadius: 99,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
          display: 'flex', alignItems: 'center', gap: 4,
          textTransform: 'uppercase' as const,
        }}>
          <KindBadge size={10} /> {ad.kind}
        </div>
        {ad.awareness_stage && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.65)', color: '#fff',
            padding: '3px 8px', borderRadius: 99,
            fontSize: 9.5, fontWeight: 600,
          }}>
            {ad.awareness_stage.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}
          </div>
        )}
        {ad.kind === 'video' && ad.render_status && ad.render_status !== 'ready' && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
            background: 'rgba(245,158,11,0.95)', color: '#000',
            padding: '4px 8px', borderRadius: 6,
            fontSize: 10, fontWeight: 700, textAlign: 'center' as const,
          }}>
            {ad.render_status === 'rendering' ? '⏳ Rendering…' : ad.render_status}
          </div>
        )}
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ad.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--af-muted)' }}>
          {new Date(ad.saved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}
