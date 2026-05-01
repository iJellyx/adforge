'use client'
import { useState, useRef, useEffect } from 'react'
import { useWorkspace, Workspace } from '@/lib/workspace-context'
import { ChevronDown, Check, Plus } from 'lucide-react'

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchWorkspace, createWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
            const wsInitials = ws.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div
                key={ws.id}
                onClick={() => handleSwitch(ws)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  background: isActive ? 'var(--af-accent-soft)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseOver={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--af-surface)' }}
                onMouseOut={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
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
                  <div style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: 'var(--af-text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ws.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--af-muted)' }}>
                    {ws.role}
                  </div>
                </div>
                {isActive && <Check size={14} color="var(--af-accent)" strokeWidth={3} />}
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
    </div>
  )
}
