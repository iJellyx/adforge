'use client'
import { C } from './constants'
import type { Item } from './types'

const STAGES = [
  { key: 'upload', icon: '⬆️', label: 'Upload' },
  { key: 'transcode', icon: '🔄', label: 'Transcode' },
  { key: 'analyse', icon: '🔍', label: 'Analyse' },
  { key: 'clip', icon: '✂️', label: 'Clip' },
]

function getActiveStageIndex(muxStatus?: string): number {
  if (!muxStatus) return 0
  if (muxStatus === 'pending') return 1
  if (muxStatus === 'analysing') return 2
  if (muxStatus === 'ready') return 4 // all complete
  if (muxStatus === 'errored') return -1
  if (muxStatus === 'duplicate') return -2
  return 0
}

export function UploadPipeline({ item, compact }: { item: Item; compact?: boolean }) {
  const stageIdx = getActiveStageIndex(item.mux_status)
  const isError = stageIdx === -1
  const isDuplicate = stageIdx === -2
  const allDone = stageIdx >= 4
  const fontSize = compact ? 9 : 11
  const dotSize = compact ? 10 : 14
  const lineH = compact ? 2 : 3

  if (isError) {
    return (
      <div style={{ padding: compact ? '4px 8px' : '8px 12px', fontSize, color: C.red, fontWeight: 600 }}>
        ❌ Processing failed
      </div>
    )
  }

  if (isDuplicate) {
    return (
      <div style={{ padding: compact ? '4px 8px' : '8px 12px', fontSize, color: C.yellow, fontWeight: 600 }}>
        ⚠️ Duplicate detected
      </div>
    )
  }

  return (
    <div style={{ padding: compact ? '4px 8px' : '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STAGES.map((stage, i) => {
          const completed = allDone || i < stageIdx
          const active = !allDone && i === stageIdx
          const future = !allDone && i > stageIdx
          return (
            <div key={stage.key} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : undefined }}>
              {/* Dot + label */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 1 : 3, minWidth: compact ? 28 : 40 }}>
                <div
                  style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '50%',
                    background: completed ? C.green : active ? C.accent : C.border,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: compact ? 6 : 8,
                    color: '#fff',
                    fontWeight: 800,
                    position: 'relative',
                    ...(active ? { boxShadow: `0 0 0 3px ${C.accent}33`, animation: 'pipelinePulse 1.5s infinite' } : {}),
                  }}
                >
                  {completed ? '✓' : ''}
                </div>
                {!compact && (
                  <div style={{ fontSize: 9, color: completed ? C.green : active ? C.accent : C.muted, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>
                    {stage.icon} {stage.label}
                  </div>
                )}
              </div>
              {/* Connecting line */}
              {i < STAGES.length - 1 && (
                <div style={{ flex: 1, height: lineH, background: completed ? C.green : C.border, borderRadius: lineH, margin: compact ? '0 2px' : '0 4px', marginBottom: compact ? 0 : 16 }} />
              )}
            </div>
          )
        })}
      </div>
      {/* Summary line when complete */}
      {allDone && item.clip_ids && item.clip_ids.length > 0 && (
        <div style={{ fontSize: compact ? 8 : 11, color: C.green, fontWeight: 600, marginTop: compact ? 2 : 6 }}>
          ✅ Created {item.clip_ids.length} clip{item.clip_ids.length !== 1 ? 's' : ''}
          {item.analysis?.content_type ? ` · ${item.analysis.content_type}` : ''}
          {item.analysis?.ad_potential ? ` · ${item.analysis.ad_potential} potential` : ''}
        </div>
      )}
      {/* Inject pulse animation */}
      <style>{`@keyframes pipelinePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  )
}
