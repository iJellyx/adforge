'use client'
import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Check, Mic, Play, Pause, Loader2, Search, AlertTriangle, RefreshCw } from 'lucide-react'
import { C } from '../constants'
import { secColor } from '../utils'
import { Btn, Card, Label, STitle, Chip } from '../ui-primitives'
import {
  type Brief, type ScriptSection, type VoiceoverState,
  fmtDur,
} from './pipeline-types'

export function Step3Voiceover({
  brief,
  sections,
  voiceoverState,
  setVoiceoverState,
  onApprove,
  onBack,
}: {
  brief: Brief
  sections: ScriptSection[]
  voiceoverState: VoiceoverState
  setVoiceoverState: (upd: Partial<VoiceoverState>) => void
  onApprove: (voiceId: string, voiceName: string, stitchedUrl: string, sectionAudioUrls: Record<number, string>, sectionDurations: Record<number, number>, totalDurationSec: number) => void
  onBack: () => void
}) {
  const [voices, setVoices] = useState<any[]>([])
  const [selectedVoice, setSelectedVoice] = useState(voiceoverState.voiceId || '')
  const [voiceSearch, setVoiceSearch] = useState('')
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [progressMsg, setProgressMsg] = useState('')
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)
  const [playingPreview, setPlayingPreview] = useState<string | null>(null)

  const sectionsWithWords = (sections || []).filter((s: ScriptSection) => s.spokenWords?.trim())
  const status = voiceoverState.status
  const selectedVoiceObj = voices.find(v => v.id === selectedVoice)

  // Load voices
  useEffect(() => {
    setLoadingVoices(true)
    fetch('/api/elevenlabs/voices').then(r => r.json()).then(d => {
      if (d.voices && d.voices.length > 0) {
        setVoices(d.voices)
        if (!selectedVoice) setSelectedVoice(d.voices[0].id)
      } else {
        setVoiceError(d.error || 'Check your ELEVENLABS_API_KEY in Vercel Settings')
      }
    }).catch(() => setVoiceError('Could not connect to ElevenLabs')).finally(() => setLoadingVoices(false))
  }, [])

  function previewVoice(url: string, voiceId: string) {
    if (playingPreview === voiceId) {
      previewAudio?.pause()
      setPlayingPreview(null)
      return
    }
    previewAudio?.pause()
    const a = new Audio(url)
    a.onended = () => setPlayingPreview(null)
    a.play().catch(() => {})
    setPreviewAudio(a)
    setPlayingPreview(voiceId)
  }

  async function generateVO(attempt = 0) {
    const currentVoice = selectedVoice
    setVoiceoverState({ status: attempt === 0 ? 'generating' : 'retrying', attempts: attempt, errorMsg: undefined })
    setProgressMsg(attempt === 0 ? 'Generating voiceover...' : `Retrying with different voice (attempt ${attempt + 1} of 3)...`)

    try {
      // 1. Generate per-section audio
      const sectionAudioUrls: Record<number, string> = {}
      for (let i = 0; i < sectionsWithWords.length; i++) {
        const text = sectionsWithWords[i].spokenWords.trim()
        if (!text) continue
        setProgressMsg(`Generating section ${i + 1} of ${sectionsWithWords.length}...`)

        const res = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId: currentVoice }),
        })
        if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`)
        const blob = await res.blob()
        const file = new File([blob], `vo_${i}_${Date.now()}.mp3`, { type: 'audio/mpeg' })
        const fd = new FormData(); fd.append('file', file)
        const upRes = await fetch('/api/voiceover/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        sectionAudioUrls[i] = upData.url || URL.createObjectURL(blob)
      }

      // 2. Stitch
      setProgressMsg('Stitching audio...')
      const sectionUrls = Object.values(sectionAudioUrls)
      let stitchedUrl = sectionUrls[0] || ''
      let totalDurationSec = 0
      let sectionDurations: Record<number, number> = {}

      if (sectionUrls.length > 1) {
        const stitchRes = await fetch('/api/voiceover/stitch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionUrls }),
        })
        const stitchData = await stitchRes.json()
        stitchedUrl = stitchData.url || sectionUrls[0]
        totalDurationSec = stitchData.totalDurationSec || 0
        sectionDurations = stitchData.sectionDurations || {}
      }

      // Estimate total if not returned
      if (!totalDurationSec) {
        totalDurationSec = Object.values(sectionDurations).reduce((a, b) => a + b, 0)
      }
      if (!totalDurationSec) {
        // Rough estimate from word count at 2.5 wps
        totalDurationSec = sectionsWithWords.reduce((sum, s) => sum + (s.spokenWords.trim().split(/\s+/).length / 2.5), 0)
      }

      setProgressMsg('Measuring duration...')

      // 3. Check duration vs target
      const target = brief.targetLengthSec
      const diffPct = Math.abs(totalDurationSec - target) / target

      if (diffPct <= 0.10) {
        // Converged
        setVoiceoverState({
          stitchedUrl,
          sectionAudioUrls,
          sectionDurationSec: sectionDurations,
          totalDurationSec,
          status: 'ready',
          voiceId: currentVoice,
          voiceName: selectedVoiceObj?.name || currentVoice,
        })
        setProgressMsg('')
      } else if (attempt < 2) {
        // Auto-retry with next voice in list
        setProgressMsg(`Duration ${totalDurationSec.toFixed(1)}s is off target (${target}s). Trying a different voice...`)
        const currentIdx = voices.findIndex(v => v.id === currentVoice)
        const nextIdx = (currentIdx + 1) % voices.length
        const nextVoice = voices[nextIdx]
        if (nextVoice && nextVoice.id !== currentVoice) {
          setSelectedVoice(nextVoice.id)
          // Small delay so state updates
          await new Promise(r => setTimeout(r, 200))
          await generateVOWithVoice(nextVoice.id, attempt + 1)
        } else {
          setVoiceoverState({
            stitchedUrl,
            sectionAudioUrls,
            sectionDurationSec: sectionDurations,
            totalDurationSec,
            status: 'failed',
            errorMsg: `Could not converge duration. Got ${totalDurationSec.toFixed(1)}s vs ${target}s target. Try a different voice or edit the script.`,
          })
          setProgressMsg('')
        }
      } else {
        setVoiceoverState({
          stitchedUrl,
          sectionAudioUrls,
          sectionDurationSec: sectionDurations,
          totalDurationSec,
          status: 'failed',
          errorMsg: `Tried 3 voices, still off target (${totalDurationSec.toFixed(1)}s vs ${target}s). Accept the current VO anyway or edit the script.`,
        })
        setProgressMsg('')
      }
    } catch (e: any) {
      setVoiceoverState({ status: 'failed', errorMsg: e.message || 'Voiceover generation failed' })
      setProgressMsg('')
    }
  }

  // Helper that takes a specific voiceId for retry flow
  async function generateVOWithVoice(voiceId: string, attempt: number) {
    setVoiceoverState({ status: 'retrying', attempts: attempt, errorMsg: undefined })
    setProgressMsg(`Retrying with ${voices.find(v => v.id === voiceId)?.name || 'new voice'} (attempt ${attempt + 1} of 3)...`)

    try {
      const sectionAudioUrls: Record<number, string> = {}
      for (let i = 0; i < sectionsWithWords.length; i++) {
        const text = sectionsWithWords[i].spokenWords.trim()
        if (!text) continue
        setProgressMsg(`Generating section ${i + 1} of ${sectionsWithWords.length} (attempt ${attempt + 1})...`)
        const res = await fetch('/api/elevenlabs/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voiceId }) })
        if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`)
        const blob = await res.blob()
        const file = new File([blob], `vo_${i}_${Date.now()}.mp3`, { type: 'audio/mpeg' })
        const fd = new FormData(); fd.append('file', file)
        const upRes = await fetch('/api/voiceover/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        sectionAudioUrls[i] = upData.url || URL.createObjectURL(blob)
      }

      setProgressMsg('Stitching audio...')
      const sectionUrls = Object.values(sectionAudioUrls)
      let stitchedUrl = sectionUrls[0] || ''
      let totalDurationSec = 0
      let sectionDurations: Record<number, number> = {}

      if (sectionUrls.length > 1) {
        const stitchRes = await fetch('/api/voiceover/stitch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sectionUrls }) })
        const stitchData = await stitchRes.json()
        stitchedUrl = stitchData.url || sectionUrls[0]
        totalDurationSec = stitchData.totalDurationSec || 0
        sectionDurations = stitchData.sectionDurations || {}
      }
      if (!totalDurationSec) totalDurationSec = Object.values(sectionDurations).reduce((a, b) => a + b, 0)
      if (!totalDurationSec) totalDurationSec = sectionsWithWords.reduce((sum, s) => sum + (s.spokenWords.trim().split(/\s+/).length / 2.5), 0)

      const target = brief.targetLengthSec
      const diffPct = Math.abs(totalDurationSec - target) / target
      const voiceName = voices.find(v => v.id === voiceId)?.name || voiceId

      if (diffPct <= 0.10) {
        setVoiceoverState({ stitchedUrl, sectionAudioUrls, sectionDurationSec: sectionDurations, totalDurationSec, status: 'ready', voiceId, voiceName })
        setProgressMsg('')
      } else if (attempt < 2) {
        const currentIdx = voices.findIndex(v => v.id === voiceId)
        const nextIdx = (currentIdx + 1) % voices.length
        const nextVoice = voices[nextIdx]
        if (nextVoice && nextVoice.id !== voiceId) {
          setSelectedVoice(nextVoice.id)
          await new Promise(r => setTimeout(r, 200))
          await generateVOWithVoice(nextVoice.id, attempt + 1)
        } else {
          setVoiceoverState({ stitchedUrl, sectionAudioUrls, sectionDurationSec: sectionDurations, totalDurationSec, status: 'failed', errorMsg: `Could not converge. ${totalDurationSec.toFixed(1)}s vs ${target}s.` })
          setProgressMsg('')
        }
      } else {
        setVoiceoverState({ stitchedUrl, sectionAudioUrls, sectionDurationSec: sectionDurations, totalDurationSec, status: 'failed', errorMsg: `Tried 3 voices, still off target (${totalDurationSec.toFixed(1)}s vs ${target}s).` })
        setProgressMsg('')
      }
    } catch (e: any) {
      setVoiceoverState({ status: 'failed', errorMsg: e.message || 'Generation failed' })
      setProgressMsg('')
    }
  }

  function handleApprove() {
    if (!voiceoverState.stitchedUrl || !selectedVoice) return
    onApprove(
      selectedVoice,
      selectedVoiceObj?.name || selectedVoice,
      voiceoverState.stitchedUrl,
      voiceoverState.sectionAudioUrls,
      voiceoverState.sectionDurationSec,
      voiceoverState.totalDurationSec,
    )
  }

  function forceAccept() {
    if (!voiceoverState.stitchedUrl) return
    onApprove(
      selectedVoice,
      selectedVoiceObj?.name || selectedVoice,
      voiceoverState.stitchedUrl,
      voiceoverState.sectionAudioUrls,
      voiceoverState.sectionDurationSec,
      voiceoverState.totalDurationSec,
    )
  }

  const filteredVoices = voices.filter(v => !voiceSearch || v.name.toLowerCase().includes(voiceSearch.toLowerCase()) || (v.gender || '').toLowerCase().includes(voiceSearch.toLowerCase()) || (v.accent || '').toLowerCase().includes(voiceSearch.toLowerCase()))
  const isGenerating = status === 'generating' || status === 'retrying'

  return (
    <div style={{ display: 'flex', gap: 24, maxWidth: 1100, margin: '0 auto', padding: '32px 24px', alignItems: 'flex-start' }}>
      {/* Left -- voice picker */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <STitle size={22}>Choose a voice</STitle>
        <div style={{ fontSize: 13, color: 'var(--af-text-secondary)', marginBottom: 16 }}>
          Pick a voice for your ad. AI will auto-retry up to 3 voices to hit the {brief.targetLengthSec}s target.
        </div>

        {loadingVoices && <div style={{ color: 'var(--af-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading voices...</div>}
        {!loadingVoices && voiceError && voices.length === 0 && (
          <div style={{ background: '#ef444422', border: '1px solid #ef444433', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{voiceError}</div>
        )}

        {!loadingVoices && voices.length > 0 && (
          <>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--af-muted)' }} />
              <input value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)} placeholder="Filter by name, gender, accent..." style={{ width: '100%', background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 8, padding: '8px 12px 8px 30px', color: 'var(--af-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--af-border)', borderRadius: 10 }}>
              {filteredVoices.map((v: any) => {
                const isActive = selectedVoice === v.id
                return (
                  <div key={v.id} onClick={() => setSelectedVoice(v.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', background: isActive ? 'var(--af-accent-soft)' : 'transparent', borderBottom: '1px solid var(--af-border)', transition: 'background 0.1s' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid ' + (isActive ? 'var(--af-accent)' : 'var(--af-border)'), background: isActive ? 'var(--af-accent)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isActive && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? 'var(--af-accent)' : 'var(--af-text)' }}>{v.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--af-muted)' }}>{[v.gender, v.age, v.accent].filter(Boolean).join(' \u00B7 ')}</div>
                    </div>
                    {v.preview_url && (
                      <button onClick={e => { e.stopPropagation(); previewVoice(v.preview_url, v.id) }} style={{ background: 'var(--af-surface)', border: '1px solid var(--af-border)', color: 'var(--af-muted)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {playingPreview === v.id ? <Pause size={10} /> : <Play size={10} />}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Back */}
        <div style={{ marginTop: 20 }}>
          <Btn onClick={onBack} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={14} /> Back to Script
          </Btn>
        </div>
      </div>

      {/* Right -- VO controls */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Mic size={18} color="var(--af-accent)" />
            <div style={{ fontWeight: 700, fontSize: 16 }}>Voiceover</div>
          </div>

          {/* Sections to voice */}
          <div style={{ marginBottom: 16 }}>
            <Label>{sectionsWithWords.length} sections to generate</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sectionsWithWords.map((s, i) => {
                const sc = secColor(s.type)
                const hasAudio = !!voiceoverState.sectionAudioUrls[i]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--af-surface)', borderRadius: 6, border: '1px solid ' + (hasAudio ? 'var(--af-green)' : 'var(--af-border)') }}>
                    <span style={{ background: sc.bg, color: sc.color, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>{s.type}</span>
                    <div style={{ flex: 1, fontSize: 11, color: 'var(--af-muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{s.spokenWords}</div>
                    {hasAudio && <audio src={voiceoverState.sectionAudioUrls[i]} controls style={{ height: 22, width: 100 }} />}
                    {hasAudio && <Check size={12} color="var(--af-green)" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Progress */}
          {isGenerating && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 5, background: 'var(--af-border)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: '60%', background: 'var(--af-accent)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--af-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                {progressMsg}
              </div>
              {voiceoverState.attempts > 0 && (
                <div style={{ fontSize: 11, color: 'var(--af-accent)', marginTop: 4 }}>
                  Attempt {voiceoverState.attempts + 1} of 3
                </div>
              )}
            </div>
          )}

          {/* Error / failed state */}
          {status === 'failed' && voiceoverState.errorMsg && (
            <div style={{ background: '#f59e0b18', border: '1px solid #f59e0b33', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AlertTriangle size={14} color="var(--af-yellow)" />
                <span style={{ fontSize: 12, color: 'var(--af-yellow)', fontWeight: 600 }}>Duration off target</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--af-text-secondary)', marginBottom: 10 }}>{voiceoverState.errorMsg}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {voiceoverState.stitchedUrl && (
                  <Btn onClick={forceAccept} style={{ background: 'var(--af-yellow)', color: '#000', fontSize: 12, padding: '8px 16px' }}>
                    Accept anyway
                  </Btn>
                )}
                <Btn onClick={() => generateVO(0)} style={{ background: 'var(--af-accent-soft)', color: 'var(--af-accent)', border: '1px solid rgba(139,127,255,0.25)', fontSize: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={12} /> Retry manually
                </Btn>
              </div>
            </div>
          )}

          {/* Ready state */}
          {status === 'ready' && voiceoverState.stitchedUrl && (
            <div style={{ marginBottom: 16 }}>
              <audio controls src={voiceoverState.stitchedUrl} style={{ width: '100%', marginBottom: 8 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--af-green)', fontWeight: 700 }}>
                  {fmtDur(voiceoverState.totalDurationSec)}
                </span>
                <span style={{ color: 'var(--af-text-secondary)' }}>
                  of {brief.targetLengthSec}s target
                </span>
                <Check size={14} color="var(--af-green)" />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            {status === 'idle' && (
              <Btn onClick={() => generateVO(0)} disabled={!selectedVoice || isGenerating} style={{ background: 'var(--af-accent)', color: '#fff', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Mic size={14} /> Generate Voiceover
              </Btn>
            )}
            {status === 'ready' && (
              <>
                <Btn onClick={() => generateVO(0)} style={{ background: 'var(--af-surface)', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <RefreshCw size={12} /> Regenerate
                </Btn>
                <Btn onClick={handleApprove} style={{ background: 'var(--af-accent)', color: '#fff', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14 }}>
                  <Check size={14} /> Approve <ChevronRight size={14} />
                </Btn>
              </>
            )}
          </div>
        </Card>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100% { opacity: 0.6 } 50% { opacity: 1 } }`}</style>
    </div>
  )
}
