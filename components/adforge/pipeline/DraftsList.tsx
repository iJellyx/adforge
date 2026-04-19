'use client'
import { useEffect, useState } from 'react'
import { FileText, Trash2, PlayCircle } from 'lucide-react'
import { STAGES, STAGE_COLORS } from '../constants'
import { secColor } from '../utils'
import { STitle, Chip } from '../ui-primitives'
import type { PipelineState, StepId } from './pipeline-types'
import { STEPS } from './pipeline-types'

/**
 * A saved script entry — persisted after the user clicks "Save script and exit"
 * in Step 2. Not the same as the auto-saved in-progress draft.
 */
export type SavedScriptEntry = {
  id: string
  createdAt: string  // ISO
  title?: string
  state: PipelineState
}

const scriptsKey = (workspaceId: string) => `adforge.pipeline.scripts.${workspaceId}`

export function loadSavedScripts(workspaceId: string): SavedScriptEntry[] {
  try {
    const raw = localStorage.getItem(scriptsKey(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function saveScriptEntry(workspaceId: string, entry: SavedScriptEntry) {
  const list = loadSavedScripts(workspaceId)
  // Dedupe by id
  const next = [entry, ...list.filter(e => e.id !== entry.id)]
  try { localStorage.setItem(scriptsKey(workspaceId), JSON.stringify(next)) } catch {}
}

export function deleteScriptEntry(workspaceId: string, id: string) {
  const list = loadSavedScripts(workspaceId).filter(e => e.id !== id)
  try { localStorage.setItem(scriptsKey(workspaceId), JSON.stringify(list)) } catch {}
}

export function DraftsList({
  workspaceId,
  onResume,
  refreshKey,
}: {
  workspaceId: string
  onResume: (state: PipelineState) => void
  refreshKey?: number  // bump to force reload
}) {
  const [drafts, setDrafts] = useState<SavedScriptEntry[]>([])

  useEffect(() => {
    setDrafts(loadSavedScripts(workspaceId))
  }, [workspaceId, refreshKey])

  function handleDelete(id: string) {
    if (!confirm('Delete this saved script? This cannot be undone.')) return
    deleteScriptEntry(workspaceId, id)
    setDrafts(loadSavedScripts(workspaceId))
  }

  if (drafts.length === 0) return null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <STitle size={15} mb={0}>Saved scripts</STitle>
        <span style={{ fontSize: 12, color: 'var(--af-muted)' }}>Pick up where you left off ({drafts.length})</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {drafts.map(d => {
          const st = d.state
          const stepLabel = STEPS.find(s => s.id === st.currentStep)?.label || st.currentStep
          const stageLabel = STAGES.find(s => s.value === st.brief?.awarenessStage)?.label || st.brief?.awarenessStage || ''
          const stageColor = st.brief?.awarenessStage ? (STAGE_COLORS[st.brief.awarenessStage] || 'var(--af-accent)') : 'var(--af-accent)'
          const title = d.title || `${st.brief?.productName || 'Untitled'}${stageLabel ? ` · ${stageLabel}` : ''}`
          const sectionTypes = (st.script.sections || []).map(s => s.type)
          return (
            <div
              key={d.id}
              style={{
                background: 'var(--af-card)',
                border: '1px solid var(--af-border)',
                borderRadius: 12,
                padding: 14,
                display: 'flex', flexDirection: 'column', gap: 10,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <FileText size={16} color="var(--af-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--af-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--af-muted)', marginTop: 2 }}>
                    Saved {new Date(d.createdAt).toLocaleDateString()} · At {stepLabel}
                  </div>
                </div>
              </div>

              {sectionTypes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {sectionTypes.slice(0, 6).map((t, i) => {
                    const sc = secColor(t)
                    return <Chip key={i} label={t} color={sc} />
                  })}
                  {sectionTypes.length > 6 && <span style={{ fontSize: 10, color: 'var(--af-muted)', alignSelf: 'center' }}>+{sectionTypes.length - 6}</span>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <button
                  onClick={() => onResume(d.state)}
                  style={{
                    flex: 1, background: 'var(--af-accent)', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  <PlayCircle size={12} /> Resume
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  title="Delete saved script"
                  style={{
                    background: 'none', border: '1px solid var(--af-border)',
                    color: 'var(--af-text-secondary)', borderRadius: 8, padding: '7px 10px',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
