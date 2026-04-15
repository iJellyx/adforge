'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Wand2, AlertTriangle, Check, Loader2, Scissors } from 'lucide-react'
import { C } from '../constants'
import { callClaude, secColor } from '../utils'
import { Btn, Card, Label, STitle, Chip } from '../ui-primitives'
import type { BrandProfile } from '../types'
import {
  type Brief, type ScriptSection,
  countWords, estimateSectionDuration, estimateScriptDuration,
  isWithinTolerance, fmtDur, wordBudgetFor, WORDS_PER_SECOND,
} from './pipeline-types'

export function Step2Script({
  brief,
  sections,
  estimatedDurationSec,
  withinTolerance,
  onUpdate,
  onApprove,
  onBack,
  brand,
}: {
  brief: Brief
  sections: ScriptSection[]
  estimatedDurationSec: number
  withinTolerance: boolean
  onUpdate: (sections: ScriptSection[]) => void
  onApprove: (sections: ScriptSection[]) => void
  onBack: () => void
  brand: BrandProfile
}) {
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null)
  const [trimming, setTrimming] = useState(false)

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
      const scriptText = sections.map((s, i) => `[${s.type}]: ${s.spokenWords}`).join('\n')
      const prompt = `This ad script is ${Math.abs(diff).toFixed(1)}s ${overUnder} the ${brief.targetLengthSec}s target (currently ${totalWords} words, need ~${budget} words).\n\nTrim or expand each section to hit the word budget while keeping the same structure, tone, and key selling points. Return ONLY valid JSON array:\n[{"type":"HOOK","spokenWords":"trimmed text"},{"type":"PROBLEM","spokenWords":"trimmed text"},...]\n\nCurrent script:\n${scriptText}`
      const raw = await callClaude([{ role: 'user', content: prompt }], 1500)
      const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (Array.isArray(data) && data.length === sections.length) {
        const next = sections.map((sec, i) => ({ ...sec, spokenWords: data[i].spokenWords || sec.spokenWords }))
        onUpdate(next)
      }
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
        <div style={{ fontSize: 13, color: 'var(--af-text-secondary)', marginBottom: 24 }}>
          Edit each section. The script must be within 10% of {brief.targetLengthSec}s to continue.
        </div>

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
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <Btn onClick={onBack} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={14} /> Back
          </Btn>
          <div style={{ flex: 1 }} />
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
