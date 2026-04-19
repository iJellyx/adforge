'use client'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Wand2, AlertTriangle, Check, Loader2, Scissors, Sparkles, Save } from 'lucide-react'
import { C } from '../constants'
import { callClaude, secColor } from '../utils'
import { Btn, Card, Label, STitle, Chip } from '../ui-primitives'
import type { BrandProfile, Product } from '../types'
import {
  type Brief, type ScriptSection,
  countWords, estimateSectionDuration, estimateScriptDuration,
  isWithinTolerance, fmtDur, wordBudgetFor, WORDS_PER_SECOND,
} from './pipeline-types'

type HookVariation = { type: string; text: string }

export function Step2Script({
  brief,
  sections,
  estimatedDurationSec,
  withinTolerance,
  onUpdate,
  onApprove,
  onBack,
  onSaveAndExit,
  brand,
  products,
}: {
  brief: Brief
  sections: ScriptSection[]
  estimatedDurationSec: number
  withinTolerance: boolean
  onUpdate: (sections: ScriptSection[]) => void
  onApprove: (sections: ScriptSection[]) => void
  onBack: () => void
  onSaveAndExit?: () => void
  brand: BrandProfile
  products?: Product[]
}) {
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null)
  const [trimming, setTrimming] = useState(false)
  const [hookVariations, setHookVariations] = useState<HookVariation[]>([])
  const [selectedHookIdx, setSelectedHookIdx] = useState(0)  // 0 = original
  const [generatingHooks, setGeneratingHooks] = useState(false)
  const [hookError, setHookError] = useState('')

  // Identify the HOOK section
  const hookIdx = useMemo(() => sections.findIndex(s => s.type === 'HOOK'), [sections])
  const hookSection = hookIdx >= 0 ? sections[hookIdx] : null
  const originalHook = hookSection?.spokenWords || ''

  async function generateHookVariations() {
    if (!hookSection) { setHookError('No HOOK section found in script.'); return }
    setGeneratingHooks(true); setHookError('')
    try {
      const prod = products?.find((x: any) => String(x.id) === String(brief.productId)) || null
      const hookWordBudget = Math.max(countWords(originalHook), 8)
      const contextAfterHook = sections
        .filter((_, i) => i !== hookIdx)
        .map(s => `[${s.type}]: ${s.spokenWords}`)
        .join('\n')

      const prompt = `You are writing hooks for a direct response video ad.
Product: ${brand.name || 'the brand'} — ${prod?.description || prod?.name || brief.productName || ''}
Script context (what comes after the hook):
${contextAfterHook}

Original hook (for reference): "${originalHook}"

Generate THREE alternative hooks, each under ${hookWordBudget} words:
1. QUESTION hook — opens with an unexpected question
2. BOLD STATEMENT hook — makes a strong, specific claim
3. PAIN POINT hook — names the customer's frustration directly

Return ONLY valid JSON: { "variations": [{"type":"Question","text":"..."},{"type":"Bold Statement","text":"..."},{"type":"Pain Point","text":"..."}] }`

      const raw = await callClaude([{ role: 'user', content: prompt }], 600)
      const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
      const variations: HookVariation[] = (data.variations || []).map((v: any) => ({
        type: v.type || 'Alt',
        text: (v.text || '').replace(/^["']|["']$/g, '').trim(),
      })).filter((v: HookVariation) => v.text)
      if (variations.length === 0) throw new Error('Claude returned no variations')
      setHookVariations(variations)
      setSelectedHookIdx(0)
    } catch (e: any) {
      console.error('Hook variations failed:', e)
      setHookError('Failed to generate hook variations — try again.')
    }
    setGeneratingHooks(false)
  }

  function applyHook(idx: number) {
    setSelectedHookIdx(idx)
    if (hookIdx < 0) return
    const newText = idx === 0 ? originalHook : hookVariations[idx - 1]?.text
    if (newText == null) return
    const next = sections.map((sec, i) => i === hookIdx ? { ...sec, spokenWords: newText } : sec)
    onUpdate(next)
  }

  // Track the baseline (original) hook text so "Original" card always reflects
  // what the user had before they generated variations. Re-captured when the
  // user generates a fresh set.
  const [originalHookSnapshot, setOriginalHookSnapshot] = useState<string | null>(null)
  async function handleGenerateHooks() {
    // Snapshot the current hook as "Original" option
    setOriginalHookSnapshot(originalHook)
    await generateHookVariations()
  }

  const diff = estimatedDurationSec - brief.targetLengthSec
  const overUnder = diff > 0 ? 'over' : 'under'
  const totalWords = sections.reduce((sum, s) => sum + countWords(s.spokenWords), 0)

  async function rewriteSection(idx: number) {
    setRewritingIdx(idx)
    try {
      const s = sections[idx]
      const sectionWordBudget = Math.round(wordBudgetFor(brief.targetLengthSec) / sections.length)
      const prompt = `Rewrite this ${s.type} section of a direct response video ad for ${brand.name || 'a brand'}. Keep it under ${sectionWordBudget} words. Maintain the same tone, key message, and selling points. Return ONLY the rewritten spoken words -- no JSON, no labels, just the text.\n\nOriginal:\n"${s.spokenWords}"`
      const raw = await callClaude([{ role: 'user', content: prompt }], 400)
      const text = raw.replace(/^["']|["']$/g, '').trim()
      const next = sections.map((sec, i) => i === idx ? { ...sec, spokenWords: text } : sec)
      onUpdate(next)
    } catch (e) {
      console.error('Rewrite failed:', e)
    }
    setRewritingIdx(null)
  }

  async function autoTrim() {
    setTrimming(true)
    try {
      const budget = wordBudgetFor(brief.targetLengthSec)
      const minWords = Math.round(budget * 0.92)
      const maxWords = Math.round(budget * 1.08)

      // Convergence loop — up to 3 attempts. Each attempt tells Claude exactly
      // what went wrong with the previous draft so it over-/under-corrects less.
      let workingSections = sections
      let lastWords = sections.reduce((sum, s) => sum + countWords(s.spokenWords), 0)
      let attempts = 0

      while (attempts < 3) {
        if (lastWords >= minWords && lastWords <= maxWords) break
        attempts++

        const overBy = lastWords - budget
        const direction = overBy > 0 ? 'TOO LONG' : 'TOO SHORT'
        const action = overBy > 0
          ? `Remove exactly ${Math.abs(overBy)} words total by tightening each section — cut filler, combine sentences, keep only the punchiest lines.`
          : `Add exactly ${Math.abs(overBy)} words total by expanding sections with more specific claims, numbers, proof points, or vivid detail. Do not add sections; make existing sections longer.`

        const scriptText = workingSections.map((s) => `[${s.type}]: ${s.spokenWords}`).join('\n')
        const prompt = `An ad script needs to be exactly ${budget} words (acceptable range: ${minWords}-${maxWords}).\nCurrent draft is ${lastWords} words — ${direction} by ${Math.abs(overBy)} words.\n\n${action}\n\nKeep the same section structure (${workingSections.map(s => s.type).join(', ')}), same tone, and same key selling points. Return ONLY valid JSON array:\n[{"type":"HOOK","spokenWords":"new text"},{"type":"PROBLEM","spokenWords":"new text"},...]\n\nCurrent script:\n${scriptText}`

        const raw = await callClaude([{ role: 'user', content: prompt }], 1500)
        const data = JSON.parse(raw.replace(/```json|```/g, '').trim())

        if (!Array.isArray(data) || data.length !== workingSections.length) {
          console.warn('[autoTrim] Claude returned wrong shape — aborting')
          break
        }

        workingSections = workingSections.map((sec, i) => ({ ...sec, spokenWords: data[i].spokenWords || sec.spokenWords }))
        lastWords = workingSections.reduce((sum, s) => sum + countWords(s.spokenWords), 0)
        console.log(`[autoTrim] Attempt ${attempts}: ${lastWords} words (target ${budget}, range ${minWords}-${maxWords})`)
      }

      onUpdate(workingSections)
    } catch (e) {
      console.error('Auto-trim failed:', e)
    }
    setTrimming(false)
  }

  return (
    <div style={{ display: 'flex', gap: 24, maxWidth: 1100, margin: '0 auto', padding: '32px 24px', alignItems: 'flex-start' }}>
      {/* Left column -- editor */}
      <div style={{ flex: 2, minWidth: 0 }}>
        <STitle size={22}>Review your script</STitle>
        <div style={{ fontSize: 13, color: 'var(--af-text-secondary)', marginBottom: 20 }}>
          Edit each section. The script must be within 10% of {brief.targetLengthSec}s to continue.
        </div>

        {/* Hook variations */}
        {hookSection && (
          <Card style={{ marginBottom: 16, background: 'var(--af-accent-soft)', border: '1px solid rgba(139,127,255,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hookVariations.length > 0 ? 12 : 0 }}>
              <Sparkles size={16} color="var(--af-accent)" />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--af-text)' }}>
                <strong>Try different hooks.</strong> Generate 3 variations (Question / Bold Statement / Pain Point).
              </div>
              <button
                onClick={handleGenerateHooks}
                disabled={generatingHooks}
                style={{
                  background: 'var(--af-accent)', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '7px 14px', cursor: generatingHooks ? 'default' : 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6, opacity: generatingHooks ? 0.6 : 1,
                }}
              >
                {generatingHooks
                  ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Sparkles size={12} />}
                {hookVariations.length > 0 ? 'Regenerate' : 'Generate 3 hook variations'}
              </button>
            </div>
            {hookError && (
              <div style={{ fontSize: 12, color: 'var(--af-red)', marginTop: 8 }}>{hookError}</div>
            )}
            {hookVariations.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                {[{ type: 'Original', text: originalHookSnapshot ?? originalHook }, ...hookVariations].map((v, i) => {
                  const active = selectedHookIdx === i
                  return (
                    <button
                      key={i}
                      onClick={() => applyHook(i)}
                      style={{
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        background: active ? 'var(--af-accent)' : 'var(--af-card)',
                        color: active ? '#fff' : 'var(--af-text)',
                        border: '1.5px solid ' + (active ? 'var(--af-accent)' : 'var(--af-border)'),
                        borderRadius: 10, padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: 6,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: active ? 'rgba(255,255,255,0.85)' : 'var(--af-muted)' }}>{v.type}</span>
                        {active && <Check size={11} color="#fff" />}
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                        "{v.text}"
                      </div>
                      <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.75)' : 'var(--af-muted)', marginTop: 2 }}>
                        {active ? 'Using this hook' : 'Click to use'}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {sections.map((s, i) => {
          const sc = secColor(s.type)
          const secDur = estimateSectionDuration(s)
          const wc = countWords(s.spokenWords)
          return (
            <Card key={i} style={{ marginBottom: 12, border: '1px solid ' + sc.bd }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Chip label={s.type} color={sc} />
                <span style={{ fontSize: 11, color: 'var(--af-text-secondary)' }}>
                  {wc} words &middot; ~{secDur.toFixed(1)}s
                </span>
                {s.hookType && (
                  <span style={{ fontSize: 10, color: 'var(--af-muted)', fontStyle: 'italic' }}>({s.hookType})</span>
                )}
              </div>
              <textarea
                value={s.spokenWords}
                onChange={e => {
                  const next = sections.map((sec, idx) => idx === i ? { ...sec, spokenWords: e.target.value } : sec)
                  onUpdate(next)
                }}
                style={{ width: '100%', background: 'transparent', border: '1px solid var(--af-border)', borderRadius: 8, padding: 10, color: 'var(--af-text)', fontSize: 13, lineHeight: 1.6, outline: 'none', fontFamily: 'inherit', minHeight: 80, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => rewriteSection(i)}
                  disabled={rewritingIdx === i}
                  style={{ background: 'none', border: '1px solid var(--af-border)', borderRadius: 8, padding: '5px 12px', cursor: rewritingIdx === i ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--af-accent)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, opacity: rewritingIdx === i ? 0.5 : 1 }}
                >
                  {rewritingIdx === i ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={12} />}
                  Rewrite with AI
                </button>
              </div>
              {s.visualDirection && (
                <div style={{ fontSize: 11, color: 'var(--af-text-secondary)', fontStyle: 'italic', marginTop: 8 }}>
                  Visual: {s.visualDirection}
                </div>
              )}
            </Card>
          )
        })}

        {/* Warning + auto-trim */}
        {!withinTolerance && (
          <div style={{ background: diff > 0 ? '#ef444418' : '#f59e0b18', border: '1px solid ' + (diff > 0 ? '#ef444433' : '#f59e0b33'), borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={16} color={diff > 0 ? 'var(--af-red)' : 'var(--af-yellow)'} />
            <span style={{ flex: 1, fontSize: 13, color: diff > 0 ? 'var(--af-red)' : 'var(--af-yellow)' }}>
              Script is {Math.abs(diff).toFixed(1)}s {overUnder} target. {diff > 0 ? 'Trim to continue.' : 'Expand to continue.'}
            </span>
            <button
              onClick={autoTrim}
              disabled={trimming}
              style={{ background: 'var(--af-accent-soft)', border: '1px solid rgba(139,127,255,0.25)', borderRadius: 8, padding: '6px 14px', cursor: trimming ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--af-accent)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, opacity: trimming ? 0.5 : 1 }}
            >
              {trimming ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Scissors size={12} />}
              Auto-{diff > 0 ? 'trim' : 'expand'}
            </button>
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
          <Btn onClick={onBack} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={14} /> Back
          </Btn>
          <div style={{ flex: 1 }} />
          {onSaveAndExit && (
            <Btn
              onClick={onSaveAndExit}
              style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={14} /> Save script and exit
            </Btn>
          )}
          <Btn
            onClick={() => onApprove(sections)}
            disabled={!withinTolerance}
            style={{ background: withinTolerance ? 'var(--af-accent)' : 'var(--af-card)', color: withinTolerance ? '#fff' : 'var(--af-muted)', display: 'flex', alignItems: 'center', gap: 6, padding: '12px 28px', fontSize: 14 }}
          >
            {withinTolerance ? <Check size={14} /> : <AlertTriangle size={14} />}
            Approve script <ChevronRight size={14} />
          </Btn>
        </div>
        {!withinTolerance && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--af-muted)', marginTop: 4 }}>
            Script length must be within 10% of target to continue.
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>

      {/* Right column -- duration panel (sticky) */}
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ padding: 20, position: 'sticky', top: 80, background: 'var(--af-card)', border: '1px solid var(--af-border)', borderRadius: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Length
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: withinTolerance ? 'var(--af-green)' : 'var(--af-red)', marginBottom: 4 }}>
            {estimatedDurationSec.toFixed(1)}s
          </div>
          <div style={{ fontSize: 13, color: 'var(--af-text-secondary)', marginBottom: 20 }}>
            of {brief.targetLengthSec}s target ({withinTolerance ? 'on target' : 'off target'})
          </div>

          {/* Visual bar */}
          <div style={{ position: 'relative', height: 8, background: 'var(--af-card)', border: '1px solid var(--af-border)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              position: 'absolute', top: 0, left: 0,
              width: `${Math.min(100, (estimatedDurationSec / brief.targetLengthSec) * 100)}%`,
              height: '100%',
              background: withinTolerance ? 'var(--af-green)' : 'var(--af-red)',
              transition: 'all 0.3s',
            }} />
            <div style={{ position: 'absolute', top: 0, left: '100%', transform: 'translateX(-1px)', width: 2, height: '100%', background: 'var(--af-text)' }} />
          </div>

          {/* Tolerance zone */}
          <div style={{ fontSize: 10, color: 'var(--af-muted)', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>Acceptable: {(brief.targetLengthSec * 0.9).toFixed(1)}s - {(brief.targetLengthSec * 1.1).toFixed(1)}s</span>
          </div>

          {/* Words summary */}
          <div style={{ fontSize: 12, color: 'var(--af-text-secondary)', marginBottom: 16, padding: '8px 10px', background: 'var(--af-surface)', borderRadius: 8 }}>
            {totalWords} words &middot; Budget: ~{wordBudgetFor(brief.targetLengthSec)}
          </div>

          {/* Per-section breakdown */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, marginTop: 4 }}>
            Breakdown
          </div>
          {sections.map((s, i) => {
            const sc = secColor(s.type)
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--af-border)' }}>
                <span style={{ color: sc.color, fontWeight: 600 }}>{s.type}</span>
                <span style={{ color: 'var(--af-text-secondary)' }}>{estimateSectionDuration(s).toFixed(1)}s</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
