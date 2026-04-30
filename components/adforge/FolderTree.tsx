'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Folder, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash2, ChevronRight } from 'lucide-react'

export type FolderRow = {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  kind: 'library' | 'ads'
  created_at?: string
}

type Props = {
  workspaceId: string
  kind: 'library' | 'ads'
  /** Currently active folder id. `null` = All (root + descendants). `'__root'` = items with no folder. */
  activeFolderId: string | null | '__root'
  onSelect: (folderId: string | null | '__root') => void
  /** Counts by folder id for badge display. Pass `null` count for All / '__root'. */
  counts?: Record<string, number>
  totalCount?: number
  unfiledCount?: number
  /** Called whenever the tree changes (create/rename/delete) so parent can re-fetch counts. */
  onChange?: () => void
  /**
   * If provided, dropping an item on a folder calls this with `(itemId, folderId)`.
   * Folder rows expose `data-folder-drop="<id>"` so external drag sources just need
   * to set `dataTransfer.setData('text/x-adforge-item', itemId)`.
   */
  onDropItem?: (itemId: string, folderId: string | null) => void
}

/**
 * Drive-style nested folder tree. Per-workspace, scoped by `kind`
 * ('library' for items, 'ads' for forged_ads).
 *
 * Rendering: virtual "All" + "Unfiled" rows pinned at top, then the
 * folder forest in alphabetical order at each depth. Click a row to
 * set it as active; the parent component is responsible for filtering
 * its grid to that folder.
 *
 * Drag-and-drop: any element on the page that puts an item id into
 * `dataTransfer` under the key `text/x-adforge-item` can be dropped
 * onto a folder. We swallow the event and call `onDropItem`.
 */
export function FolderTree({
  workspaceId, kind, activeFolderId, onSelect,
  counts = {}, totalCount, unfiledCount,
  onChange, onDropItem,
}: Props) {
  const supabase = createClient()
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [creatingUnder, setCreatingUnder] = useState<string | null | '__none'>(null) // '__none' = creating at root
  const [newName, setNewName] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null | '__root'>(null)

  async function refresh() {
    setLoading(true)
    const { data } = await supabase
      .from('folders')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('kind', kind)
      .order('name')
    setFolders(data || [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [workspaceId, kind])

  // Build parent → children map for fast tree rendering
  const childrenOf = useMemo(() => {
    const map: Record<string, FolderRow[]> = { __root: [] }
    for (const f of folders) {
      const key = f.parent_id || '__root'
      if (!map[key]) map[key] = []
      map[key].push(f)
    }
    return map
  }, [folders])

  async function createFolder(parentId: string | null, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    await supabase.from('folders').insert({
      workspace_id: workspaceId,
      parent_id: parentId,
      name: trimmed,
      kind,
    })
    setCreatingUnder(null)
    setNewName('')
    if (parentId) setExpanded(x => ({ ...x, [parentId]: true }))
    await refresh()
    onChange?.()
  }

  async function renameFolder(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingId(null); return }
    await supabase.from('folders').update({ name: trimmed, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingId(null)
    await refresh()
    onChange?.()
  }

  async function deleteFolder(id: string) {
    if (!confirm('Delete this folder? Items inside will become unfiled. Subfolders are also deleted.')) return
    // Items with this folder_id get folder_id=null automatically (ON DELETE SET NULL).
    // Subfolders cascade-delete via folders_pkey FK ON DELETE CASCADE.
    await supabase.from('folders').delete().eq('id', id)
    if (activeFolderId === id) onSelect(null)
    await refresh()
    onChange?.()
  }

  function handleDragOverRow(e: React.DragEvent, folderId: string | null | '__root') {
    if (!onDropItem) return
    if (!Array.from(e.dataTransfer.types).includes('text/x-adforge-item')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(folderId)
  }

  function handleDrop(e: React.DragEvent, folderId: string | null) {
    if (!onDropItem) return
    e.preventDefault()
    const itemId = e.dataTransfer.getData('text/x-adforge-item')
    setDragOver(null)
    if (itemId) onDropItem(itemId, folderId)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const C = {
    bg: 'var(--af-bg)',
    surface: 'var(--af-surface)',
    border: 'var(--af-border)',
    text: 'var(--af-text)',
    muted: 'var(--af-text-secondary)',
    accent: 'var(--af-accent)',
    accentSoft: 'var(--af-accent-soft)',
  }

  function Row({
    id, name, depth, count, isActive, hasChildren, isOpen, onToggle, onClick,
    folderId, // null for virtual rows
  }: {
    id: string; name: string; depth: number; count?: number;
    isActive: boolean; hasChildren?: boolean; isOpen?: boolean;
    onToggle?: () => void; onClick: () => void;
    folderId: string | null; // for drop target ('__root' uses null)
  }) {
    const isDragOver = dragOver === (id === '__all' ? null : id === '__unfiled' ? '__root' : id)
    return (
      <div
        onDragOver={e => handleDragOverRow(e, id === '__all' ? null : id === '__unfiled' ? '__root' : id)}
        onDragLeave={() => setDragOver(null)}
        onDrop={e => handleDrop(e, folderId)}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', paddingLeft: 8 + depth * 14,
          borderRadius: 8,
          background: isActive ? C.accentSoft : isDragOver ? 'rgba(91,73,255,0.10)' : 'transparent',
          color: isActive ? C.accent : C.text,
          fontSize: 13, fontWeight: isActive ? 600 : 500,
          cursor: 'pointer',
          border: isDragOver ? '1px dashed ' + C.accent : '1px solid transparent',
        }}
      >
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); onToggle?.() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'inherit' }}
          >
            <ChevronRight size={12} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        ) : (
          <span style={{ width: 12 }} />
        )}
        {isOpen ? <FolderOpen size={14} color={isActive ? C.accent : C.muted} /> : <Folder size={14} color={isActive ? C.accent : C.muted} />}
        {editingId === folderId && folderId ? (
          <input
            autoFocus
            value={editingName}
            onChange={e => setEditingName(e.target.value)}
            onBlur={() => renameFolder(folderId, editingName)}
            onKeyDown={e => {
              if (e.key === 'Enter') renameFolder(folderId, editingName)
              if (e.key === 'Escape') setEditingId(null)
            }}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, background: C.bg, border: '1px solid ' + C.accent, borderRadius: 5, padding: '2px 6px', fontSize: 13, color: C.text, outline: 'none' }}
          />
        ) : (
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        )}
        {typeof count === 'number' && (
          <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>{count}</span>
        )}
        {folderId && (
          <button
            onClick={e => { e.stopPropagation(); setMenuFor(menuFor === folderId ? null : folderId) }}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: C.muted, opacity: menuFor === folderId ? 1 : 0.5, display: 'flex' }}
            aria-label="Folder options"
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>
    )
  }

  function renderNode(folder: FolderRow, depth: number): React.ReactNode {
    const kids = childrenOf[folder.id] || []
    const isOpen = expanded[folder.id] !== false ? !!expanded[folder.id] : false
    const isActive = activeFolderId === folder.id
    const count = counts[folder.id]
    return (
      <div key={folder.id} style={{ position: 'relative' }}>
        <Row
          id={folder.id}
          name={folder.name}
          depth={depth}
          count={count}
          isActive={isActive}
          hasChildren={kids.length > 0}
          isOpen={isOpen}
          onToggle={() => setExpanded(x => ({ ...x, [folder.id]: !isOpen }))}
          onClick={() => { setMenuFor(null); onSelect(folder.id) }}
          folderId={folder.id}
        />
        {menuFor === folder.id && (
          <div
            onMouseLeave={() => setMenuFor(null)}
            style={{ position: 'absolute', right: 6, top: 28, zIndex: 10, background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 150 }}
          >
            <MenuItem icon={<FolderPlus size={13} />} label="New subfolder" onClick={() => { setMenuFor(null); setCreatingUnder(folder.id); setNewName('') }} />
            <MenuItem icon={<Pencil size={13} />} label="Rename" onClick={() => { setMenuFor(null); setEditingId(folder.id); setEditingName(folder.name) }} />
            <MenuItem icon={<Trash2 size={13} color="#ef4444" />} label="Delete" onClick={() => { setMenuFor(null); deleteFolder(folder.id) }} danger />
          </div>
        )}
        {creatingUnder === folder.id && (
          <NewFolderInput
            depth={depth + 1}
            value={newName}
            onChange={setNewName}
            onCancel={() => { setCreatingUnder(null); setNewName('') }}
            onCommit={() => createFolder(folder.id, newName)}
          />
        )}
        {isOpen && kids.map(k => renderNode(k, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, padding: 10, borderRight: '1px solid ' + C.border, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px 8px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>
          {kind === 'library' ? 'Folders' : 'Ad Folders'}
        </div>
        <button
          onClick={() => { setCreatingUnder('__none'); setNewName('') }}
          title="New folder at root"
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: C.muted, display: 'flex', borderRadius: 6 }}
          onMouseEnter={e => e.currentTarget.style.background = C.surface}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <FolderPlus size={14} />
        </button>
      </div>

      {/* All */}
      <Row
        id="__all"
        name="All"
        depth={0}
        count={totalCount}
        isActive={activeFolderId === null}
        onClick={() => onSelect(null)}
        folderId={null}
      />
      {/* Unfiled */}
      <Row
        id="__unfiled"
        name="Unfiled"
        depth={0}
        count={unfiledCount}
        isActive={activeFolderId === '__root'}
        onClick={() => onSelect('__root')}
        folderId={null}
      />

      {creatingUnder === '__none' && (
        <NewFolderInput
          depth={0}
          value={newName}
          onChange={setNewName}
          onCancel={() => { setCreatingUnder(null); setNewName('') }}
          onCommit={() => createFolder(null, newName)}
        />
      )}

      <div style={{ height: 1, background: C.border, margin: '8px 4px' }} />

      {loading ? (
        <div style={{ padding: 12, fontSize: 12, color: C.muted }}>Loading folders…</div>
      ) : (childrenOf['__root'] || []).length === 0 && creatingUnder !== '__none' ? (
        <div style={{ padding: 12, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          No folders yet. Click <FolderPlus size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> above to add one.
        </div>
      ) : (
        (childrenOf['__root'] || []).map(f => renderNode(f, 0))
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 10px',
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 13, color: danger ? '#ef4444' : 'var(--af-text)',
        borderRadius: 6, textAlign: 'left', fontFamily: 'inherit',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--af-bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      {icon} {label}
    </button>
  )
}

function NewFolderInput({
  depth, value, onChange, onCancel, onCommit,
}: { depth: number; value: string; onChange: (v: string) => void; onCancel: () => void; onCommit: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', paddingLeft: 8 + depth * 14 }}>
      <span style={{ width: 12 }} />
      <Folder size={14} color="var(--af-accent)" />
      <input
        autoFocus
        placeholder="Folder name"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => value.trim() ? onCommit() : onCancel()}
        onKeyDown={e => {
          if (e.key === 'Enter') onCommit()
          if (e.key === 'Escape') onCancel()
        }}
        style={{ flex: 1, background: 'var(--af-bg)', border: '1px solid var(--af-accent)', borderRadius: 5, padding: '3px 7px', fontSize: 13, color: 'var(--af-text)', outline: 'none', fontFamily: 'inherit' }}
      />
    </div>
  )
}
