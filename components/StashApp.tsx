'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useAccess } from '@/lib/access-client'
import { useClerk } from '@clerk/nextjs'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import { UpsellModal } from '@/components/UpsellModal'
import type { ProductSlug } from '@/lib/access-types'
import { Lock, Layers, Image as ImageIcon, Video, LogOut } from 'lucide-react'
import type { Item, BrandProfile, Product } from './adforge/types'
import { C, DEFAULT_BRAND } from './adforge/constants'
import { LibraryTab } from './adforge/tabs/LibraryTab'

/**
 * StashApp — standalone Stash shell for stash.adsplit.io.
 *
 * Renders only the LibraryTab (Stash UI), wrapped in a slim sidebar with
 * the cross-product switcher so users can jump back to Forge or Split.
 * Everything else (script writing, brand editing, my-ads) is intentionally
 * absent — Stash is the brand's content library, full stop.
 *
 * Auth, workspace, and Supabase data flow are identical to AdForgeApp; we
 * just don't load scripts / forged_ads since Stash doesn't need them.
 */
export default function StashApp() {
  const supabase = createClient()
  const { activeWorkspace, loading: wsLoading } = useWorkspace()
  const { access } = useAccess()
  const { signOut } = useClerk()
  const [upsellFor, setUpsellFor] = useState<ProductSlug | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [brand, setBrand] = useState<BrandProfile>({ ...DEFAULT_BRAND })
  const [products, setProducts] = useState<Product[]>([])
  const [libView, setLibView] = useState<string>('grid')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!activeWorkspace) return
    const wsId = activeWorkspace.id
    const [itemsRes, brandRes, productsRes] = await Promise.all([
      supabase.from('items').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }),
      supabase.from('brand_profile').select('*').eq('workspace_id', wsId).limit(1).single(),
      supabase.from('products').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }),
    ])
    if (itemsRes.data) setItems(itemsRes.data)
    if (brandRes.data) setBrand(brandRes.data)
    else setBrand({ ...DEFAULT_BRAND })
    if (productsRes.data) setProducts(productsRes.data)
    setLoading(false)
  }, [activeWorkspace])

  useEffect(() => { if (activeWorkspace) loadData() }, [loadData, activeWorkspace])

  // Realtime: re-pull items on insert/update/delete so uploads + analyses
  // stream in without a manual refresh.
  useEffect(() => {
    if (!activeWorkspace) return
    const channel = supabase
      .channel('stash-items-' + activeWorkspace.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `workspace_id=eq.${activeWorkspace.id}` },
        () => loadData(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData, activeWorkspace])

  async function handleSignOut() { await signOut({ redirectUrl: '/sign-in' }) }

  if (loading || wsLoading || !activeWorkspace) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--af-stash)', marginBottom: 8, letterSpacing: '-0.02em' }}>Stash</div>
          <div style={{ fontSize: 13, color: C.muted }}>Loading your library…</div>
        </div>
      </div>
    )
  }

  // Cross-product nav row (same shape as AdForgeApp's productNavItem)
  const productNavItem = ({ slug, label, Icon, active, unlocked, externalUrl, onClickIfUnlocked }: {
    slug: ProductSlug; label: string; Icon: any; active: boolean; unlocked: boolean;
    externalUrl?: string; onClickIfUnlocked?: () => void;
  }) => {
    const handleClick = () => {
      if (!unlocked) { setUpsellFor(slug); return }
      if (externalUrl) { window.open(externalUrl, '_blank', 'noopener'); return }
      onClickIfUnlocked?.()
    }
    const productColor = `var(--af-${slug})`
    const productSoft = `var(--af-${slug}-soft)`
    return (
      <button
        key={'product-' + slug}
        onClick={handleClick}
        title={unlocked ? (active ? label + ' (current)' : label) : 'Unlock ' + label}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px', margin: '1px 10px',
          borderRadius: 9999,
          border: '1px solid ' + (active ? productColor : 'transparent'),
          background: active ? productSoft : 'transparent',
          color: !unlocked ? 'var(--af-muted)' : (active ? productColor : 'var(--af-sidebar-text)'),
          fontWeight: active ? 700 : 500,
          fontSize: 13.5, cursor: 'pointer',
          width: 'calc(100% - 20px)',
          textAlign: 'left' as const, fontFamily: 'inherit',
          transition: 'all 0.15s ease', letterSpacing: '-0.01em',
          opacity: unlocked ? 1 : 0.6,
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as any).style.background = 'var(--af-sidebar-hover)' }}
        onMouseLeave={e => { if (!active) (e.currentTarget as any).style.background = 'transparent' }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 6,
          background: productSoft, color: productColor, flexShrink: 0,
          opacity: unlocked ? 1 : 0.6,
        }}>
          <Icon size={12} strokeWidth={2.4} />
        </span>
        <span style={{ flex: 1 }}>{label}</span>
        {!unlocked && <Lock size={11} strokeWidth={2.2} style={{ opacity: 0.55 }} />}
        {externalUrl && unlocked && <span style={{ fontSize: 10, opacity: 0.5 }}>↗</span>}
      </button>
    )
  }

  const navSection = (label: string) => (
    <div style={{ padding: '14px 22px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--af-sidebar-section-label)' }}>
      {label}
    </div>
  )

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',system-ui,sans-serif", color: C.text, display: 'flex' }}>
      {/* Sidebar */}
      <div style={{ width: 232, background: 'var(--af-sidebar)', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, flexShrink: 0, borderRight: '1px solid var(--af-border)' }}>
        <div style={{ padding: '22px 20px 16px' }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--af-text)', letterSpacing: '-0.03em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: 'var(--af-stash)', color: '#fff' }}>
              <ImageIcon size={14} strokeWidth={2.5} />
            </span>
            stash
          </div>
          <WorkspaceSwitcher />
        </div>

        <div style={{ padding: '4px 0 16px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {navSection('Products')}
          {productNavItem({ slug: 'forge', label: 'Forge', Icon: Video, active: false, unlocked: access.hasForge, externalUrl: 'https://forge.adsplit.io' })}
          {productNavItem({ slug: 'split', label: 'Split', Icon: Layers, active: false, unlocked: access.hasSplit, externalUrl: 'https://adsplit.io' })}
          {productNavItem({ slug: 'stash', label: 'Stash', Icon: ImageIcon, active: true, unlocked: true })}
        </div>

        <div style={{ padding: 14, borderTop: '1px solid var(--af-border)' }}>
          <button
            onClick={handleSignOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 10px', borderRadius: 9999,
              border: '1px solid transparent', background: 'transparent',
              color: 'var(--af-muted)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
            }}
            onMouseEnter={e => { (e.currentTarget as any).style.background = 'var(--af-sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as any).style.background = 'transparent' }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      {/* Main column */}
      <div style={{ marginLeft: 232, flex: 1, minWidth: 0 }}>
        <LibraryTab
          items={items}
          onRefresh={loadData}
          view={libView}
          setView={setLibView}
          brand={brand}
          products={products}
          onGoToBrand={() => { window.open('https://forge.adsplit.io/dashboard', '_blank', 'noopener') }}
          workspaceId={activeWorkspace.id}
        />
      </div>

      <UpsellModal
        open={upsellFor !== null}
        product={upsellFor}
        onClose={() => setUpsellFor(null)}
      />
    </div>
  )
}
