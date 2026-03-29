'use client'
import { useState, useRef, useEffect } from 'react'
import { useWorkspace, Workspace } from '@/lib/workspace-context'

const C = { bg:"#0a0a0f",surface:"#13131a",card:"#1a1a24",border:"#2a2a3a",accent:"#6c63ff",accentSoft:"#6c63ff22",text:"#f0f0f5",muted:"#7a7a9a",green:"#22c55e",yellow:"#f59e0b",red:"#ef4444" }

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
    await createWorkspace(newName.trim())
    setNewName('')
    setCreating(false)
    setSaving(false)
    setOpen(false)
    window.location.reload()
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
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: open ? 'rgba(91,73,255,0.15)' : 'rgba(255,255,255,0.06)',
          border: '1px solid ' + (open ? 'rgba(91,73,255,0.4)' : 'rgba(255,255,255,0.1)'),
          borderRadius: 8,
          cursor: 'pointer',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          transition: 'all 0.15s',
          maxWidth: 180,
          width: '100%',
          fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: '#7C6FFF',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 800,
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          textAlign: 'left',
        }}>
          {activeWorkspace.name}
        </span>
        <span style={{ fontSize: 7, opacity: 0.4, flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          background: '#181838',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: 6,
          zIndex: 300,
          minWidth: 220,
          maxHeight: 360,
          overflowY: 'auto',
          boxShadow: '0 12px 36px #000a',
        }}>
          <div style={{
            padding: '8px 10px 6px',
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.35)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
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
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isActive ? 'rgba(91,73,255,0.15)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseOver={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)' }}
                onMouseOut={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: isActive ? '#7C6FFF' : 'rgba(255,255,255,0.08)',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 800,
                  flexShrink: 0,
                }}>
                  {wsInitials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 600,
                    fontSize: 12,
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {ws.name}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                    {ws.role}
                  </div>
                </div>
                {isActive && (
                  <div style={{ color: '#7C6FFF', fontSize: 12, fontWeight: 800 }}>✓</div>
                )}
              </div>
            )
          })}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0' }} />

          {!creating ? (
            <div
              onClick={() => setCreating(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                color: '#7C6FFF',
                fontSize: 12,
                fontWeight: 600,
              }}
              onMouseOver={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'}
              onMouseOut={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'rgba(91,73,255,0.15)',
                color: '#7C6FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                fontWeight: 600,
              }}>
                +
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
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(91,73,255,0.4)',
                  borderRadius: 7,
                  padding: '7px 10px',
                  color: '#fff',
                  fontSize: 12,
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
                    background: saving ? 'rgba(255,255,255,0.1)' : '#7C6FFF',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 0',
                    fontSize: 11,
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
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 11,
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
