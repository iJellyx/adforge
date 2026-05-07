'use client'
import { useState, useRef, useEffect } from 'react'
import { useWorkspace, Workspace } from '@/lib/workspace-context'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, Check, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchWorkspace, createWorkspace, refreshWorkspaces } = useWorkspace()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  // Inline edit + delete state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<Workspace | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<{
    assets: number; ads: number; folders: number;
    projects: number; concepts: number; generations: number;
  } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Rename a brand_card (the underlying table for the workspaces view).
  async function commitRename(id: string) {
    const trimmed = editingName.trim()
    if (!trimmed) { setEditingId(null); return }
    // Update brand_cards directly (the workspaces view is read-only for UPDATE).
    const { error } = await supabase
      .from('brand_cards')
      .update({ name: trimmed, brand_name: trimmed })
      .eq('id', id)
    setEditingId(null)
    if (error) { console.error('[ws] rename error', error.message); return }
    await refreshWorkspaces()
  }

  // Open delete confirmation, fetching counts so we can show the user
  // exactly what will be removed.
  async function openDelete(ws: Workspace) {
    setDeleteCandidate(ws)
    setDeleteCounts(null)
    // Brands are shared with Split — count both sides so the user sees the
    // full impact before they confirm. Forge tables (items/forged_ads/folders)
    // key off workspace_id; Split tables (projects/concepts/generations) key
    // off brand_card_id (same uuid, just different column name).
    const [assets, ads, folders, projects, concepts, generations] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id),
      supabase.from('forged_ads').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id),
      supabase.from('folders').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('brand_card_id', ws.id),
      supabase.from('concepts').select('id', { count: 'exact', head: true }).eq('brand_card_id', ws.id),
      supabase.from('generations').select('id', { count: 'exact', head: true }).eq('brand_card_id', ws.id),
    ])
    setDeleteCounts({
      assets: assets.count || 0,
      ads: ads.count || 0,
      folders: folders.count || 0,
      projects: projects.count || 0,
      concepts: concepts.count || 0,
      generations: generations.count || 0,
    })
  }

  async function confirmDelete() {
    if (!deleteCandidate) return
    setDeleting(true)
    // Delete the brand_card — FK cascades remove items/ads/folders/concepts/etc.
    const { error } = await supabase.from('brand_cards').delete().eq('id', deleteCandidate.id)
    setDeleting(false)
    if (error) { console.error('[ws] delete error', error.message); alert('Delete failed: ' + error.message); return }
    setDeleteCandidate(null)
    setDeleteCounts(null)
    setOpen(false)
    // If we just deleted the active workspace, the provider's refresh will
    // pick the first remaining brand or bootstrap a fresh one.
    await refreshWorkspaces()
    // Force a soft reload so cached items/ads in tab state get cleared
    window.location.reload()
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleCreate() {
    if (!newName.trim() || saving) return
    setSaving(true)
    const result = await createWorkspace(newName.trim())
    setSaving(false)
    if (result) {
      setNewName('')
      setCreating(false)
      setOpen(false)
      window.location.reload()
    } else {
      alert('Failed to create workspace. Check the browser console for details.')
    }
  }

  async function handleSwitch(ws: Workspace) {
    if (ws.id === activeWorkspace?.id) {
      setOpen(false)
      return
    }
    await switchWorkspace(ws.id)
    setOpen(false)
    window.location.reload()
  }

  if (!activeWorkspace) return null

  const initials = activeWorkspace.name
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger — paper white pill with crisp border, AdSplit feel */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 11px',
          background: 'var(--af-card)',
          border: '1px solid var(--af-border)',
          borderRadius: 9999,
          cursor: 'pointer',
          color: 'var(--af-text)',
          fontSize: 12.5,
          fontWeight: 600,
          transition: 'background 0.15s',
          maxWidth: '100%',
          width: '100%',
          fontFamily: 'inherit',
          letterSpacing: '-0.01em',
        }}
      >
        <div style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          background: 'var(--af-accent)',
          color: 'var(--af-accent-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9,
          fontWeight: 800,
          flexShrink: 0,
          letterSpacing: 0,
        }}>
          {initials}
        </div>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, textAlign: 'left',
        }}>
          {activeWorkspace.name}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          background: 'var(--af-card)',
          border: '1px solid var(--af-border)',
          borderRadius: 14,
          padding: 6,
          zIndex: 300,
          minWidth: 240,
          maxHeight: 360,
          overflowY: 'auto',
          boxShadow: '0 12px 36px rgba(15,15,15,0.12)',
        }}>
          <div style={{
            padding: '8px 10px 6px',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--af-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            Workspaces
          </div>

          {workspaces.map(ws => {
            const isActive = ws.id === activeWorkspace.id
            const isEditing = editingId === ws.id
            const wsInitials = (ws.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div
                key={ws.id}
                onClick={isEditing ? undefined : () => handleSwitch(ws)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 9,
                  cursor: isEditing ? 'default' : 'pointer',
                  background: isActive ? 'var(--af-accent-soft)' : 'transparent',
                  transition: 'background 0.1s',
                  position: 'relative',
                }}
                onMouseOver={e => {
                  if (!isActive && !isEditing) (e.currentTarget as HTMLDivElement).style.background = 'var(--af-surface)'
                  // reveal action icons via data attribute
                  ;(e.currentTarget as HTMLDivElement).dataset.hover = '1'
                }}
                onMouseOut={e => {
                  if (!isActive && !isEditing) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLDivElement).dataset.hover = ''
                }}
              >
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: isActive ? 'var(--af-accent)' : 'var(--af-surface)',
                  color: isActive ? 'var(--af-accent-text)' : 'var(--af-text-secondary)',
                  border: '1px solid ' + (isActive ? 'var(--af-accent)' : 'var(--af-border)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, flexShrink: 0,
                }}>
                  {wsInitials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => commitRename(ws.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(ws.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      style={{
                        width: '100%',
                        background: 'var(--af-surface)',
                        border: '1px solid var(--af-accent)',
                        borderRadius: 6,
                        padding: '3px 7px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--af-text)',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <>
                      <div style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--af-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ws.name || 'Untitled brand'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--af-muted)' }}>
                        {ws.role}
                      </div>
                    </>
                  )}
                </div>
                {!isEditing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <IconBtn
                      title="Rename"
                      onClick={(e) => { e.stopPropagation(); setEditingId(ws.id); setEditingName(ws.name) }}
                      icon={<Pencil size={12} />}
                    />
                    <IconBtn
                      title="Delete"
                      danger
                      onClick={(e) => { e.stopPropagation(); openDelete(ws) }}
                      icon={<Trash2 size={12} />}
                    />
                    {isActive && <Check size={14} color="var(--af-accent)" strokeWidth={3} style={{ marginLeft: 4 }} />}
                  </div>
                )}
              </div>
            )
          })}

          <div style={{ borderTop: '1px solid var(--af-border)', margin: '6px 0' }} />

          {!creating ? (
            <div
              onClick={() => setCreating(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 9,
                cursor: 'pointer',
                color: 'var(--af-text)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
              onMouseOver={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--af-surface)'}
              onMouseOut={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 6,
                background: 'var(--af-surface)',
                color: 'var(--af-text)',
                border: '1px solid var(--af-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Plus size={13} strokeWidth={2.5} />
              </div>
              New workspace
            </div>
          ) : (
            <div style={{ padding: '8px 10px' }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                placeholder="Brand name…"
                autoFocus
                style={{
                  width: '100%',
                  background: 'var(--af-surface)',
                  border: '1px solid var(--af-border)',
                  borderRadius: 8,
                  padding: '8px 11px',
                  color: 'var(--af-text)',
                  fontSize: 12.5,
                  outline: 'none',
                  boxSizing: 'border-box' as const,
                  marginBottom: 7,
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || saving}
                  style={{
                    flex: 1,
                    background: saving ? 'var(--af-surface)' : 'var(--af-accent)',
                    color: saving ? 'var(--af-muted)' : 'var(--af-accent-text)',
                    border: '1px solid var(--af-accent)',
                    borderRadius: 9999,
                    padding: '7px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName('') }}
                  style={{
                    background: 'var(--af-card)',
                    color: 'var(--af-text-secondary)',
                    border: '1px solid var(--af-border)',
                    borderRadius: 9999,
                    padding: '7px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteCandidate && (
        <div
          onClick={() => !deleting && setDeleteCandidate(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, fontFamily: 'inherit',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              background: 'var(--af-card)',
              border: '1px solid var(--af-border)',
              borderRadius: 14,
              padding: 24,
              color: 'var(--af-text)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                width: 32, height: 32, borderRadius: 9999,
                background: 'var(--af-red-soft)',
                color: 'var(--af-red)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><AlertTriangle size={16} /></span>
              <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
                Delete brand?
              </h3>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--af-text-secondary)', lineHeight: 1.55, marginBottom: 14 }}>
              This brand is shared between Forge and Split. Deleting it removes <strong style={{ color: 'var(--af-text)' }}>{deleteCandidate.name || 'Untitled brand'}</strong> from both products.
            </p>
            {deleteCounts ? (
              <>
                {(deleteCounts.assets + deleteCounts.ads + deleteCounts.folders) > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>In Forge</div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13, color: 'var(--af-text-secondary)' }}>
                      <li style={{ padding: '3px 0' }}>· {deleteCounts.assets} {deleteCounts.assets === 1 ? 'asset' : 'assets'} (clips, videos, images)</li>
                      <li style={{ padding: '3px 0' }}>· {deleteCounts.ads} {deleteCounts.ads === 1 ? 'ad' : 'ads'}</li>
                      <li style={{ padding: '3px 0' }}>· {deleteCounts.folders} {deleteCounts.folders === 1 ? 'folder' : 'folders'}</li>
                    </ul>
                  </div>
                )}
                {(deleteCounts.projects + deleteCounts.concepts + deleteCounts.generations) > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>In Split</div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13, color: 'var(--af-text-secondary)' }}>
                      <li style={{ padding: '3px 0' }}>· {deleteCounts.projects} {deleteCounts.projects === 1 ? 'project' : 'projects'}</li>
                      <li style={{ padding: '3px 0' }}>· {deleteCounts.concepts} {deleteCounts.concepts === 1 ? 'concept' : 'concepts'}</li>
                      <li style={{ padding: '3px 0' }}>· {deleteCounts.generations} {deleteCounts.generations === 1 ? 'generation' : 'generations'}</li>
                    </ul>
                  </div>
                )}
                {(deleteCounts.assets + deleteCounts.ads + deleteCounts.folders + deleteCounts.projects + deleteCounts.concepts + deleteCounts.generations) === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--af-text-secondary)', marginBottom: 12 }}>
                    No assets or ads attached. Safe to delete.
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--af-muted)', marginBottom: 12 }}>Counting…</p>
            )}
            <p style={{ fontSize: 12, color: 'var(--af-muted)', marginBottom: 16 }}>
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  flex: 1, padding: '11px 16px',
                  background: 'var(--af-red)',
                  color: '#FFFFFF',
                  border: '1px solid var(--af-red)',
                  borderRadius: 9999,
                  fontSize: 13.5, fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete brand'}
              </button>
              <button
                onClick={() => setDeleteCandidate(null)}
                disabled={deleting}
                style={{
                  padding: '11px 18px',
                  background: 'var(--af-card)',
                  color: 'var(--af-text)',
                  border: '1px solid var(--af-border)',
                  borderRadius: 9999,
                  fontSize: 13.5, fontWeight: 500,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact icon button used inline in workspace rows for rename / delete. */
function IconBtn({ icon, onClick, title, danger }: { icon: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent',
        border: 'none',
        color: danger ? 'var(--af-red)' : 'var(--af-muted)',
        cursor: 'pointer',
        padding: 5,
        borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.65,
        transition: 'opacity 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.opacity = '1'
        ;(e.currentTarget as HTMLButtonElement).style.background = danger ? 'var(--af-red-soft)' : 'var(--af-surface)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.opacity = '0.65'
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      {icon}
    </button>
  )
}
