'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, X, Sparkles, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { callClaude } from './utils'
import { STAGES } from './constants'
import type { Brief, ScriptSection } from './pipeline/pipeline-types'
import type { BrandProfile, Product, Item, ForgedAd } from './types'
import type { VoiceMeta } from './VoicePicker'

type StepKey = 'script' | 'voiceover' | 'music' | 'clips' | 'save'

type StepDef = { key: StepKey; label: string; activeLabel: string }
const STEPS: StepDef[] = [
  { key: 'script', label: 'Wrote your script', activeLabel: 'Writing your script…' },
  { key: 'voiceover', label: 'Recorded the voiceover', activeLabel: 'Recording the voiceover…' },
  { key: 'music', label: 'Picked the music', activeLabel: 'Picking music…' },
  { key: 'clips', label: 'Matched footage from your Stash', activeLabel: 'Matching footage from your Stash…' },
  { key: 'save', label: 'Saved your ad', activeLabel: 'Saving…' },
]

type Status = 'pending' | 'active' | 'done' | 'failed' | 'skipped'

const WORDS_PER_SECOND = 2.5

type Props = {
  brief: Brief
  brand: BrandProfile
  products: Product[]
  items: Item[]
  workspaceId: string
  voice: VoiceMeta
  onCancel: () => void
  onComplete: (ad: ForgedAd) => void
}

/**
 * Orchestrates a complete ad generation in one screen with a progressive
 * checklist UI. Reuses the existing endpoints (Claude, ElevenLabs, Pixabay)
 * directly so behaviour matches the multi-step pipeline this replaces.
 *
 * Failures in any step (other than save) downgrade to "skipped" and the
 * user is dropped into AdStudio with a banner so they can fix from there
 * — better than dumping them back to a brief screen.
 */
export function GenerationFlow({ brief, brand, products, items, workspaceId, voice, onCancel, onComplete }: Props) {
  const supabase = createClient()
  const [statuses, setStatuses] = useState<Record<StepKey, Status>>({
    script: 'pending', voiceover: 'pending', music: 'pending', clips: 'pending', save: 'pending',
  })
  const [substatus, setSubstatus] = useState('')
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const ranRef = useRef(false)

  function set(key: StepKey, s: Status) {
    setStatuses(prev => ({ ...prev, [key]: s }))
  }
  function warn(msg: string) {
    setWarnings(prev => [...prev, msg])
    console.warn('[GenerationFlow]', msg)
  }

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    run().catch(e => {
      console.error('[GenerationFlow] fatal:', e)
      setFatalError(e?.message || 'Something went wrong. Try again.')
    })
  }, [])

  async function run() {
    // ── 1. Script ─────────────────────────────────────────────────────────
    set('script', 'active')
    setSubstatus('')
    const sections = await generateScript()
    set('script', 'done')

    // ── 2. Voiceover ──────────────────────────────────────────────────────
    set('voiceover', 'active')
    let voiceoverUrl: string | null = null
    let perSectionAudios: Record<number, { url: string; durationSec: number }> = {}
    try {
      perSectionAudios = await generateVoiceover(sections)
      voiceoverUrl = await stitchVoiceover(perSectionAudios, sections.length)
      set('voiceover', 'done')
    } catch (e: any) {
      warn('Voiceover step failed — you can re-voice from the Audio tab. (' + (e?.message || 'unknown') + ')')
      set('voiceover', 'skipped')
    }

    // Adjust section timings if VO succeeded — using actual audio durations
    if (Object.keys(perSectionAudios).length) {
      sections.forEach((s, i) => {
        const a = perSectionAudios[i]
        if (a) (s as any).actualVoDurationSec = a.durationSec
      })
    }

    // ── 3. Music ──────────────────────────────────────────────────────────
    set('music', 'active')
    let musicUrl: string | null = null
    let musicName: string | null = null
    try {
      const mood = guessMood(sections)
      const mus = await pickMusic(mood)
      musicUrl = mus.url
      musicName = mus.name
      set('music', 'done')
    } catch (e: any) {
      warn('Music step failed — pick music from the Audio tab. (' + (e?.message || 'unknown') + ')')
      set('music', 'skipped')
    }

    // ── 4. Clips ──────────────────────────────────────────────────────────
    set('clips', 'active')
    let clipMatchedSections = sections
    try {
      const matched = await matchClips(sections, !!voiceoverUrl)
      clipMatchedSections = matched
      const unmatched = matched.filter(s => !s.selectedClipId).length
      if (unmatched > 0) warn(`AI couldn't match clips for ${unmatched} of ${matched.length} sections — pick them from the Clips tab.`)
      set('clips', 'done')
    } catch (e: any) {
      warn('Clip matching failed — assign clips from the Clips tab. (' + (e?.message || 'unknown') + ')')
      set('clips', 'skipped')
    }

    // ── 5. Save ───────────────────────────────────────────────────────────
    set('save', 'active')
    const ad = buildAd(clipMatchedSections, voiceoverUrl, musicUrl, musicName)
    set('save', 'done')

    // Brief settle so the user sees "all green" before navigating
    await new Promise(r => setTimeout(r, 500))
    onComplete(ad)
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  async function generateScript(): Promise<ScriptSection[]> {
    const prod = products.find((p: Product) => String((p as any).id) === String(brief.productId)) || null
    const stage = STAGES.find(s => s.value === brief.awarenessStage) || STAGES[0]
    const wordBudget = Math.round(brief.targetLengthSec * WORDS_PER_SECOND)
    const minWords = Math.round(wordBudget * 0.92)
    const maxWords = Math.round(wordBudget * 1.08)

    let ctx = `BRAND:\nName: ${brand.name || 'Unknown'}\nDescription: ${brand.description || ''}\nVoice & Tone: ${brand.voice || ''}\nTarget Customer: ${brand.target_customer || ''}\nSocial Proof / Reviews: ${brand.reviews || ''}\nAdditional Info: ${brand.additional_info || ''}\n\n`
    if (prod) ctx += `PRODUCT:\nName: ${prod.name}\nDescription: ${prod.description || ''}\nKey Benefits: ${prod.benefits || ''}\nClaims & Results: ${prod.claims || ''}\nDifferentiators: ${prod.differentiators || ''}\nKey Ingredients: ${prod.ingredients || ''}\nReviews: ${prod.reviews || ''}\nPrice: ${prod.price || ''}\nNotes: ${prod.notes || ''}\n\n`

    const basePrompt = ctx +
      `SCRIPT REQ:\nContent type: ${brief.contentType}\nTarget duration: ${brief.targetLengthSec} seconds\nSTRICT WORD COUNT: ${wordBudget} words total (must be between ${minWords} and ${maxWords})\nStage: ${stage.label} -- ${stage.desc}\nCustomer: ${brief.customerAvatar || brand.target_customer || ''}\nPains: ${brief.painPoints || ''}\nDesires: ${brief.desires || ''}\nObjections: ${brief.objections || ''}\nRequest: ${brief.request || ''}\n` +
      `Voice persona: ${voice.name} (${[voice.gender, voice.accent].filter(Boolean).join(', ') || 'general'}). Write words this voice would say naturally.\n\n` +
      `Write a direct response video ad script. The TOTAL SPOKEN WORDS across all sections combined MUST land between ${minWords} and ${maxWords} words (target: ${wordBudget}). Use specific brand/product details. Return ONLY valid JSON:\n` +
      `{"sections":[{"id":1,"type":"HOOK","spokenWords":"exact words","visualDirection":"what is on screen","hookType":"Question"}],"suggested_music_mood":"Uplifting"}\n` +
      `Section types: HOOK, PROBLEM, AGITATE, SOLUTION, SOCIAL PROOF, CTA.`

    let sections: ScriptSection[] = []
    let lastWords = 0
    for (let attempt = 1; attempt <= 3; attempt++) {
      setSubstatus(attempt === 1 ? 'Drafting script…' : `Adjusting length (attempt ${attempt})…`)
      let prompt = basePrompt
      if (attempt > 1 && sections.length > 0) {
        const diff = lastWords - wordBudget
        const direction = diff < 0 ? `TOO SHORT by ${Math.abs(diff)} words` : `TOO LONG by ${diff} words`
        prompt += `\n\nIMPORTANT: Your previous draft was ${lastWords} words (${direction}). Rewrite to hit exactly ${wordBudget} words, within ${minWords}-${maxWords}.${diff < 0 ? ' EXPAND existing sections.' : ' TIGHTEN existing sections.'}`
      }
      const raw = await callClaude([{ role: 'user', content: prompt }], 2000)
      const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
      sections = (data.sections || []).map((s: any, i: number) => ({
        ...s,
        id: String(Date.now() + i),
        matchedClipIds: [],
        selectedClipId: null,
      }))
      lastWords = sections.reduce((sum: number, s: any) => sum + (s.spokenWords || '').trim().split(/\s+/).filter(Boolean).length, 0)
      if (lastWords >= minWords && lastWords <= maxWords) break
    }
    return sections
  }

  async function generateVoiceover(sections: ScriptSection[]): Promise<Record<number, { url: string; durationSec: number }>> {
    const result: Record<number, { url: string; durationSec: number }> = {}
    const withWords = sections.map((s, i) => ({ s, i })).filter(({ s }) => (s.spokenWords || '').trim())
    for (let k = 0; k < withWords.length; k++) {
      const { s, i } = withWords[k]
      setSubstatus(`Voicing section ${k + 1} of ${withWords.length}…`)
      const tts = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: s.spokenWords, voiceId: voice.id }),
      })
      if (!tts.ok) throw new Error(`TTS failed (${tts.status})`)
      const blob = await tts.blob()
      const file = new File([blob], `vo_${i}_${Date.now()}.mp3`, { type: 'audio/mpeg' })
      const fd = new FormData(); fd.append('file', file)
      const up = await fetch('/api/voiceover/upload', { method: 'POST', body: fd })
      const upData = await up.json()
      const url = upData.url
      // Probe duration via a temporary <audio>
      const dur = await probeDuration(url)
      result[i] = { url, durationSec: dur }
    }
    return result
  }

  async function probeDuration(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const a = new Audio()
      a.preload = 'metadata'
      a.src = url
      a.addEventListener('loadedmetadata', () => resolve(a.duration || 0))
      a.addEventListener('error', () => reject(new Error('audio probe failed')))
      // Don't hang forever
      setTimeout(() => resolve(0), 8000)
    })
  }

  async function stitchVoiceover(perSection: Record<number, { url: string; durationSec: number }>, total: number): Promise<string | null> {
    const ordered = Array.from({ length: total }, (_, i) => perSection[i]?.url).filter(Boolean) as string[]
    if (!ordered.length) return null
    setSubstatus('Stitching voiceover…')
    const res = await fetch('/api/voiceover/stitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ordered }),
    })
    if (!res.ok) {
      // Stitching is best-effort — fall back to first segment so playback still works
      return ordered[0]
    }
    const data = await res.json()
    return data.url || ordered[0]
  }

  function guessMood(sections: ScriptSection[]): string {
    // Cheap heuristic; user can switch in the Audio tab.
    const txt = sections.map(s => (s as any).spokenWords || '').join(' ').toLowerCase()
    if (/(stress|tired|frustrated|hate|stuck|fail)/.test(txt)) return 'inspirational'
    if (/(fast|quick|now|today|instant)/.test(txt)) return 'upbeat'
    if (/(love|happy|smile|joy|fun)/.test(txt)) return 'happy'
    return 'corporate'
  }

  async function pickMusic(mood: string): Promise<{ url: string; name: string }> {
    setSubstatus(`Searching ${mood} music…`)
    const res = await fetch('/api/pixabay/music?q=' + encodeURIComponent(mood))
    if (!res.ok) throw new Error(`Pixabay error ${res.status}`)
    const data = await res.json()
    const tracks = data.tracks || data.hits || []
    if (!tracks.length) throw new Error('No music tracks returned')
    const t = tracks[0]
    return { url: t.audio || t.url || t.preview || t.audio_url, name: t.title || t.name || 'Background music' }
  }

  async function matchClips(sections: ScriptSection[], hasVO: boolean): Promise<ScriptSection[]> {
    const clips = items.filter(i => i.mux_playback_id)
    if (clips.length === 0) {
      sections.forEach(s => { (s as any).matchedClipIds = []; (s as any).selectedClipId = null })
      throw new Error('Stash is empty — upload clips first')
    }
    setSubstatus('Asking AI to match clips…')

    const classify = (item: any): 'BROLL' | 'TALKING_HEAD' | 'MIXED' => {
      const a = item.analysis || {}
      const tags = (a.scene_tags || []).join(' ').toLowerCase()
      const ct = (a.content_type || '').toLowerCase()
      const isTH = tags.includes('talking head') || tags.includes('person speaking') || ct === 'talking head'
      const isBroll = tags.includes('product') || tags.includes('demo') || tags.includes('lifestyle') || tags.includes('b-roll') || ct.includes('product demo')
      return isBroll ? 'BROLL' : isTH ? 'TALKING_HEAD' : 'MIXED'
    }

    const nonTH = clips.filter(i => classify(i) !== 'TALKING_HEAD')
    const pool = hasVO && nonTH.length >= 4 ? nonTH : clips

    const libSummary = pool.map(item => {
      const a = item.analysis || {}
      return 'ID:' + item.id + '|class:' + classify(item) + '|content:' + (a.content_type || '') + '|tags:' + (a.scene_tags || []).join(',') + '|summary:' + (a.summary || item.description || '').substring(0, 120) + '|dur:' + (item.duration_seconds || '?')
    }).join('\n')

    const sectionDesc = sections.map((s: any, i) => {
      const reqDur = s.actualVoDurationSec || s.targetDurationSec || 3
      return `Section ${i} [${s.type}]: spoken="${(s.spokenWords || '').substring(0, 120)}" required_duration=${reqDur.toFixed(1)}s`
    }).join('\n')

    const prompt = `Match ONE clip to each script section. Each clip's duration must be >= the section's required_duration.\n\nSCRIPT:\n${sectionDesc}\n\nLIBRARY (${pool.length}):\n${libSummary}\n\nRules: 1 clip per section, no reuse, prefer BROLL when voiceover present, give 2 alternates.\nReturn ONLY JSON: [{"section":0,"best_id":"uuid","alt_ids":["a","b"]}]`

    const raw = await callClaude([{ role: 'user', content: prompt }], 1500)
    const matches = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const validIds = new Set(items.map(i => i.id))
    const usedIds = new Set<string>()

    return sections.map((s: any, i: number) => {
      const m = matches.find((x: any) => x.section === i)
      if (!m) return { ...s, matchedClipIds: [], selectedClipId: null }
      const reqDur = s.actualVoDurationSec || s.targetDurationSec || 3
      const candidates = [m.best_id, ...(m.alt_ids || [])].filter((id: string) => id && validIds.has(id) && !usedIds.has(id))
      const longEnough = candidates.filter((id: string) => {
        const it = items.find(x => x.id === id)
        return it && (it.duration_seconds || 0) >= reqDur
      })
      const final = longEnough.length ? longEnough : candidates
      const clipId = final[0] || null
      if (clipId) usedIds.add(clipId)
      const item = clipId ? items.find(x => x.id === clipId) : null
      const trimStart = item?.start_seconds || 0
      const trimEnd = trimStart + reqDur
      return {
        ...s,
        matchedClipIds: candidates,
        selectedClipId: clipId,
        trimStart,
        trimEnd,
        clipSegments: clipId ? [{ id: 'seg-' + i + '-0', clipId, trimStart, trimEnd }] : [],
      }
    })
  }

  function buildAd(sections: ScriptSection[], voiceoverUrl: string | null, musicUrl: string | null, musicName: string | null): ForgedAd {
    // Build the ad object — the parent (ScriptsTab via onSaveForgedAd) handles
    // the actual DB insert so we don't double-write or duplicate the
    // background scoring fetch that lives there.
    const prod = products.find((p: Product) => String((p as any).id) === String(brief.productId))
    const baseTitle = `${prod?.name || 'New Ad'} — ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    return {
      id: '',
      title: baseTitle,
      status: 'draft',
      mode: 'script',
      sections: sections as any,
      voiceover_url: voiceoverUrl || undefined,
      voiceover_voice: voice.name,
      music_url: musicUrl || undefined,
      music_name: musicName || undefined,
      metadata: {
        brief,
        voiceId: voice.id,
        aspectRatio: '9:16',
        captionSettings: { enabled: false, style: 'word', accentColor: '#FFD400', fontSize: 64 },
        generatedAt: new Date().toISOString(),
      },
    } as ForgedAd
  }

  // ── Render ────────────────────────────────────────────────────────────

  const C = {
    bg: 'var(--af-bg)', card: 'var(--af-card)', border: 'var(--af-border)',
    text: 'var(--af-text)', muted: 'var(--af-text-secondary)',
    accent: 'var(--af-accent)', accentSoft: 'var(--af-accent-soft)',
    green: 'var(--af-green)', greenSoft: 'var(--af-green-soft)',
    red: 'var(--af-red)', redSoft: 'var(--af-red-soft)',
    yellow: 'var(--af-yellow)',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'inherit', color: C.text }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#8B7FFF,#5B49FF)', boxShadow: '0 8px 20px rgba(139,127,255,0.4)' }}>
            <Sparkles size={22} color="#fff" strokeWidth={2.5} />
          </span>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>Forging your ad…</div>
        </div>

        {/* Step list */}
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: 22 }}>
          {STEPS.map((step, i) => {
            const status = statuses[step.key]
            const isActive = status === 'active'
            const isDone = status === 'done'
            const isSkipped = status === 'skipped'
            const label = isActive ? step.activeLabel : (isSkipped ? `Skipped ${step.label.toLowerCase()}` : step.label)
            return (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', opacity: status === 'pending' ? 0.4 : 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: isDone ? C.greenSoft : isActive ? C.accentSoft : isSkipped ? C.redSoft : C.bg, border: '1px solid ' + (isDone ? C.green : isActive ? C.accent : isSkipped ? C.red : C.border), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isDone ? <Check size={13} color={C.green} strokeWidth={3} /> : isActive ? <Loader2 size={12} color={C.accent} className="afspin" style={{ animation: 'afspin 1s linear infinite' }} /> : isSkipped ? <X size={12} color={C.red} strokeWidth={3} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.muted }} />}
                </div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 700 : 500 }}>{label}</div>
                {isActive && substatus && <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{substatus}</div>}
              </div>
            )
          })}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={{ marginTop: 14, background: C.bg, border: '1px solid ' + C.border, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>
              <AlertTriangle size={13} /> A couple of things to fix in the studio
            </div>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>• {w}</div>
            ))}
          </div>
        )}

        {/* Fatal */}
        {fatalError && (
          <div style={{ marginTop: 14, background: C.redSoft, border: '1px solid rgba(248,113,113,0.25)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 6 }}>Generation failed</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{fatalError}</div>
            <button onClick={onCancel} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Back to brief</button>
          </div>
        )}

        {/* Cancel always available */}
        {!fatalError && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes afspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
