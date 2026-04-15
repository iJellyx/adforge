// Shared types for the 5-step ad creation pipeline.

export type StepId = 'brief' | 'script' | 'voiceover' | 'music' | 'clips' | 'review'

export type StepStatus = 'locked' | 'pending' | 'active' | 'complete' | 'dirty'

export const STEPS: {id:StepId; label:string; shortLabel:string}[] = [
  { id: 'brief',     label: 'Brief',      shortLabel: '1. Brief' },
  { id: 'script',    label: 'Script',     shortLabel: '2. Script' },
  { id: 'voiceover', label: 'Voiceover',  shortLabel: '3. Voiceover' },
  { id: 'music',     label: 'Music',      shortLabel: '4. Music' },
  { id: 'clips',     label: 'Clips',      shortLabel: '5. Clips' },
  { id: 'review',    label: 'Review',     shortLabel: '6. Review' },
]

export type Brief = {
  productId: string
  productName: string
  awarenessStage: string
  contentType: string
  targetLengthSec: number  // 15, 30, 45, 60, 90
  customerAvatar: string
  painPoints?: string
  desires?: string
  objections?: string
  request?: string
}

export type ScriptSection = {
  id?: string
  type: string                        // HOOK, PROBLEM, AGITATE, SOLUTION, SOCIAL PROOF, BODY, CTA
  spokenWords: string
  visualDirection: string
  hookType?: string
  // Computed at step 2, locked at step 3:
  targetDurationSec?: number          // based on word count / 2.5 wps
  // Computed at step 3 after VO is generated, from Deepgram timestamps:
  actualVoDurationSec?: number
  // Set at step 4 when a clip is matched:
  selectedClipId?: string
  clipSegments?: any[]                // legacy compatibility
  matchedClipIds?: string[]
  trimStart?: number
  trimEnd?: number
}

export type VoiceoverState = {
  voiceId: string | null
  voiceName: string | null
  stitchedUrl: string | null
  sectionAudioUrls: Record<number, string>  // sectionIdx -> url
  sectionDurationSec: Record<number, number>
  totalDurationSec: number
  attempts: number                    // auto-retry counter (max 2)
  status: 'idle' | 'generating' | 'retrying' | 'ready' | 'failed' | 'approved'
  errorMsg?: string
}

export type MusicState = {
  decision: 'pending' | 'yes' | 'no'  // pending = haven't answered the prompt
  url: string | null
  name: string | null
}

export type ClipSlotState = {
  sectionIdx: number
  requiredDurationSec: number
  clipId: string | null
  sourceItemId?: string                // if we extracted from an original
  trimStart: number | null
  trimEnd: number | null
  status: 'ok' | 'missing' | 'needs_attention'
  message?: string
}

export type PipelineState = {
  currentStep: StepId
  brief: Brief | null
  script: {
    sections: ScriptSection[]
    approved: boolean
    estimatedDurationSec: number       // from word count
  }
  voiceover: VoiceoverState
  music: MusicState
  clips: {
    slots: ClipSlotState[]
    approved: boolean
  }
  export: {
    renderId: string | null
    renderStatus: 'idle' | 'queued' | 'rendering' | 'ready' | 'failed'
    renderUrl: string | null
  }
  // UI flags
  busy: boolean
  errorMsg: string | null
}

export const WORDS_PER_SECOND = 2.5
export const DURATION_TOLERANCE = 0.10  // ±10% strict gate

// Compute the target number of words for a given target duration.
export function wordBudgetFor(durationSec: number): number {
  return Math.round(durationSec * WORDS_PER_SECOND)
}

// Count words in a string.
export function countWords(s: string): number {
  return (s || '').trim().split(/\s+/).filter(Boolean).length
}

// Estimated duration for a script section (if VO not yet generated).
export function estimateSectionDuration(section: ScriptSection): number {
  return countWords(section.spokenWords) / WORDS_PER_SECOND
}

// Total estimated duration across all sections.
export function estimateScriptDuration(sections: ScriptSection[]): number {
  return sections.reduce((sum, s) => sum + estimateSectionDuration(s), 0)
}

// Is the given actual duration within tolerance of target?
export function isWithinTolerance(actualSec: number, targetSec: number): boolean {
  const diff = Math.abs(actualSec - targetSec)
  return diff / targetSec <= DURATION_TOLERANCE
}

// Pretty duration e.g. "28.3s"
export function fmtDur(sec: number): string {
  return `${sec.toFixed(1)}s`
}

// Initial pipeline state factory.
export function createInitialPipelineState(): PipelineState {
  return {
    currentStep: 'brief',
    brief: null,
    script: { sections: [], approved: false, estimatedDurationSec: 0 },
    voiceover: {
      voiceId: null,
      voiceName: null,
      stitchedUrl: null,
      sectionAudioUrls: {},
      sectionDurationSec: {},
      totalDurationSec: 0,
      attempts: 0,
      status: 'idle',
    },
    music: { decision: 'pending', url: null, name: null },
    clips: { slots: [], approved: false },
    export: { renderId: null, renderStatus: 'idle', renderUrl: null },
    busy: false,
    errorMsg: null,
  }
}
