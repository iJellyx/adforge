'use client'
import { useState, useCallback } from 'react'
import type { Item, CaptionSettings, CaptionStyle } from './types'
import { C, SEC_TYPES, DEFAULT_CAPTIONS } from './constants'
import { secColor, callClaude, muxThumb, fmt } from './utils'
import { Btn, Label, Input } from './ui-primitives'
import { StitchedPreview } from './StitchedPreview'
import { VoiceoverGenerator } from './VoiceoverGenerator'
import { MusicPicker } from './MusicPicker'
import { ExportVideo } from './ExportVideo'
import { ClipPickerModal } from './ClipPickerModal'
import { TrimEditorModal } from './TrimEditorModal'
import { SectionsRail } from './SectionsRail'
import {
  ChevronLeft, ChevronDown, Scissors, Wand2, Mic, Music,
  Settings, Zap, Check, Play, Save, ChevronRight, Type,
  Film, Volume2, Palette, Eye
} from 'lucide-react'

type TabId = 'script' | 'clips' | 'audio' | 'style'

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'script', label: 'Script', icon: Type },
  { id: 'clips', label: 'Clips', icon: Film },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'style', label: 'Style', icon: Palette },
]

const ASPECT_OPTIONS = [
  { ratio: '9:16', label: '9:16', sub: 'Reels' },
  { ratio: '1:1', label: '1:1', sub: 'Feed' },
  { ratio: '4:5', label: '4:5', sub: 'Feed' },
  { ratio: '16:9', label: '16:9', sub: 'YT' },
]

const CAPTION_COLORS = ['#5B49FF', '#FFFFFF', '#FACC15', '#22C55E', '#EF4444', '#F97316', '#3B82F6', '#000000']
const CAPTION_SIZES: { label: string; value: number }[] = [
  { label: 'S', value: 16 },
  { label: 'M', value: 22 },
  { label: 'L', value: 30 },
  { label: 'XL', value: 40 },
]

export function AdStudio({
  sections, setSections,
  hookVariations, selectedHooks, setSelectedHooks,
  activeHookIdx, setActiveHookIdx,
  hookSections, setHookSections,
  voiceoverUrl, setVoiceoverUrl,
  voiceoverVoice, setVoiceoverVoice,
  musicUrl, setMusicUrl,
  musicName, setMusicName,
  captionSettings, setCaptionSettings,
  adTitle, setAdTitle,
  aspectRatio, setAspectRatio,
  suggestedMood,
  items, brand, genMeta,
  onSave, onBack, onMatchClips, onGenerateHooks,
  generating, matching, generatingHooks, hookError,
  workspaceId, isV2, autoCount, form
}: {
  sections: any[]
  setSections: (s: any[]) => void
  hookVariations: any[][]
  selectedHooks: number[]
  setSelectedHooks: (h: number[]) => void
  activeHookIdx: number
  setActiveHookIdx: (i: number) => void
  hookSections: Record<number, any[]>
  setHookSections: (fn: (prev: Record<number, any[]>) => Record<number, any[]>) => void
  voiceoverUrl: string | null
  setVoiceoverUrl: (u: string | null) => void
  voiceoverVoice: string | null
  setVoiceoverVoice: (v: string | null) => void
  musicUrl: string | null
  setMusicUrl: (u: string | null) => void
  musicName: string | null
  setMusicName: (n: string | null) => void
  captionSettings: CaptionSettings
  setCaptionSettings: (s: CaptionSettings) => void
  adTitle: string
  setAdTitle: (t: string) => void
  aspectRatio: string
  setAspectRatio: (r: string) => void
  suggestedMood: string | null
  items: Item[]
  brand: any
  genMeta: any
  onSave: (status: 'draft' | 'complete') => Promise<void>
  onBack: () => void
  onMatchClips: () => Promise<void>
  onGenerateHooks: () => Promise<void>
  generating: boolean
  matching: boolean
  generatingHooks: boolean
  hookError: string
  workspaceId: string
  isV2?: boolean
  autoCount: number
  form: any
}) {
  // ── Internal state ──
  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [activeTab, setActiveTab] = useState<TabId>('script')
  const [currentlyPlayingIdx, setCurrentlyPlayingIdx] = useState<number | undefined>(undefined)
  const [hookPickerOpen, setHookPickerOpen] = useState(false)
  const [clipPickerOpen, setClipPickerOpen] = useState(false)
  const [trimModalOpen, setTrimModalOpen] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  // ── Derived values ──
  const assignedCount = sections.filter((s: any) => s.selectedClipId || (s.clipSegments || []).some((seg: any) => seg.clipId)).length
  const totalSections = sections.length
  const activeSection = sections[activeSectionIdx] || sections[0]

  // ── Section update helper ──
  function updateSection(key: string, value: any) {
    const next = sections.map((sec: any, i: number) =>
      i === activeSectionIdx ? { ...sec, [key]: value } : sec
    )
    setSections(next)
    setHookSections(prev => ({ ...prev, [activeHookIdx]: next }))
  }

  function updateSectionMulti(updates: Record<string, any>) {
    const next = sections.map((sec: any, i: number) =>
      i === activeSectionIdx ? { ...sec, ...updates } : sec
    )
    setSections(next)
    setHookSections(prev => ({ ...prev, [activeHookIdx]: next }))
  }

  // ── Clip swap helper ──
  function swapClip(clipId: string) {
    const currentSegs = activeSection.clipSegments && activeSection.clipSegments.length > 0
      ? activeSection.clipSegments
      : [{ id: `seg-${activeSectionIdx}-0`, clipId: activeSection.selectedClipId || null }]
    const newSegs = currentSegs.map((seg: any, si: number) =>
      si === 0 ? { ...seg, clipId } : seg
    )
    const next = sections.map((s: any, i: number) =>
      i === activeSectionIdx ? { ...s, clipSegments: newSegs, selectedClipId: clipId, autoSelected: false } : s
    )
    setSections(next)
    setHookSections(prev => ({ ...prev, [activeHookIdx]: next }))
  }

  // ── Trim save handler ──
  function handleTrimSave(updates: any) {
    const currentSegs = activeSection.clipSegments && activeSection.clipSegments.length > 0
      ? activeSection.clipSegments
      : [{ id: `seg-${activeSectionIdx}-0`, clipId: activeSection.selectedClipId }]
    const newSegs = currentSegs.map((s: any, si: number) =>
      si === 0 ? { ...s, ...updates } : s
    )
    const next = sections.map((s: any, i: number) =>
      i === activeSectionIdx ? { ...s, clipSegments: newSegs } : s
    )
    setSections(next)
    setHookSections(prev => ({ ...prev, [activeHookIdx]: next }))
    setTrimModalOpen(false)
  }

  // ── AI Rewrite ──
  async function rewriteSection() {
    if (!activeSection) return
    setRewriting(true)
    try {
      const ctx = sections.map((s: any, i: number) =>
        `[${i === activeSectionIdx ? '-> THIS' : '  '}] ${s.type}: ${(s.spokenWords || '(empty)').substring(0, 60)}`
      ).join('\n')
      const raw = await callClaude([{
        role: 'user',
        content: `Rewrite the ${activeSection.type} section for a direct response video ad.\nBrand: ${brand?.name || 'Unknown'}\nProduct: ${genMeta?.productName || 'Unknown'}\n\nCurrent script:\n${ctx}\n\nCurrent spoken words: "${activeSection.spokenWords || ''}"\nCurrent visual direction: "${activeSection.visualDirection || ''}"\n\nReturn ONLY JSON: {"spokenWords":"exact words to speak","visualDirection":"what is on screen"}`
      }], 400)
      const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
      updateSectionMulti({
        spokenWords: data.spokenWords || activeSection.spokenWords,
        visualDirection: data.visualDirection || activeSection.visualDirection,
      })
    } catch (e) {
      console.error('AI rewrite failed:', e)
    }
    setRewriting(false)
  }

  // ── Navigation ──
  function goSection(dir: -1 | 1) {
    const next = activeSectionIdx + dir
    if (next >= 0 && next < sections.length) setActiveSectionIdx(next)
  }

  // ── Clip info for clips tab ──
  const currentClipId = activeSection?.selectedClipId || activeSection?.clipSegments?.[0]?.clipId
  const currentClip = items.find((i: Item) => i.id === currentClipId)
  const alternatives = (activeSection?.matchedClipIds || [])
    .filter((id: string) => id !== currentClipId)
    .map((id: string) => items.find((i: Item) => i.id === id))
    .filter(Boolean)
    .slice(0, 8)

  // ── Trim modal data ──
  const trimItem = currentClip || null
  const trimSeg = activeSection?.clipSegments?.[0] || { clipId: currentClipId }

  // ── Render ──
  return (
    <div className="ad-studio" style={{ minHeight: '100vh', background: 'var(--af-bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ══════════════════════════ STICKY TOP BAR ══════════════════════════ */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--af-surface)',
        borderBottom: '1px solid var(--af-border)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backdropFilter: 'blur(8px)',
        height: 56,
        boxSizing: 'border-box',
      }}>
        {/* Back */}
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: 'var(--af-text-secondary)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex',
            alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7,
            fontFamily: 'inherit', transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--af-card)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ChevronLeft size={16} />
          Back
        </button>

        {/* Title */}
        <input
          value={adTitle}
          onChange={e => setAdTitle(e.target.value)}
          placeholder={`${genMeta?.productName || 'Untitled ad'} -- ${genMeta?.form?.contentType || ''} ${(genMeta?.form?.adLength || '30s').replace(' seconds', 's')}`}
          style={{
            flex: 1, minWidth: 0, maxWidth: 420, background: 'transparent',
            border: '1px solid transparent', borderRadius: 8, padding: '6px 10px',
            color: 'var(--af-text)', fontSize: 15, fontWeight: 600, outline: 'none',
            fontFamily: 'inherit', transition: 'border-color 0.15s, background 0.15s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--af-border-strong)'; e.currentTarget.style.background = 'var(--af-card)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
        />

        {/* Status badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--af-text-secondary)', flexWrap: 'nowrap' }}>
          <span style={{
            background: assignedCount === totalSections ? 'var(--af-green-soft)' : 'var(--af-card)',
            color: assignedCount === totalSections ? 'var(--af-green)' : 'var(--af-text-secondary)',
            padding: '4px 9px', borderRadius: 99, fontWeight: 600,
            border: '1px solid ' + (assignedCount === totalSections ? 'rgba(74,222,128,0.25)' : 'var(--af-border)'),
          }}>
            {assignedCount}/{totalSections} clips
          </span>
          <span style={{
            background: voiceoverUrl ? 'var(--af-green-soft)' : 'var(--af-card)',
            color: voiceoverUrl ? 'var(--af-green)' : 'var(--af-text-secondary)',
            padding: '4px 9px', borderRadius: 99, fontWeight: 600,
            border: '1px solid ' + (voiceoverUrl ? 'rgba(74,222,128,0.25)' : 'var(--af-border)'),
          }}>
            {voiceoverUrl ? 'VO \u2713' : 'VO'}
          </span>
          <span style={{
            background: musicUrl ? 'var(--af-accent-soft)' : 'var(--af-card)',
            color: musicUrl ? 'var(--af-accent)' : 'var(--af-text-secondary)',
            padding: '4px 9px', borderRadius: 99, fontWeight: 600,
            border: '1px solid ' + (musicUrl ? 'rgba(139,127,255,0.25)' : 'var(--af-border)'),
          }}>
            {musicUrl ? 'Music \u2713' : 'Music'}
          </span>
          <span style={{
            background: 'var(--af-card)', color: 'var(--af-text-secondary)',
            padding: '4px 9px', borderRadius: 99, fontWeight: 600,
            border: '1px solid var(--af-border)',
          }}>
            {aspectRatio}
          </span>
        </div>

        {/* Hook dropdown */}
        {hookVariations.length > 1 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setHookPickerOpen(!hookPickerOpen)}
              style={{
                background: 'var(--af-card)', border: '1px solid var(--af-border)',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                fontWeight: 600, color: 'var(--af-text)', display: 'flex',
                alignItems: 'center', gap: 6, fontFamily: 'inherit',
              }}
            >
              <Zap size={12} style={{ color: 'var(--af-accent)' }} />
              {hookVariations[activeHookIdx]?.[0]?.hookType || `Hook #${activeHookIdx + 1}`}
              <ChevronDown size={14} />
            </button>
            {hookPickerOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0,
                background: 'var(--af-card)', border: '1px solid var(--af-border)',
                borderRadius: 10, marginTop: 4, minWidth: 220, zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)', overflow: 'hidden',
              }}>
                {hookVariations.map((_: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveHookIdx(i)
                      setHookPickerOpen(false)
                      const hs = hookSections[i]
                      if (hs) setSections(hs)
                      else setSections(hookVariations[i] || sections)
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 14px', border: 'none',
                      background: i === activeHookIdx ? 'var(--af-accent-soft)' : 'transparent',
                      color: i === activeHookIdx ? 'var(--af-accent)' : 'var(--af-text)',
                      cursor: 'pointer', fontSize: 13, fontWeight: i === activeHookIdx ? 700 : 500,
                      fontFamily: 'inherit', borderBottom: '1px solid var(--af-border)',
                    }}
                    onMouseEnter={e => { if (i !== activeHookIdx) e.currentTarget.style.background = 'var(--af-surface)' }}
                    onMouseLeave={e => { if (i !== activeHookIdx) e.currentTarget.style.background = 'transparent' }}
                  >
                    {i === 0 ? 'Original' : `Hook ${i + 1}`} {hookVariations[i]?.[0]?.hookType ? `\u2014 ${hookVariations[i][0].hookType}` : ''}
                    {i === activeHookIdx && <Check size={14} style={{ float: 'right', marginTop: 1 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onSave('draft')}
            style={{
              background: 'var(--af-card)', color: 'var(--af-text)',
              border: '1px solid var(--af-border)', padding: '8px 14px',
              fontSize: 13, borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--af-surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--af-card)')}
          >
            <Save size={14} />
            Save draft
          </button>
          <button
            onClick={() => onSave('complete')}
            style={{
              background: 'var(--af-accent)', color: '#fff', border: 'none',
              padding: '8px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
              fontWeight: 700, fontFamily: 'inherit', display: 'flex',
              alignItems: 'center', gap: 5, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Check size={14} />
            {selectedHooks.length > 1 ? `Save ${selectedHooks.length} variations` : 'Complete'}
          </button>
        </div>
      </header>

      {/* ══════════════════════════ MAIN BODY ══════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Canvas area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Preview */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            <StitchedPreview
              sections={sections}
              libraryItems={items}
              voiceoverUrl={voiceoverUrl}
              musicUrl={musicUrl}
              captionSettings={captionSettings}
              onCaptionChange={setCaptionSettings}
              fullWidth
              onClipChange={setCurrentlyPlayingIdx}
            />
          </div>

          {/* Sections Rail */}
          <SectionsRail
            sections={sections}
            libraryItems={items}
            activeIdx={activeSectionIdx}
            currentlyPlayingIdx={currentlyPlayingIdx}
            onSelectSection={setActiveSectionIdx}
          />
        </div>

        {/* ── Inspector sidebar ── */}
        <aside style={{
          width: 360, borderLeft: '1px solid var(--af-border)',
          background: 'var(--af-surface)', display: 'flex', flexDirection: 'column',
          flexShrink: 0,
        }}>
          {/* Tab navigation */}
          <nav style={{ display: 'flex', borderBottom: '1px solid var(--af-border)', flexShrink: 0 }}>
            {TABS.map(t => {
              const Icon = t.icon
              const isActive = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    flex: 1, padding: '12px 8px', background: isActive ? 'var(--af-card)' : 'transparent',
                    color: isActive ? 'var(--af-accent)' : 'var(--af-text-secondary)',
                    border: 'none', borderBottom: `2px solid ${isActive ? 'var(--af-accent)' : 'transparent'}`,
                    fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: 'pointer',
                    fontFamily: 'inherit', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 3, transition: 'color 0.15s, background 0.15s',
                  }}
                >
                  <Icon size={15} />
                  {t.label}
                </button>
              )
            })}
          </nav>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

            {/* ════════ SCRIPT TAB ════════ */}
            {activeTab === 'script' && activeSection && (() => {
              const sc = secColor(activeSection.type)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 700,
                      padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}>
                      {activeSection.type}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--af-muted)' }}>
                      Section {activeSectionIdx + 1} of {sections.length}
                    </span>
                  </div>

                  {/* Spoken words */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
                      Spoken words
                    </label>
                    <textarea
                      value={activeSection.spokenWords || ''}
                      onChange={e => updateSection('spokenWords', e.target.value)}
                      rows={4}
                      style={{
                        width: '100%', background: 'var(--af-card)', border: '1px solid var(--af-border)',
                        borderRadius: 8, padding: '10px 12px', color: 'var(--af-text)', fontSize: 13,
                        outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                        lineHeight: 1.5, transition: 'border-color 0.15s',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--af-accent)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--af-border)')}
                    />
                  </div>

                  {/* Visual direction */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
                      Visual direction
                    </label>
                    <textarea
                      value={activeSection.visualDirection || ''}
                      onChange={e => updateSection('visualDirection', e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', background: 'var(--af-card)', border: '1px solid var(--af-border)',
                        borderRadius: 8, padding: '10px 12px', color: 'var(--af-text)', fontSize: 13,
                        outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                        lineHeight: 1.5, transition: 'border-color 0.15s',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--af-accent)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--af-border)')}
                    />
                  </div>

                  {/* AI Rewrite */}
                  <button
                    onClick={rewriteSection}
                    disabled={rewriting}
                    style={{
                      background: 'var(--af-accent-soft)', color: 'var(--af-accent)',
                      border: '1px solid rgba(139,127,255,0.25)', borderRadius: 8,
                      padding: '9px 14px', cursor: rewriting ? 'wait' : 'pointer',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: rewriting ? 0.6 : 1, transition: 'opacity 0.15s',
                    }}
                  >
                    <Wand2 size={14} />
                    {rewriting ? 'Rewriting...' : 'Rewrite with AI'}
                  </button>

                  {/* Re-voice button */}
                  {voiceoverUrl && (
                    <button
                      onClick={() => {
                        (window as any).__voiceoverRegenerateSection?.(activeSectionIdx, () => {})
                      }}
                      style={{
                        background: 'var(--af-green-soft)', color: 'var(--af-green)',
                        border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8,
                        padding: '9px 14px', cursor: 'pointer', fontSize: 12,
                        fontWeight: 600, fontFamily: 'inherit', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <Mic size={14} />
                      Re-voice this section
                    </button>
                  )}

                  {/* Section navigation */}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
                    <button
                      onClick={() => goSection(-1)}
                      disabled={activeSectionIdx === 0}
                      style={{
                        flex: 1, background: 'var(--af-card)', border: '1px solid var(--af-border)',
                        borderRadius: 8, padding: '8px 12px', cursor: activeSectionIdx === 0 ? 'not-allowed' : 'pointer',
                        fontSize: 12, fontWeight: 600, color: activeSectionIdx === 0 ? 'var(--af-muted)' : 'var(--af-text)',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        opacity: activeSectionIdx === 0 ? 0.5 : 1,
                      }}
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <button
                      onClick={() => goSection(1)}
                      disabled={activeSectionIdx >= sections.length - 1}
                      style={{
                        flex: 1, background: 'var(--af-card)', border: '1px solid var(--af-border)',
                        borderRadius: 8, padding: '8px 12px',
                        cursor: activeSectionIdx >= sections.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: 12, fontWeight: 600,
                        color: activeSectionIdx >= sections.length - 1 ? 'var(--af-muted)' : 'var(--af-text)',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        opacity: activeSectionIdx >= sections.length - 1 ? 0.5 : 1,
                      }}
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* ════════ CLIPS TAB ════════ */}
            {activeTab === 'clips' && activeSection && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Current clip */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' }}>
                    Current clip — {activeSection.type}
                  </label>
                  {currentClip ? (
                    <div style={{
                      position: 'relative', borderRadius: 10, overflow: 'hidden',
                      border: '1px solid var(--af-border)', background: 'var(--af-card)',
                    }}>
                      <div style={{
                        width: '100%', height: 160,
                        background: currentClip.mux_playback_id
                          ? `url(${muxThumb(currentClip.mux_playback_id, currentClip.thumbnail_time ?? currentClip.start_seconds ?? 0)}) center/cover no-repeat`
                          : 'var(--af-surface)',
                      }} />
                      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--af-text)', marginBottom: 2 }}>
                            {currentClip.title || 'Untitled clip'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--af-muted)' }}>
                            {currentClip.creator || ''} {currentClip.duration_seconds ? `\u00B7 ${fmt(currentClip.duration_seconds)}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => setTrimModalOpen(true)}
                          style={{
                            background: 'var(--af-accent-soft)', color: 'var(--af-accent)',
                            border: '1px solid rgba(139,127,255,0.25)', borderRadius: 7,
                            padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <Scissors size={12} /> Trim
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '32px 16px', textAlign: 'center', background: 'var(--af-card)',
                      borderRadius: 10, border: '1px solid var(--af-border)', color: 'var(--af-muted)',
                      fontSize: 13,
                    }}>
                      No clip assigned
                    </div>
                  )}
                </div>

                {/* Alternatives */}
                {alternatives.length > 0 && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' }}>
                      Alternatives ({alternatives.length})
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {alternatives.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => swapClip(item.id)}
                          style={{
                            cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
                            border: '1px solid var(--af-border)', background: 'var(--af-card)',
                            transition: 'border-color 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--af-accent)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--af-border)')}
                        >
                          <div style={{
                            width: '100%', height: 80,
                            background: item.mux_playback_id
                              ? `url(${muxThumb(item.mux_playback_id, item.thumbnail_time ?? item.start_seconds ?? 0)}) center/cover no-repeat`
                              : 'var(--af-surface)',
                          }} />
                          <div style={{ padding: '5px 8px' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--af-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.title || 'Untitled'}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--af-muted)' }}>
                              {item.duration_seconds ? fmt(item.duration_seconds) : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Re-match + Browse */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={() => setClipPickerOpen(true)}
                    style={{
                      background: 'var(--af-card)', color: 'var(--af-text)',
                      border: '1px solid var(--af-border)', borderRadius: 8,
                      padding: '10px 14px', cursor: 'pointer', fontSize: 12,
                      fontWeight: 600, fontFamily: 'inherit', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--af-accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--af-border)')}
                  >
                    <Eye size={14} /> Browse full library
                  </button>
                  <button
                    onClick={onMatchClips}
                    disabled={matching || items.length === 0}
                    style={{
                      background: matching ? 'var(--af-card)' : 'var(--af-accent-soft)',
                      color: matching ? 'var(--af-muted)' : 'var(--af-accent)',
                      border: '1px solid ' + (matching ? 'var(--af-border)' : 'rgba(139,127,255,0.25)'),
                      borderRadius: 8, padding: '10px 14px', cursor: matching ? 'wait' : 'pointer',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: matching ? 0.6 : 1,
                    }}
                  >
                    <Zap size={14} />
                    {matching ? 'Matching...' : 'Re-match clips'}
                  </button>
                </div>

                {/* Modals */}
                {clipPickerOpen && (
                  <ClipPickerModal
                    currentId={currentClipId}
                    matchedIds={activeSection.matchedClipIds || []}
                    libraryItems={items}
                    sectionLabel={activeSection.type}
                    onSelect={(id: string) => swapClip(id)}
                    onClose={() => setClipPickerOpen(false)}
                  />
                )}
                {trimModalOpen && trimItem && (
                  <TrimEditorModal
                    item={trimItem}
                    trimStart={trimSeg.trimStart}
                    trimEnd={trimSeg.trimEnd}
                    originalDuration={
                      items.find((i: Item) => i.id === trimItem.parent_id)?.duration_seconds
                      || trimItem.duration_seconds || 30
                    }
                    onSave={handleTrimSave}
                    onClose={() => setTrimModalOpen(false)}
                  />
                )}
              </div>
            )}

            {/* ════════ AUDIO TAB ════════ */}
            {activeTab === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Voiceover section */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mic size={13} /> Voiceover
                  </label>
                  {voiceoverUrl ? (
                    <div style={{
                      background: 'var(--af-card)', border: '1px solid var(--af-border)',
                      borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11, color: 'var(--af-green)', fontWeight: 600,
                          background: 'var(--af-green-soft)', padding: '2px 8px', borderRadius: 99,
                          border: '1px solid rgba(74,222,128,0.25)',
                        }}>
                          {voiceoverVoice || 'Voice'}
                        </span>
                        <div style={{ flex: 1 }} />
                        <button
                          onClick={() => { setVoiceoverUrl(null); setVoiceoverVoice(null) }}
                          style={{
                            background: 'none', border: '1px solid var(--af-border)',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                            fontSize: 11, color: 'var(--af-text-secondary)', fontFamily: 'inherit',
                          }}
                        >
                          Regenerate
                        </button>
                      </div>
                      <audio src={voiceoverUrl} controls style={{ width: '100%', height: 32 }} />
                    </div>
                  ) : (
                    <VoiceoverGenerator
                      sections={sections}
                      allHookSections={selectedHooks.length > 1 ? selectedHooks.map(hi => hookVariations[hi] || sections) : null}
                      onSave={(updatedSections: any[], voice: string, combinedUrl: string, allUpdatedHooks?: any[][]) => {
                        setSections(updatedSections)
                        setVoiceoverVoice(voice)
                        setVoiceoverUrl(combinedUrl)
                        if (allUpdatedHooks) {
                          const newHS: Record<number, any[]> = {}
                          selectedHooks.forEach((hi, i) => { newHS[i] = allUpdatedHooks[i] || updatedSections })
                          setHookSections(prev => ({ ...prev, ...newHS }))
                        }
                      }}
                      onSkip={() => { setVoiceoverUrl(null); setVoiceoverVoice(null) }}
                    />
                  )}
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--af-border)' }} />

                {/* Music section */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Music size={13} /> Music
                  </label>
                  {musicUrl ? (
                    <div style={{
                      background: 'var(--af-card)', border: '1px solid var(--af-border)',
                      borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11, color: 'var(--af-accent)', fontWeight: 600,
                          background: 'var(--af-accent-soft)', padding: '2px 8px', borderRadius: 99,
                          border: '1px solid rgba(139,127,255,0.25)',
                        }}>
                          {musicName || 'Track'}
                        </span>
                        <div style={{ flex: 1 }} />
                        <button
                          onClick={() => { setMusicUrl(null); setMusicName(null) }}
                          style={{
                            background: 'none', border: '1px solid var(--af-border)',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                            fontSize: 11, color: 'var(--af-text-secondary)', fontFamily: 'inherit',
                          }}
                        >
                          Change
                        </button>
                      </div>
                      <audio src={musicUrl} controls style={{ width: '100%', height: 32 }} />
                    </div>
                  ) : (
                    <MusicPicker
                      suggestedMood={suggestedMood}
                      onSave={(url: string | null, name: string | null) => {
                        setMusicUrl(url)
                        setMusicName(name)
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ════════ STYLE TAB ════════ */}
            {activeTab === 'style' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Aspect ratio */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' }}>
                    Aspect ratio
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                    {ASPECT_OPTIONS.map(opt => (
                      <button
                        key={opt.ratio}
                        onClick={() => setAspectRatio(opt.ratio)}
                        style={{
                          background: aspectRatio === opt.ratio ? 'var(--af-accent)' : 'var(--af-card)',
                          color: aspectRatio === opt.ratio ? '#fff' : 'var(--af-text)',
                          border: '1px solid ' + (aspectRatio === opt.ratio ? 'var(--af-accent)' : 'var(--af-border)'),
                          borderRadius: 8, padding: '10px 4px', cursor: 'pointer', fontSize: 11,
                          fontWeight: aspectRatio === opt.ratio ? 700 : 500,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                          fontFamily: 'inherit', transition: 'all 0.12s',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{opt.label}</div>
                        <div style={{ fontSize: 9, opacity: 0.7 }}>{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Captions */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' }}>
                    Captions
                  </label>

                  {/* On/Off toggle */}
                  <button
                    onClick={() => setCaptionSettings({ ...captionSettings, enabled: !captionSettings.enabled })}
                    style={{
                      background: captionSettings.enabled ? 'var(--af-accent)' : 'var(--af-card)',
                      color: captionSettings.enabled ? '#fff' : 'var(--af-text)',
                      border: '1px solid ' + (captionSettings.enabled ? 'var(--af-accent)' : 'var(--af-border)'),
                      borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12,
                      transition: 'all 0.15s',
                    }}
                  >
                    {captionSettings.enabled ? 'Captions on' : 'Captions off'}
                  </button>

                  {captionSettings.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                      {/* Style */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--af-text-secondary)', marginBottom: 6 }}>Style</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['word', 'line', 'karaoke'] as CaptionStyle[]).map(style => (
                            <button
                              key={style}
                              onClick={() => setCaptionSettings({ ...captionSettings, style })}
                              style={{
                                flex: 1, background: captionSettings.style === style ? 'var(--af-accent-soft)' : 'var(--af-card)',
                                color: captionSettings.style === style ? 'var(--af-accent)' : 'var(--af-text)',
                                border: '1px solid ' + (captionSettings.style === style ? 'var(--af-accent)' : 'var(--af-border)'),
                                borderRadius: 7, padding: '7px 8px', cursor: 'pointer',
                                fontSize: 11, fontWeight: captionSettings.style === style ? 700 : 500,
                                fontFamily: 'inherit', textTransform: 'capitalize',
                              }}
                            >
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Color */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--af-text-secondary)', marginBottom: 6 }}>Color</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {CAPTION_COLORS.map(color => (
                            <button
                              key={color}
                              onClick={() => setCaptionSettings({ ...captionSettings, accentColor: color })}
                              style={{
                                width: 28, height: 28, borderRadius: 6,
                                background: color,
                                border: captionSettings.accentColor === color
                                  ? '2px solid var(--af-accent)'
                                  : '2px solid var(--af-border)',
                                cursor: 'pointer', padding: 0,
                                boxShadow: captionSettings.accentColor === color ? '0 0 0 2px var(--af-accent-soft)' : 'none',
                              }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Size */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--af-text-secondary)', marginBottom: 6 }}>Size</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {CAPTION_SIZES.map(sz => (
                            <button
                              key={sz.label}
                              onClick={() => setCaptionSettings({ ...captionSettings, fontSize: sz.value })}
                              style={{
                                flex: 1, background: captionSettings.fontSize === sz.value ? 'var(--af-accent)' : 'var(--af-card)',
                                color: captionSettings.fontSize === sz.value ? '#fff' : 'var(--af-text)',
                                border: '1px solid ' + (captionSettings.fontSize === sz.value ? 'var(--af-accent)' : 'var(--af-border)'),
                                borderRadius: 7, padding: '7px 8px', cursor: 'pointer',
                                fontSize: 12, fontWeight: captionSettings.fontSize === sz.value ? 700 : 500,
                                fontFamily: 'inherit',
                              }}
                            >
                              {sz.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ad title */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
                    Ad title
                  </label>
                  <input
                    value={adTitle}
                    onChange={e => setAdTitle(e.target.value)}
                    placeholder="Untitled ad"
                    style={{
                      width: '100%', background: 'var(--af-card)', border: '1px solid var(--af-border)',
                      borderRadius: 8, padding: '10px 12px', color: 'var(--af-text)', fontSize: 13,
                      outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--af-accent)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--af-border)')}
                  />
                </div>

                {/* Hook variations (generate button if none) */}
                {hookVariations.length === 0 && (
                  <div>
                    <button
                      onClick={onGenerateHooks}
                      disabled={generatingHooks || sections.length === 0}
                      style={{
                        width: '100%',
                        background: generatingHooks ? 'var(--af-card)' : 'var(--af-accent-soft)',
                        color: generatingHooks ? 'var(--af-muted)' : 'var(--af-accent)',
                        border: '1px solid ' + (generatingHooks ? 'var(--af-border)' : 'rgba(139,127,255,0.25)'),
                        borderRadius: 8, padding: '10px 14px', cursor: generatingHooks ? 'wait' : 'pointer',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        opacity: generatingHooks ? 0.6 : 1,
                      }}
                    >
                      <Zap size={14} />
                      {generatingHooks ? 'Generating...' : 'Generate 3 hook variations'}
                    </button>
                    {hookError && <div style={{ fontSize: 11, color: 'var(--af-red)', marginTop: 6 }}>{hookError}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
