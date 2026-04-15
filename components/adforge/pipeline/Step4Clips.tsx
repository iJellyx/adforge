'use client'
import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check, AlertTriangle, Film, RefreshCw, Loader2 } from 'lucide-react'
import { C } from '../constants'
import { callClaude, secColor, muxThumb } from '../utils'
import { Btn, Card, Label, STitle, Chip } from '../ui-primitives'
import { ClipPickerModal } from '../ClipPickerModal'
import { TrimEditorModal } from '../TrimEditorModal'
import { StitchedPreview } from '../StitchedPreview'
import type { Item, BrandProfile } from '../types'
import {
  type Brief, type ScriptSection,
  fmtDur,
} from './pipeline-types'

export function Step4Clips({
  brief,
  sections: initialSections,
  items,
  brand,
  workspaceId,
  voiceoverUrl,
  musicUrl,
  onApprove,
  onBack,
}: {
  brief: Brief
  sections: ScriptSection[]
  items: Item[]
  brand: BrandProfile
  workspaceId: string
  voiceoverUrl: string | null
  musicUrl: string | null
  onApprove: (sections: ScriptSection[]) => void
  onBack: () => void
}) {
  const [sections, setSections] = useState<ScriptSection[]>(initialSections)
  const [matching, setMatching] = useState(false)
  const [swapIdx, setSwapIdx] = useState<number | null>(null)
  const [trimItem, setTrimItem] = useState<{ item: Item; sectionIdx: number; requiredDur: number } | null>(null)

  // Auto-match on mount
  useEffect(() => {
    if (sections.some(s => s.selectedClipId)) return // already matched
    autoMatch()
  }, [])

  function classifyClip(item: Item): 'BROLL' | 'TALKING_HEAD' | 'MIXED' {
    const a = item.analysis || {}
    if (a.is_broll === true) return 'BROLL'
    if (a.is_talking_head === true) return 'TALKING_HEAD'
    const tags = (a.scene_tags || []).join(' ').toLowerCase()
    const contentType = (a.content_type || '').toLowerCase()
    const isTH = tags.includes('talking head') || tags.includes('person speaking') || contentType === 'talking head'
    const isBroll = tags.includes('product') || tags.includes('close-up') || tags.includes('demo') || tags.includes('lifestyle') || tags.includes('b-roll') || contentType.includes('product demo')
    return isBroll ? 'BROLL' : isTH ? 'TALKING_HEAD' : 'MIXED'
  }

  async function autoMatch() {
    setMatching(true)
    try {
      const clips = items.filter(i => i.mux_playback_id)
      // With voiceover, prefer non-talking-head clips
      const nonTH = clips.filter(i => classifyClip(i) !== 'TALKING_HEAD')
      const matchPool = voiceoverUrl && nonTH.length >= 4 ? nonTH : clips
      const usedIds = new Set<string>()

      const libSummary = matchPool.map(item => {
        const a = item.analysis || {}
        const clipClass = classifyClip(item)
        return 'ID:' + item.id + '|class:' + clipClass + '|role:' + (a.clip_role || item.clip_role || '') + '|content_type:' + (a.content_type || '') + '|tags:' + (a.scene_tags || []).join(',') + '|summary:' + (a.summary || item.description || '').substring(0, 120) + '|dur:' + (item.duration_seconds || '?') + '|type:' + item.type
      }).join('\n')

      const sectionDesc = sections.map((s, i) => {
        const reqDur = s.actualVoDurationSec || s.targetDurationSec || 3
        return 'Section ' + i + ' [' + s.type + ']: spoken="' + (s.spokenWords || '').substring(0, 120) + '" visual="' + (s.visualDirection || '').substring(0, 60) + '" required_duration=' + reqDur.toFixed(1) + 's'
      }).join('\n')

      const prompt = `You are an expert direct response video editor. Match ONE clip to each script section. Each clip must be long enough for the required duration.\n\nSCRIPT SECTIONS:\n${sectionDesc}\n\nCLIP LIBRARY (${matchPool.length} clips):\n${libSummary}\n\nRULES:\n1. Each section gets exactly 1 clip\n2. The clip duration must be >= the section's required_duration\n3. Match by VISUAL CONTENT\n4. NEVER reuse a clip\n5. STRONGLY prefer BROLL clips when voiceover is present\n6. For each match, provide 2 alternatives\n\nReturn ONLY valid JSON:\n[{"section":0,"best_id":"clip_uuid","alt_ids":["alt1","alt2"],"reason":"why"}]`

      const raw = await callClaude([{ role: 'user', content: prompt }], 1500)
      const matches = JSON.parse(raw.replace(/```json|```/g, '').trim())
      const validIds = new Set(items.map(i => i.id))

      const updated = sections.map((s, i) => {
        const match = matches.find((m: any) => m.section === i)
        if (!match) return { ...s, matchedClipIds: [], selectedClipId: undefined }

        const reqDur = s.actualVoDurationSec || s.targetDurationSec || 3
        const candidates = [match.best_id, ...(match.alt_ids || [])].filter((id: string) => id && validIds.has(id) && !usedIds.has(id))

        // Filter by duration: clip must be long enough
        const durFilteredCandidates = candidates.filter((id: string) => {
          const item = items.find(it => it.id === id)
          return item && (item.duration_seconds || 0) >= reqDur
        })

        // Fallback to any candidate if none are long enough
        const finalCandidates = durFilteredCandidates.length > 0 ? durFilteredCandidates : candidates
        const clipId = finalCandidates[0] || null
        if (clipId) usedIds.add(clipId)

        // Set trim window
        const item = clipId ? items.find(it => it.id === clipId) : null
        const trimStart = item?.start_seconds || 0
        const trimEnd = trimStart + reqDur

        return {
          ...s,
          matchedClipIds: candidates,
          selectedClipId: clipId,
          trimStart,
          trimEnd,
          clipSegments: [{ id: 'seg-' + i + '-0', clipId }],
        }
      })

      setSections(updated)
    } catch (e) {
      console.error('Auto-match failed:', e)
    }
    setMatching(false)
  }

  function openSwap(idx: number) {
    setSwapIdx(idx)
  }

  function handleClipSelect(clipId: string) {
    if (swapIdx === null) return
    const s = sections[swapIdx]
    const reqDur = s.actualVoDurationSec || s.targetDurationSec || 3
    const item = items.find(i => i.id === clipId)
    if (!item) return

    const clipDur = item.duration_seconds || 0
    if (clipDur < reqDur) return // too short, disabled in modal

    const diff = Math.abs(clipDur - reqDur)
    if (diff < 0.1) {
      // Exact match -- instant swap
      const updated = sections.map((sec, i) => i === swapIdx ? {
        ...sec,
        selectedClipId: clipId,
        trimStart: item.start_seconds || 0,
        trimEnd: (item.start_seconds || 0) + reqDur,
        clipSegments: [{ id: 'seg-' + i + '-0', clipId }],
      } : sec)
      setSections(updated)
      setSwapIdx(null)
    } else {
      // Needs trimming -- open TrimEditor with locked duration
      setSwapIdx(null)
      setTrimItem({ item, sectionIdx: swapIdx, requiredDur: reqDur })
    }
  }

  function handleTrimSave(data: { trimStart: number; trimEnd: number }) {
    if (!trimItem) return
    const { sectionIdx } = trimItem
    const updated = sections.map((sec, i) => i === sectionIdx ? {
      ...sec,
      selectedClipId: trimItem.item.id,
      trimStart: data.trimStart,
      trimEnd: data.trimEnd,
      clipSegments: [{ id: 'seg-' + i + '-0', clipId: trimItem.item.id }],
    } : sec)
    setSections(updated)
    setTrimItem(null)
  }

  // Validation
  const allAssigned = sections.every(s => s.selectedClipId)
  const totalClipDur = sections.reduce((sum, s) => sum + ((s.trimEnd || 0) - (s.trimStart || 0)), 0)
  const totalVoDur = sections.reduce((sum, s) => sum + (s.actualVoDurationSec || s.targetDurationSec || 0), 0)
  const durMatch = Math.abs(totalClipDur - totalVoDur) <= 0.5
  const canApprove = allAssigned && durMatch

  return (
    <div style={{ display: 'flex', gap: 24, maxWidth: 1200, margin: '0 auto', padding: '32px 24px', alignItems: 'flex-start' }}>
      {/* Left -- section rows */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <STitle size={22} mb={0}>Assign clips</STitle>
          {matching && <Loader2 size={16} color="var(--af-accent)" style={{ animation: 'spin 1s linear infinite' }} />}
        </div>
        <div style={{ fontSize: 13, color: 'var(--af-text-secondary)', marginBottom: 20 }}>
          Each section needs a clip that matches its voiceover duration. Swap or trim to fit.
        </div>

        {matching && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--af-muted)', fontSize: 13 }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div>AI is matching clips to sections...</div>
          </div>
        )}

        {!matching && sections.map((s, i) => {
          const sc = secColor(s.type)
          const reqDur = s.actualVoDurationSec || s.targetDurationSec || 3
          const currentClip = s.selectedClipId ? items.find(it => it.id === s.selectedClipId) : null
          const clipDur = s.trimEnd && s.trimStart != null ? (s.trimEnd - s.trimStart) : 0

          return (
            <Card key={i} style={{ marginBottom: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Section info */}
              <div style={{ minWidth: 110 }}>
                <Chip label={s.type} color={sc} />
                <div style={{ fontSize: 11, color: 'var(--af-text-secondary)', marginTop: 4 }}>
                  Required: {reqDur.toFixed(1)}s
                </div>
              </div>

              {/* Current clip */}
              <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center' }}>
                {currentClip ? (
                  <>
                    {currentClip.mux_playback_id && (
                      <img src={muxThumb(currentClip.mux_playback_id, currentClip.thumbnail_time || 0)} style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 6 }} alt="" />
                    )}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--af-text)' }}>{currentClip.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--af-text-secondary)' }}>
                        {clipDur.toFixed(1)}s (trim: {(s.trimStart || 0).toFixed(1)}-{(s.trimEnd || 0).toFixed(1)})
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--af-red)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} /> No clip assigned
                  </div>
                )}
              </div>

              {/* Actions */}
              <Btn onClick={() => openSwap(i)} style={{ background: 'var(--af-accent-soft)', color: 'var(--af-accent)', border: '1px solid rgba(139,127,255,0.25)', fontSize: 12, padding: '6px 14px' }}>
                Swap clip
              </Btn>
            </Card>
          )
        })}

        {/* Re-match button */}
        {!matching && (
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <button onClick={autoMatch} style={{ background: 'none', border: '1px solid var(--af-border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--af-text-secondary)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} /> Re-match all clips with AI
            </button>
          </div>
        )}

        {/* Duration summary */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12 }}>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--af-surface)', border: '1px solid var(--af-border)' }}>
            Clip total: <strong>{totalClipDur.toFixed(1)}s</strong>
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--af-surface)', border: '1px solid var(--af-border)' }}>
            VO total: <strong>{totalVoDur.toFixed(1)}s</strong>
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: durMatch ? '#22c55e18' : '#ef444418', border: '1px solid ' + (durMatch ? '#22c55e33' : '#ef444433'), color: durMatch ? 'var(--af-green)' : 'var(--af-red)', fontWeight: 600 }}>
            {durMatch ? 'Synced' : 'Out of sync'}
          </div>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 12 }}>
          <Btn onClick={onBack} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={14} /> Back
          </Btn>
          <div style={{ flex: 1 }} />
          <Btn
            onClick={() => onApprove(sections)}
            disabled={!canApprove}
            style={{ background: canApprove ? 'var(--af-accent)' : 'var(--af-card)', color: canApprove ? '#fff' : 'var(--af-muted)', display: 'flex', alignItems: 'center', gap: 6, padding: '12px 28px', fontSize: 14 }}
          >
            <Check size={14} /> Approve clips <ChevronRight size={14} />
          </Btn>
        </div>
        {!canApprove && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--af-muted)', marginTop: 4 }}>
            {!allAssigned ? 'Assign clips to all sections to continue.' : 'Clip durations must match VO durations (within 0.5s).'}
          </div>
        )}
      </div>

      {/* Right -- preview */}
      <div style={{ flex: 1, minWidth: 0, position: 'sticky', top: 80 }}>
        <StitchedPreview
          sections={sections}
          libraryItems={items}
          voiceoverUrl={voiceoverUrl}
          musicUrl={musicUrl}
          fullWidth
        />
      </div>

      {/* Modals */}
      {swapIdx !== null && (
        <ClipPickerModal
          currentId={sections[swapIdx]?.selectedClipId}
          matchedIds={sections[swapIdx]?.matchedClipIds || []}
          libraryItems={items}
          sectionLabel={sections[swapIdx]?.type || 'Section'}
          requiredDuration={sections[swapIdx]?.actualVoDurationSec || sections[swapIdx]?.targetDurationSec || undefined}
          onSelect={handleClipSelect}
          onClose={() => setSwapIdx(null)}
        />
      )}
      {trimItem && (
        <TrimEditorModal
          item={trimItem.item}
          trimStart={trimItem.item.start_seconds || 0}
          trimEnd={(trimItem.item.start_seconds || 0) + (trimItem.item.duration_seconds || 30)}
          originalDuration={trimItem.item.duration_seconds}
          lockedDuration={trimItem.requiredDur}
          onSave={handleTrimSave}
          onClose={() => setTrimItem(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
