'use client'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Check, ChevronLeft, AlertTriangle, Lock, RotateCcw, Zap } from 'lucide-react'
import { C, STAGES, AD_LENGTHS } from '../constants'
import type { Item, BrandProfile, Product, ForgedAd } from '../types'
import {
  STEPS, type StepId, type PipelineState, createInitialPipelineState,
  type Brief, type ScriptSection, wordBudgetFor, countWords, estimateScriptDuration,
  isWithinTolerance, fmtDur,
} from './pipeline-types'
import { Step1Brief } from './Step1Brief'
import { Step2Script } from './Step2Script'
import { Step3Voiceover } from './Step3Voiceover'
import { Step3bMusic } from './Step3bMusic'
import { Step4Clips } from './Step4Clips'
import { Step5Review } from './Step5Review'
import { DraftsList, saveScriptEntry } from './DraftsList'

// Parse an adLength like "30 seconds" → 30
function parseAdLengthSec(adLength?: string): number {
  if (!adLength) return 30
  const m = String(adLength).match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 30
}

/**
 * AdPipeline — the new 5-step ad creation flow.
 * Brief → Script → Voiceover → Music → Clips → Review
 * Each step gates the next with strict duration discipline.
 */
export function AdPipeline({
  items,
  brand,
  products,
  forgedAds,
  workspaceId,
  onSaveForgedAd,
  onGoToForged,
  onBack,
  v2SourceAd,
  onV2Consumed,
}: {
  items: Item[]
  brand: BrandProfile
  products: Product[]
  forgedAds: ForgedAd[]
  workspaceId: string
  onSaveForgedAd: (ad: Omit<ForgedAd,'id'>) => Promise<ForgedAd | null>
  onGoToForged: () => void
  onBack: () => void
  v2SourceAd?: ForgedAd | null
  onV2Consumed?: () => void
}) {
  // Draft key is scoped by workspace so multi-brand users get separate drafts
  const draftKey = `adforge.pipeline.draft.${workspaceId}`

  // Load from localStorage on mount. If a non-trivial draft exists, we
  // DON'T auto-resume — we show a banner and let the user choose. That way
  // "start a new ad" doesn't silently reload an old one.
  const [state, setState] = useState<PipelineState>(() => createInitialPipelineState())
  const [draftFound, setDraftFound] = useState<PipelineState | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [savedScriptsKey, setSavedScriptsKey] = useState(0)  // bump to force DraftsList reload
  const [v2SourceTitle, setV2SourceTitle] = useState<string | null>(null)

  // ---- V2 clone: initialize from a ForgedAd ----
  // Runs once, before the draft-check effect, so it takes precedence.
  useEffect(() => {
    if (!v2SourceAd) return
    if (hydrated) return  // only run on first mount while we're still hydrating
    try {
      const meta = v2SourceAd.metadata || {}
      const prod = products.find((p: any) => p.name === meta.productName) || products[0]
      const targetLengthSec = parseAdLengthSec(meta.adLength)
      const brief: Brief = {
        productId: prod ? String((prod as any).id) : '',
        productName: meta.productName || prod?.name || 'General',
        awarenessStage: meta.awarenessStage || 'problem_aware',
        contentType: meta.contentType || 'UGC',
        targetLengthSec,
        customerAvatar: meta.customerAvatar || '',
        painPoints: meta.painPoints || '',
        desires: meta.desires || '',
        objections: meta.objections || '',
        request: meta.request || '',
      }
      // Clean voiceover-specific fields from sections
      const sections: ScriptSection[] = (v2SourceAd.sections || []).map((s: any) => ({
        id: s.id != null ? String(s.id) : undefined,
        type: s.type,
        spokenWords: s.spokenWords || '',
        visualDirection: s.visualDirection || '',
        hookType: s.hookType,
        // Strip VO timing + clip selections — they must be redone for v2
        actualVoDurationSec: undefined,
        selectedClipId: undefined,
        matchedClipIds: [],
        clipSegments: undefined,
        trimStart: undefined,
        trimEnd: undefined,
      }))
      setState({
        ...createInitialPipelineState(),
        currentStep: 'script',
        brief,
        script: {
          sections,
          approved: false,
          estimatedDurationSec: estimateScriptDuration(sections),
        },
      })
      setV2SourceTitle(v2SourceAd.title)
      // Don't offer to resume an old draft when in v2 mode
      setDraftFound(null)
      setHydrated(true)
      onV2Consumed?.()
    } catch (e) {
      console.error('V2 clone init failed:', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v2SourceAd])

  useEffect(() => {
    if (hydrated) return
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        const parsed: PipelineState = JSON.parse(raw)
        // Only offer resume if the draft has meaningful progress (past brief).
        if (parsed.brief && parsed.currentStep !== 'brief') {
          setDraftFound(parsed)
        }
      }
    } catch { /* ignore corrupt drafts */ }
    setHydrated(true)
  }, [draftKey, hydrated])

  // Debounced auto-save. We stringify on every state change but only write
  // after 400ms idle to avoid thrashing localStorage.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!hydrated) return
    // Skip saving if there's nothing to save (fresh pipeline)
    if (!state.brief && state.currentStep === 'brief') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(state)) } catch {}
    }, 400)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state, draftKey, hydrated])

  function clearDraft() {
    try { localStorage.removeItem(draftKey) } catch {}
    setDraftFound(null)
    setState(createInitialPipelineState())
  }

  function resumeDraft() {
    if (!draftFound) return
    setState(draftFound)
    setDraftFound(null)
  }

  function discardDraft() {
    try { localStorage.removeItem(draftKey) } catch {}
    setDraftFound(null)
  }

  // Compute step statuses for progress bar
  const stepStatuses = useMemo(() => {
    const s = state
    // Gate order matches STEPS in pipeline-types.ts:
    // brief → script → voiceover → clips → music → review
    const statuses: Record<StepId, 'locked' | 'pending' | 'active' | 'complete' | 'dirty'> = {
      brief:     s.brief ? 'complete' : 'active',
      script:    s.script.approved ? 'complete' : (s.brief ? 'pending' : 'locked'),
      voiceover: s.voiceover.status === 'approved' ? 'complete' : (s.script.approved ? 'pending' : 'locked'),
      clips:     s.clips.approved ? 'complete' : (s.voiceover.status === 'approved' ? 'pending' : 'locked'),
      music:     s.music.decision !== 'pending' ? 'complete' : (s.clips.approved ? 'pending' : 'locked'),
      review:    s.export.renderStatus === 'ready' ? 'complete' : (s.music.decision !== 'pending' ? 'pending' : 'locked'),
    }
    // Active step override
    statuses[s.currentStep] = statuses[s.currentStep] === 'complete' ? 'complete' : 'active'
    if (statuses[s.currentStep] === 'locked') statuses[s.currentStep] = 'active'
    return statuses
  }, [state])

  // Step nav: clicking a step in the progress bar
  const goToStep = useCallback((target: StepId) => {
    // Allow jumping back freely; forward only to non-locked steps
    const targetStatus = stepStatuses[target]
    if (targetStatus === 'locked') return
    // If going back and later steps are complete, mark them dirty (but don't reset state)
    setState(prev => ({ ...prev, currentStep: target, errorMsg: null }))
  }, [stepStatuses])

  const updateState = useCallback((updater: (s: PipelineState) => Partial<PipelineState>) => {
    setState(prev => ({ ...prev, ...updater(prev) }))
  }, [])

  // Common handlers passed into each step

  const handleBriefSubmit = (brief: Brief, initialSections: ScriptSection[]) => {
    setState(prev => ({
      ...prev,
      brief,
      script: {
        sections: initialSections,
        approved: false,
        estimatedDurationSec: estimateScriptDuration(initialSections),
      },
      currentStep: 'script',
    }))
  }

  const handleScriptApprove = (sections: ScriptSection[]) => {
    // Lock target durations based on final word count
    const wps = 2.5
    const locked = sections.map(s => ({
      ...s,
      targetDurationSec: countWords(s.spokenWords) / wps,
    }))
    setState(prev => ({
      ...prev,
      script: {
        sections: locked,
        approved: true,
        estimatedDurationSec: estimateScriptDuration(locked),
      },
      currentStep: 'voiceover',
    }))
  }

  const handleScriptUpdate = (sections: ScriptSection[]) => {
    setState(prev => ({
      ...prev,
      script: {
        ...prev.script,
        sections,
        estimatedDurationSec: estimateScriptDuration(sections),
        approved: false,
      },
      // If VO existed, mark it dirty
      voiceover: prev.voiceover.status === 'approved'
        ? { ...prev.voiceover, status: 'idle', stitchedUrl: null, sectionAudioUrls: {}, attempts: 0 }
        : prev.voiceover,
    }))
  }

  const handleVoiceoverApprove = (
    voiceId: string,
    voiceName: string,
    stitchedUrl: string,
    sectionAudioUrls: Record<number, string>,
    sectionDurations: Record<number, number>,
    totalDurationSec: number,
  ) => {
    setState(prev => ({
      ...prev,
      voiceover: {
        ...prev.voiceover,
        voiceId,
        voiceName,
        stitchedUrl,
        sectionAudioUrls,
        sectionDurationSec: sectionDurations,
        totalDurationSec,
        status: 'approved',
      },
      // Update sections with actual VO durations so Step 4 can use them
      script: {
        ...prev.script,
        sections: prev.script.sections.map((sec, i) => ({
          ...sec,
          actualVoDurationSec: sectionDurations[i] || sec.targetDurationSec || 0,
        })),
      },
      currentStep: 'clips',
    }))
  }

  // Save current script state as a standalone entry in the saved-scripts list,
  // then exit the pipeline. Used by Step2Script's "Save script and exit" button.
  const handleSaveAndExit = useCallback(() => {
    if (!state.brief) { onBack(); return }
    try {
      const entry = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        title: `${state.brief.productName || 'Untitled'}`,
        state,
      }
      saveScriptEntry(workspaceId, entry)
      // Clear the in-progress draft — this entry now represents it
      try { localStorage.removeItem(draftKey) } catch {}
    } catch (e) { console.error('Save script failed:', e) }
    onBack()
  }, [state, workspaceId, draftKey, onBack])

  const handleResumeSaved = useCallback((saved: PipelineState) => {
    setState(saved)
    setDraftFound(null)
  }, [])

  const handleMusicDecision = (decision: 'yes' | 'no', url?: string, name?: string) => {
    setState(prev => ({
      ...prev,
      music: { decision, url: decision === 'yes' ? (url || null) : null, name: decision === 'yes' ? (name || null) : null },
      // Clips → Music → Review (Music is now the last creative decision
      // before final review).
      currentStep: 'review',
    }))
  }

  const handleClipsApprove = (sections: ScriptSection[]) => {
    setState(prev => ({
      ...prev,
      script: { ...prev.script, sections },
      clips: {
        ...prev.clips,
        approved: true,
        slots: sections.map((s, i) => ({
          sectionIdx: i,
          requiredDurationSec: s.actualVoDurationSec || s.targetDurationSec || 0,
          clipId: s.selectedClipId || null,
          trimStart: s.trimStart ?? null,
          trimEnd: s.trimEnd ?? null,
          status: s.selectedClipId ? 'ok' : 'missing',
        })),
      },
      // After clips → music (was → review in the old order).
      currentStep: 'music',
    }))
  }

  const briefCtx = state.brief
  const targetSec = briefCtx?.targetLengthSec || 30
  const estSec = state.script.estimatedDurationSec
  const scriptWithinTol = briefCtx ? isWithinTolerance(estSec, targetSec) : false

  // ---- Render ----
  return (
    <div style={{minHeight:'100vh',background:'var(--af-bg)',display:'flex',flexDirection:'column'}}>

      {/* V2 banner — shown while cloning an existing forged ad */}
      {v2SourceTitle && (
        <div style={{
          background:'var(--af-accent-soft)',
          borderBottom:'1px solid rgba(139,127,255,0.25)',
          padding:'10px 24px',
          display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
        }}>
          <Zap size={16} color="var(--af-accent)" />
          <div style={{flex:1, minWidth:200, fontSize:13, color:'var(--af-text)'}}>
            Creating <strong>v2</strong> from <em>{v2SourceTitle}</em> — script is pre-filled, voiceover & clips cleared.
          </div>
          <button onClick={() => setV2SourceTitle(null)} style={{background:'none',border:'1px solid var(--af-border)',color:'var(--af-text-secondary)',cursor:'pointer',padding:'4px 10px',borderRadius:7,fontSize:11,fontFamily:'inherit'}}>
            Dismiss
          </button>
        </div>
      )}

      {/* Resume banner — shown once on mount if a draft exists */}
      {draftFound && (
        <div style={{
          background:'var(--af-accent-soft)',
          borderBottom:'1px solid rgba(139,127,255,0.25)',
          padding:'10px 24px',
          display:'flex', alignItems:'center', gap:16, flexWrap:'wrap',
        }}>
          <RotateCcw size={16} color="var(--af-accent)" />
          <div style={{flex:1, minWidth:200, fontSize:13, color:'var(--af-text)'}}>
            <strong>Draft found</strong> — you were on <strong>{STEPS.find(s => s.id === draftFound.currentStep)?.label}</strong>
            {draftFound.brief?.productName && <> for <em>{draftFound.brief.productName}</em></>}.
            Want to resume where you left off?
          </div>
          <button onClick={discardDraft} style={{background:'none',border:'1px solid var(--af-border)',color:'var(--af-text-secondary)',cursor:'pointer',padding:'6px 12px',borderRadius:7,fontSize:12,fontFamily:'inherit'}}>
            Discard
          </button>
          <button onClick={resumeDraft} style={{background:'var(--af-accent)',border:'none',color:'#fff',cursor:'pointer',padding:'6px 16px',borderRadius:7,fontSize:12,fontWeight:600,fontFamily:'inherit'}}>
            Resume
          </button>
        </div>
      )}

      {/* Sticky top bar with progress */}
      <header style={{
        position:'sticky', top:0, zIndex:20, background:'var(--af-surface)',
        borderBottom:'1px solid var(--af-border)',
        backdropFilter:'blur(8px)',
        padding:'10px 24px',
        display:'flex', alignItems:'center', gap:16,
      }}>
        <button onClick={onBack} title="Exit" style={{background:'none',border:'none',color:'var(--af-text-secondary)',cursor:'pointer',display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:7,fontSize:13,fontWeight:500,fontFamily:'inherit'}}>
          <ChevronLeft size={16}/> Exit
        </button>

        {/* Progress bar */}
        <nav style={{flex:1,display:'flex',alignItems:'center',gap:0,justifyContent:'center',maxWidth:820,margin:'0 auto'}}>
          {STEPS.map((step, i) => {
            const status = stepStatuses[step.id]
            const isActive = state.currentStep === step.id
            const clickable = status !== 'locked'
            const bg = isActive ? 'var(--af-accent)' : status === 'complete' ? 'var(--af-green)' : 'transparent'
            const color = isActive ? '#fff' : status === 'complete' ? '#fff' : status === 'locked' ? 'var(--af-muted)' : 'var(--af-text-secondary)'
            return (
              <div key={step.id} style={{display:'flex',alignItems:'center',flex: i === STEPS.length-1 ? 'none' : 1, minWidth:0}}>
                <button
                  onClick={() => goToStep(step.id)}
                  disabled={!clickable}
                  style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'6px 12px', borderRadius:8,
                    border: isActive ? 'none' : '1px solid var(--af-border)',
                    background: bg,
                    color,
                    cursor: clickable ? 'pointer' : 'not-allowed',
                    opacity: status === 'locked' ? 0.4 : 1,
                    fontSize:12, fontWeight: isActive || status === 'complete' ? 700 : 500,
                    fontFamily:'inherit',
                    whiteSpace:'nowrap',
                    transition:'all 0.15s',
                  }}
                >
                  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',background:isActive||status==='complete'?'rgba(255,255,255,0.25)':'var(--af-card)',fontSize:10,fontWeight:800}}>
                    {status === 'complete' ? <Check size={11} strokeWidth={3}/> : status === 'locked' ? <Lock size={10}/> : (i+1)}
                  </span>
                  {step.label}
                </button>
                {i < STEPS.length - 1 && (
                  <div style={{flex:1,height:1,background:status === 'complete' ? 'var(--af-green)' : 'var(--af-border)',margin:'0 4px',minWidth:12}}/>
                )}
              </div>
            )
          })}
        </nav>

        {/* Start over — clears the draft and resets state */}
        {briefCtx && (
          <button
            onClick={() => {
              if (confirm('Discard this draft and start a new ad? This cannot be undone.')) clearDraft()
            }}
            title="Clear draft and start fresh"
            style={{background:'none',border:'1px solid var(--af-border)',color:'var(--af-text-secondary)',cursor:'pointer',padding:'6px 10px',borderRadius:7,fontSize:12,fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}
          >
            <RotateCcw size={12}/> Start over
          </button>
        )}

        {/* Target length pill */}
        {briefCtx && (
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--af-text-secondary)'}}>
            <span style={{background:'var(--af-card)',border:'1px solid var(--af-border)',padding:'4px 10px',borderRadius:99,fontWeight:600}}>
              Target: {briefCtx.targetLengthSec}s
            </span>
            {state.currentStep === 'script' && (
              <span style={{
                background: scriptWithinTol ? 'var(--af-green-soft)' : 'var(--af-red-soft)',
                color: scriptWithinTol ? 'var(--af-green)' : 'var(--af-red)',
                padding:'4px 10px', borderRadius:99, fontWeight:700,
                display:'flex',alignItems:'center',gap:4,
              }}>
                {scriptWithinTol ? <Check size={12}/> : <AlertTriangle size={12}/>}
                Est {fmtDur(estSec)}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Step content */}
      <div style={{flex:1,overflow:'auto'}}>
        {state.currentStep === 'brief' && (
          <>
            {/* Show saved scripts at the top of the brief step — only when no
                resume banner is showing and nothing is in progress yet. */}
            {!draftFound && !state.brief && !v2SourceTitle && (
              <DraftsList
                workspaceId={workspaceId}
                refreshKey={savedScriptsKey}
                onResume={handleResumeSaved}
              />
            )}
            <Step1Brief
              brand={brand}
              products={products}
              forgedAds={forgedAds}
              items={items}
              onSubmit={handleBriefSubmit}
              state={state}
              setState={setState}
            />
          </>
        )}
        {state.currentStep === 'script' && state.brief && (
          <Step2Script
            brief={state.brief}
            sections={state.script.sections}
            estimatedDurationSec={estSec}
            withinTolerance={scriptWithinTol}
            onUpdate={handleScriptUpdate}
            onApprove={handleScriptApprove}
            onBack={() => setState(prev => ({...prev, currentStep: 'brief'}))}
            onSaveAndExit={handleSaveAndExit}
            brand={brand}
            products={products}
          />
        )}
        {state.currentStep === 'voiceover' && state.brief && (
          <Step3Voiceover
            brief={state.brief}
            sections={state.script.sections}
            voiceoverState={state.voiceover}
            setVoiceoverState={(upd) => setState(prev => ({...prev, voiceover: {...prev.voiceover, ...upd}}))}
            onApprove={handleVoiceoverApprove}
            onBack={() => setState(prev => ({...prev, currentStep: 'script'}))}
          />
        )}
        {state.currentStep === 'music' && (
          <Step3bMusic
            onDecision={handleMusicDecision}
            onBack={() => setState(prev => ({...prev, currentStep: 'voiceover'}))}
            currentUrl={state.music.url}
            currentName={state.music.name}
          />
        )}
        {state.currentStep === 'clips' && state.brief && (
          <Step4Clips
            brief={state.brief}
            sections={state.script.sections}
            // Lift section updates to pipeline state so navigation doesn't lose
            // clip assignments + the draft auto-save captures them.
            setSections={(next) => setState(prev => ({
              ...prev,
              script: { ...prev.script, sections: next },
            }))}
            items={items}
            brand={brand}
            workspaceId={workspaceId}
            voiceoverUrl={state.voiceover.stitchedUrl}
            musicUrl={state.music.url}
            onApprove={handleClipsApprove}
            onBack={() => setState(prev => ({...prev, currentStep: 'music'}))}
          />
        )}
        {state.currentStep === 'review' && state.brief && (
          <Step5Review
            state={state}
            items={items}
            brand={brand}
            workspaceId={workspaceId}
            onSaveForgedAd={async (ad) => {
              const result = await onSaveForgedAd(ad)
              // Draft has served its purpose — ad is saved to the DB, clear the
              // working copy so next "New ad" starts fresh.
              if (result) {
                try { localStorage.removeItem(draftKey) } catch {}
              }
              return result
            }}
            onGoToForged={() => { try { localStorage.removeItem(draftKey) } catch {}; onGoToForged() }}
            onBack={() => setState(prev => ({...prev, currentStep: 'clips'}))}
            onExportState={(exportUpd) => setState(prev => ({...prev, export: {...prev.export, ...exportUpd}}))}
          />
        )}
      </div>
    </div>
  )
}
