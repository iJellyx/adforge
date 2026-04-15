'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Film, Mic, Music, FileText, Scissors, Settings, Check } from 'lucide-react'
import { C } from '../constants'
import { secColor, muxThumb } from '../utils'
import { Btn, Card, Label, STitle, Input, Chip } from '../ui-primitives'
import { StitchedPreview } from '../StitchedPreview'
import { ExportVideo } from '../ExportVideo'
import type { Item, BrandProfile } from '../types'
import { type PipelineState, fmtDur } from './pipeline-types'

const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:5']

export function Step5Review({
  state,
  items,
  brand,
  workspaceId,
  onSaveForgedAd,
  onGoToForged,
  onBack,
  onExportState,
}: {
  state: PipelineState
  items: Item[]
  brand: BrandProfile
  workspaceId: string
  onSaveForgedAd: (ad: any) => Promise<any>
  onGoToForged: () => void
  onBack: () => void
  onExportState: (upd: any) => void
}) {
  const [adTitle, setAdTitle] = useState('')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [saved, setSaved] = useState(false)

  const brief = state.brief!
  const sections = state.script.sections
  const voiceoverUrl = state.voiceover.stitchedUrl
  const musicUrl = state.music.url
  const totalDur = state.voiceover.totalDurationSec || state.script.estimatedDurationSec

  async function handleSave() {
    const stageWords = (brief.awarenessStage || 'problem_aware').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
    const autoName = `${stageWords}_${brief.contentType || 'UGC'}_${brief.targetLengthSec}s`
    const title = adTitle.trim() || autoName

    const adData = {
      title,
      status: 'complete' as const,
      mode: 'script' as const,
      sections,
      voiceover_url: voiceoverUrl,
      voiceover_voice: state.voiceover.voiceName,
      music_url: musicUrl,
      music_name: state.music.name,
      metadata: {
        contentType: brief.contentType,
        adLength: brief.targetLengthSec + ' seconds',
        awarenessStage: brief.awarenessStage,
        productName: brief.productName,
        aspectRatio,
      },
    }

    const result = await onSaveForgedAd(adData)
    if (result) {
      setSaved(true)
    }
    return result?.id || null
  }

  const assignedCount = sections.filter(s => s.selectedClipId).length

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
      <STitle size={24}>Review & Export</STitle>
      <div style={{ fontSize: 14, color: 'var(--af-text-secondary)', marginBottom: 28 }}>
        Preview your finished ad, then export as MP4.
      </div>

      {/* Big preview */}
      <div style={{ marginBottom: 28 }}>
        <StitchedPreview
          sections={sections}
          libraryItems={items}
          voiceoverUrl={voiceoverUrl}
          musicUrl={musicUrl}
          fullWidth
        />
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        {/* Script summary */}
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <FileText size={14} color="var(--af-accent)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--af-text)' }}>Script</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--af-text-secondary)' }}>
            {sections.length} sections &middot; {fmtDur(totalDur)}
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {sections.map((s, i) => <Chip key={i} label={s.type} color={secColor(s.type)} />)}
          </div>
        </Card>

        {/* Voiceover summary */}
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Mic size={14} color="var(--af-green)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--af-text)' }}>Voiceover</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--af-text-secondary)' }}>
            {state.voiceover.voiceName || 'AI Voice'} &middot; {fmtDur(state.voiceover.totalDurationSec)}
          </div>
          {voiceoverUrl && <audio src={voiceoverUrl} controls style={{ width: '100%', height: 24, marginTop: 6 }} />}
        </Card>

        {/* Music summary */}
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Music size={14} color="var(--af-accent)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--af-text)' }}>Music</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--af-text-secondary)' }}>
            {state.music.decision === 'yes' ? (state.music.name || 'Selected') : 'No music'}
          </div>
        </Card>

        {/* Clips summary */}
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Film size={14} color="var(--af-accent)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--af-text)' }}>Clips</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--af-text-secondary)' }}>
            {assignedCount}/{sections.length} assigned
          </div>
        </Card>

        {/* Settings */}
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Settings size={14} color="var(--af-muted)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--af-text)' }}>Settings</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--af-text-secondary)' }}>
            Target: {brief.targetLengthSec}s &middot; {brief.contentType} &middot; {brief.awarenessStage}
          </div>
        </Card>
      </div>

      {/* Ad title + aspect ratio */}
      <Card style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Label>Ad Title</Label>
            <Input value={adTitle} onChange={(e: any) => setAdTitle(e.target.value)} placeholder={`${brief.awarenessStage}_${brief.contentType}_${brief.targetLengthSec}s`} />
          </div>
          <div>
            <Label>Aspect Ratio</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ASPECT_RATIOS.map(ar => (
                <button key={ar} onClick={() => setAspectRatio(ar)} style={{
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: aspectRatio === ar ? 700 : 500,
                  background: aspectRatio === ar ? 'var(--af-accent)' : 'var(--af-card)',
                  color: aspectRatio === ar ? '#fff' : 'var(--af-text-secondary)',
                  border: '1px solid ' + (aspectRatio === ar ? 'var(--af-accent)' : 'var(--af-border)'),
                }}>{ar}</button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Export */}
      <ExportVideo
        sections={sections}
        libraryItems={items}
        voiceoverUrl={voiceoverUrl}
        musicUrl={musicUrl}
        onSave={handleSave}
      />

      {/* Saved confirmation */}
      {saved && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Btn onClick={onGoToForged} style={{ background: 'var(--af-green)', color: '#000', fontWeight: 700, fontSize: 14, padding: '12px 28px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Check size={14} /> View in Forged Ads <ChevronRight size={14} />
          </Btn>
        </div>
      )}

      {/* Back */}
      <div style={{ marginTop: 24 }}>
        <Btn onClick={onBack} style={{ background: 'none', border: '1px solid var(--af-border)', color: 'var(--af-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChevronLeft size={14} /> Back to Clips
        </Btn>
      </div>
    </div>
  )
}
