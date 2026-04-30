'use client'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, Save, Scissors, Play, Pause, RotateCcw, Tag, Loader2, Sparkles } from 'lucide-react'
import { C, CLIP_ROLES } from './constants'
import { fmt, muxThumb, toNum, fx, secColor, callClaude } from './utils'
import { Btn, Label, Input } from './ui-primitives'
import { createClient } from '@/lib/supabase/client'
import { TagEditor } from './TagEditor'
import type { Item } from './types'

/**
 * ManualClipModal
 *
 * Lets a user carve a custom sub-clip out of an original video. Free-trim
 * (not locked-duration). Captures title, optional clip_role, optional manual
 * tags. Optionally runs AI analysis on the saved clip to populate scene_tags
 * and a content summary.
 *
 * The clip is inserted as a new `items` row with type='clip', parent_id =
 * original.id, and added to the parent's clip_ids array. clip_status is set
 * to 'approved' since the user picked it deliberately — no review needed.
 */
export function ManualClipModal({
  original,
  workspaceId,
  onSave,
  onClose,
}: {
  original: Item
  workspaceId: string
  onSave: (newClip: Item) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const fullDur = useMemo(() => toNum(original.duration_seconds, 30), [original])

  const [inPt, setInPt] = useState(0)
  const [outPt, setOutPt] = useState(Math.min(3, fullDur))
  const [curTime, setCurTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [drag, setDrag] = useState<'in' | 'out' | null>(null)
  const [title, setTitle] = useState('')
  const [clipRole, setClipRole] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [aiAssist, setAiAssist] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vidRef = useRef<HTMLVideoElement>(null)
  const tlRef = useRef<HTMLDivElement>(null)

  // Default title when modal opens
  useEffect(() => {
    if (!title) setTitle(`${original.title} — Custom clip`)
  }, [original.title])

  // Load video src + initial seek
  useEffect(() => {
    const v = vidRef.current
    if (!v || !original.mux_playback_id) return
    v.src = `https://stream.mux.com/${original.mux_playback_id}/capped-1080p.mp4`
    const onMeta = () => { if (v) v.currentTime = 0 }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    return () => v.removeEventListener('loadedmetadata', onMeta)
  }, [original.mux_playback_id])

  // Auto-pause at out-point during playback
  useEffect(() => {
    const v = vidRef.current; if (!v) return
    function onUpdate() {
      if (!v) return
      setCurTime(v.currentTime)
      if (v.currentTime >= outPt) { v.pause(); v.currentTime = inPt; setPlaying(false) }
    }
    v.addEventListener('timeupdate', onUpdate)
    return () => v.removeEventListener('timeupdate', onUpdate)
  }, [inPt, outPt])

  function seekTo(t: number) {
    const v = vidRef.current; if (!v) return
    const c = Math.max(0, Math.min(fullDur, t))
    v.currentTime = c
    setCurTime(c)
  }
  function togglePlay() {
    const v = vidRef.current; if (!v) return
    if (playing) { v.pause(); setPlaying(false) }
    else {
      if (v.currentTime >= outPt || v.currentTime < inPt) v.currentTime = inPt
      v.play().catch(() => {})
      setPlaying(true)
    }
  }

  // Timeline scrub + drag handles
  function getPctFromX(e: MouseEvent | React.MouseEvent): number {
    const rect = tlRef.current?.getBoundingClientRect(); if (!rect) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }
  function onTlDown(e: React.MouseEvent) {
    const pct = getPctFromX(e); const t = pct * fullDur
    const inDist = Math.abs(pct - inPt / fullDur)
    const outDist = Math.abs(pct - outPt / fullDur)
    if (inDist < 0.05 && inDist <= outDist) setDrag('in')
    else if (outDist < 0.05) setDrag('out')
    else seekTo(t)
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!drag) return
      const pct = getPctFromX(e); const t = pct * fullDur
      if (drag === 'in') {
        const v = Math.max(0, Math.min(t, outPt - 0.5))
        setInPt(v); seekTo(v)
      } else {
        const v = Math.min(fullDur, Math.max(t, inPt + 0.5))
        setOutPt(v); seekTo(v)
      }
    }
    function onUp() { setDrag(null) }
    if (drag) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, inPt, outPt, fullDur])

  const inPct = (inPt / fullDur) * 100
  const outPct = (outPt / fullDur) * 100
  const curPct = (curTime / fullDur) * 100
  const selDur = outPt - inPt
  const thumbCount = 12

  async function handleSave() {
    setError(null)
    if (selDur < 0.5) { setError('Clip is too short. Make it at least 0.5 seconds.'); return }
    if (!title.trim()) { setError('Give the clip a title.'); return }

    setSaving(true)

    // Optionally extract transcript snippet from parent's word_timestamps
    let segTranscript: string | undefined
    const parentWordTs = (original as any).word_timestamps as Array<{ word: string; start: number; end: number; punctuated_word?: string }> | undefined
    if (parentWordTs?.length) {
      segTranscript = parentWordTs
        .filter(w => w.start >= inPt && w.end <= outPt)
        .map(w => w.punctuated_word || w.word)
        .join(' ')
    }

    // Optionally ask Claude for scene tags + a short summary based on the
    // surrounding transcript context. Cheap, fast, makes the clip findable.
    let aiTags: string[] = []
    let aiSummary: string | undefined
    if (aiAssist && segTranscript) {
      try {
        const prompt = `You are tagging a video clip for a DTC ad library. Return ONLY valid JSON: {"scene_tags":["..."],"summary":"1 sentence"}.

Source video title: ${original.title}
Clip transcript: "${segTranscript}"
Clip duration: ${selDur.toFixed(1)}s
${clipRole ? `Intended role: ${clipRole}` : ''}

Generate 5-8 specific, searchable scene_tags (e.g. "woman applying serum", "yellow teeth close-up") and a one-sentence summary of the clip's content.`
        const raw = await callClaude([{ role: 'user', content: prompt }], 400)
        const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
        if (Array.isArray(data.scene_tags)) aiTags = data.scene_tags.filter((t: any) => typeof t === 'string')
        if (typeof data.summary === 'string') aiSummary = data.summary
      } catch (e) {
        // Non-blocking — clip still saves without AI tags
        console.warn('[ManualClip] AI assist failed, saving without:', (e as any)?.message)
      }
    }

    // Combine user tags + AI tags, deduped
    const finalTags = Array.from(new Set([...tags, ...aiTags]))

    const newClip = {
      type: 'clip' as const,
      parent_id: original.id,
      title: title.trim(),
      creator: original.creator,
      creator_age: original.creator_age,
      creator_gender: original.creator_gender,
      mux_playback_id: original.mux_playback_id,
      mux_status: 'ready',
      start_seconds: inPt,
      end_seconds: outPt,
      thumbnail_time: inPt + selDur / 2,
      duration_seconds: selDur,
      transcript: segTranscript || undefined,
      clip_role: clipRole,
      clip_status: 'approved',     // user-curated → no review needed
      workspace_id: workspaceId,
      analysis: {
        content_type: original.analysis?.content_type || 'Other',
        creative_tags: original.analysis?.creative_tags?.slice(0, 4) || [],
        is_talking_head: original.analysis?.is_talking_head || false,
        is_broll: original.analysis?.is_broll || false,
        summary: aiSummary || `Manually created clip from ${original.title}`,
        scene_tags: finalTags,
        clip_role: clipRole,
        quality_score: 'High',     // user picked it, treat as high quality
        parent_title: original.title,
        creator_context: original.creator || null,
        manually_created: true,
        manually_created_at: new Date().toISOString(),
      },
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('items')
      .insert(newClip)
      .select()
      .single()

    if (insertErr) {
      console.error('[ManualClip] insert failed:', insertErr)
      setError('Save failed: ' + insertErr.message)
      setSaving(false)
      return
    }

    // Add to parent's clip_ids
    const newClipIds = [...(original.clip_ids || []), inserted.id]
    await supabase.from('items').update({ clip_ids: newClipIds }).eq('id', original.id)

    setSaving(false)
    onSave(inserted as Item)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 18, width: '100%', maxWidth: 980, maxHeight: '92vh', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--af-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Scissors size={18} color="var(--af-accent)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--af-text)' }}>Create custom clip</div>
            <div style={{ fontSize: 11, color: 'var(--af-text-secondary)', marginTop: 2 }}>From: {original.title}</div>
          </div>
          <div style={{ background: 'var(--af-accent-soft)', color: 'var(--af-accent)', padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            {fx(selDur, 1)}s selected
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', fontFamily: 'inherit' }}>
            <X size={14} />
          </button>
        </div>

        {/* Video + timeline */}
        <div style={{ background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: 360, overflow: 'hidden' }}>
          <video ref={vidRef} playsInline preload="auto" style={{ maxHeight: 360, width: '100%', objectFit: 'contain', display: 'block', cursor: 'pointer' }} onClick={togglePlay} />
          {!playing && (
            <div onClick={togglePlay} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Play size={26} fill="#fff" />
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 10, right: 12, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5 }}>
            {fx(curTime, 1)}s / {fx(fullDur, 1)}s
          </div>
        </div>

        {/* Trim timeline */}
        <div style={{ padding: '14px 20px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--af-text-secondary)', marginBottom: 6 }}>
            <span style={{ color: 'var(--af-green)', fontWeight: 700 }}>Start: {fx(inPt, 2)}s</span>
            <span style={{ color: 'var(--af-accent)', fontWeight: 700 }}>Duration: {fx(selDur, 2)}s</span>
            <span style={{ color: 'var(--af-red)', fontWeight: 700 }}>End: {fx(outPt, 2)}s</span>
          </div>
          <div ref={tlRef} onMouseDown={onTlDown} style={{ position: 'relative', height: 64, borderRadius: 8, overflow: 'hidden', cursor: 'crosshair', userSelect: 'none', marginBottom: 8, background: '#000' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              {Array.from({ length: thumbCount }, (_, ti) => {
                const tt = (ti / thumbCount) * fullDur
                return <div key={ti} style={{ flex: 1, backgroundImage: `url(${muxThumb(original.mux_playback_id || '', tt)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              })}
            </div>
            <div style={{ position: 'absolute', top: 0, left: 0, width: inPct + '%', height: '100%', background: 'rgba(0,0,0,0.65)' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: (100 - outPct) + '%', height: '100%', background: 'rgba(0,0,0,0.65)' }} />
            <div style={{ position: 'absolute', top: 0, left: inPct + '%', width: (outPct - inPct) + '%', height: '100%', border: '2px solid var(--af-accent)', boxSizing: 'border-box', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: -4, left: `calc(${inPct}% - 8px)`, width: 16, height: 72, background: 'var(--af-green)', borderRadius: 4, cursor: 'ew-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              <div style={{ width: 2, height: 30, background: 'rgba(255,255,255,0.9)', borderRadius: 2 }} />
            </div>
            <div style={{ position: 'absolute', top: -4, left: `calc(${outPct}% - 8px)`, width: 16, height: 72, background: '#DC2626', borderRadius: 4, cursor: 'ew-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              <div style={{ width: 2, height: 30, background: 'rgba(255,255,255,0.9)', borderRadius: 2 }} />
            </div>
            <div style={{ position: 'absolute', top: 0, left: `calc(${curPct}% - 1px)`, width: 2, height: '100%', background: '#fff', pointerEvents: 'none', zIndex: 20, boxShadow: '0 0 6px rgba(255,255,255,0.5)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => seekTo(inPt)} style={{ background: 'var(--af-card)', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>⏮ Start</button>
            <button onClick={togglePlay} style={{ flex: 1, background: 'var(--af-accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 0', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {playing ? <><Pause size={13}/> Pause</> : <><Play size={13}/> Preview selection</>}
            </button>
            <button onClick={() => seekTo(outPt - 0.1)} style={{ background: 'var(--af-card)', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>End ⏭</button>
            <button onClick={() => { setInPt(0); setOutPt(Math.min(3, fullDur)) }} style={{ background: 'var(--af-red-soft)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--af-red)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}><RotateCcw size={11} /></button>
          </div>
        </div>

        {/* Metadata form */}
        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid var(--af-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label>Clip title</Label>
            <Input value={title} onChange={(e: any) => setTitle(e.target.value)} placeholder="e.g. Hook: 'I tried 12 brands of...'" />
          </div>

          <div>
            <Label>Clip role (optional)</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CLIP_ROLES.slice(0, 8).map(role => {
                const rc = secColor(role.toUpperCase())
                const active = clipRole === role
                return (
                  <button key={role} onClick={() => setClipRole(active ? null : role)} style={{
                    background: active ? rc.bg : 'var(--af-card)',
                    color: active ? rc.color : 'var(--af-text-secondary)',
                    border: '1px solid ' + (active ? (rc.bd || rc.color + '44') : 'var(--af-border)'),
                    borderRadius: 99,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>{role.toUpperCase().replace('_', ' ')}</button>
                )
              })}
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <Label>Tags (optional)</Label>
            <TagEditor tags={tags} onUpdate={setTags} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: aiAssist ? 'var(--af-accent-soft)' : 'var(--af-card)', border: '1px solid ' + (aiAssist ? 'rgba(139,127,255,0.3)' : 'var(--af-border)'), borderRadius: 10, cursor: 'pointer' }} onClick={() => setAiAssist(!aiAssist)}>
            <Sparkles size={14} color={aiAssist ? 'var(--af-accent)' : 'var(--af-text-secondary)'} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: aiAssist ? 'var(--af-accent)' : 'var(--af-text)' }}>AI tag assist</div>
              <div style={{ fontSize: 11, color: 'var(--af-text-secondary)', marginTop: 2 }}>
                Auto-generate scene tags from this clip's transcript when saving. Adds to your manual tags.
              </div>
            </div>
            <div style={{ width: 30, height: 18, borderRadius: 99, background: aiAssist ? 'var(--af-accent)' : 'var(--af-border)', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
              <div style={{ position: 'absolute', top: 2, left: aiAssist ? 14 : 2, width: 14, height: 14, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
            </div>
          </div>

          {error && (
            <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: 'var(--af-red-soft)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--af-red)' }}>
              {error}
            </div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn onClick={onClose} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)' }}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving} style={{ background: 'var(--af-accent)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
              {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> Saving…</> : <><Save size={14}/> Save clip</>}
            </Btn>
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
