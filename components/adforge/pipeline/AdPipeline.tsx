'use client'
import { useState, useMemo, useCallback } from 'react'
import { Check, ChevronLeft, AlertTriangle, Lock } from 'lucide-react'
import { C } from '../constants'
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
}: {
  items: Item[]
  brand: BrandProfile
  products: Product[]
  forgedAds: ForgedAd[]
  workspaceId: string
  onSaveForgedAd: (ad: Omit<ForgedAd,'id'>) => Promise<ForgedAd | null>
  onGoToForged: () => void
  onBack: () => void
}) {
  const [state, setState] = useState<PipelineState>(() => createInitialPipelineState())

  // Compute step statuses for progress bar
  const stepStatuses = useMemo(() => {
    const s = state
    const statuses: Record<StepId, 'locked' | 'pending' | 'active' | 'complete' | 'dirty'> = {
      brief:     s.brief ? 'complete' : 'active',
      script:    s.script.approved ? 'complete' : (s.brief ? 'pending' : 'locked'),
      voiceover: s.voiceover.status === 'approved' ? 'complete' : (s.script.approved ? 'pending' : 'locked'),
      music:     s.music.decision !== 'pending' ? 'complete' : (s.voiceover.status === 'approved' ? 'pending' : 'locked'),
      clips:     s.clips.approved ? 'complete' : (s.music.decision !== 'pending' ? 'pending' : 'locked'),
      review:    s.export.renderStatus === 'ready' ? 'complete' : (s.clips.approved ? 'pending' : 'locked'),
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
      currentStep: 'music',
    }))
  }

  const handleMusicDecision = (decision: 'yes' | 'no', url?: string, name?: string) => {
    setState(prev => ({
      ...prev,
      music: { decision, url: decision === 'yes' ? (url || null) : null, name: decision === 'yes' ? (name || null) : null },
      currentStep: 'clips',
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
      currentStep: 'review',
    }))
  }

  const briefCtx = state.brief
  const targetSec = briefCtx?.targetLengthSec || 30
  const estSec = state.script.estimatedDurationSec
  const scriptWithinTol = briefCtx ? isWithinTolerance(estSec, targetSec) : false

  // ---- Render ----
  return (
    <div style={{minHeight:'100vh',background:'var(--af-bg)',display:'flex',flexDirection:'column'}}>

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
          <Step1Brief
            brand={brand}
            products={products}
            forgedAds={forgedAds}
            items={items}
            onSubmit={handleBriefSubmit}
            state={state}
            setState={setState}
          />
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
            brand={brand}
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
            onSaveForgedAd={onSaveForgedAd}
            onGoToForged={onGoToForged}
            onBack={() => setState(prev => ({...prev, currentStep: 'clips'}))}
            onExportState={(exportUpd) => setState(prev => ({...prev, export: {...prev.export, ...exportUpd}}))}
          />
        )}
      </div>
    </div>
  )
}
