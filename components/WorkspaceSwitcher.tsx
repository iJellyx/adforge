'use client'
import { useState, useRef, useEffect } from 'react'
import { useWorkspace, Workspace } from '@/lib/workspace-context'
import { ChevronUp, ChevronDown, Check, Plus } from 'lucide-react'

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
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-white text-xs font-semibold transition-all duration-150 max-w-[180px] w-full border ${
          open
            ? 'bg-accent-soft border-accent/40'
            : 'bg-white/[0.06] border-white/[0.08] hover:bg-white/10'
        }`}
      >
        <div className="w-[22px] h-[22px] rounded-[5px] bg-accent text-white flex items-center justify-center text-[9px] font-extrabold shrink-0">
          {initials}
        </div>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-left">
          {activeWorkspace.name}
        </span>
        {open
          ? <ChevronUp className="w-3 h-3 opacity-40 shrink-0" />
          : <ChevronDown className="w-3 h-3 opacity-40 shrink-0" />}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 bg-[#1a1a28] border border-white/10 rounded-lg shadow-xl p-1.5 z-[300] min-w-[220px] max-h-[360px] overflow-y-auto mt-1">
          <div className="px-2.5 pt-2 pb-1.5 text-[9px] font-bold text-white/35 uppercase tracking-wider">
            Workspaces
          </div>

          {workspaces.map(ws => {
            const isActive = ws.id === activeWorkspace.id
            const wsInitials = ws.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div
                key={ws.id}
                onClick={() => handleSwitch(ws)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/[0.06]'
                }`}
              >
                <div className={`w-[26px] h-[26px] rounded-md flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                  isActive ? 'bg-accent text-white' : 'bg-white/[0.08] text-white/50'
                }`}>
                  {wsInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-xs overflow-hidden text-ellipsis whitespace-nowrap ${
                    isActive ? 'text-white' : 'text-white/60'
                  }`}>
                    {ws.name}
                  </div>
                  <div className="text-[9px] text-white/30">
                    {ws.role}
                  </div>
                </div>
                {isActive && <Check className="w-3.5 h-3.5 text-accent" />}
              </div>
            )
          })}

          <div className="border-t border-white/[0.08] my-1.5" />

          {!creating ? (
            <div
              onClick={() => setCreating(true)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-accent text-xs font-semibold hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-[26px] h-[26px] rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              New workspace
            </div>
          ) : (
            <div className="px-2.5 py-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                placeholder="Brand name..."
                autoFocus
                className="w-full bg-black/30 border border-accent/40 rounded-[7px] px-2.5 py-[7px] text-white text-xs outline-none mb-[7px]"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || saving}
                  className={`flex-1 text-white border-none rounded-md py-1.5 text-[11px] font-semibold ${
                    saving ? 'bg-white/10 cursor-not-allowed' : 'bg-accent cursor-pointer hover:bg-accent-hover'
                  } transition-colors`}
                >
                  {saving ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="bg-transparent text-white/40 border border-white/10 rounded-md px-2.5 py-1.5 text-[11px] cursor-pointer hover:text-white/60 transition-colors"
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
