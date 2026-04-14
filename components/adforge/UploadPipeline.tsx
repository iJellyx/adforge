'use client'
import type { Item } from './types'
import { Check, Upload, RefreshCw, Search, Scissors, AlertCircle, AlertTriangle } from 'lucide-react'

const STAGES = [
  { key: 'upload', icon: Upload, label: 'Upload' },
  { key: 'transcode', icon: RefreshCw, label: 'Transcode' },
  { key: 'analyse', icon: Search, label: 'Analyse' },
  { key: 'clip', icon: Scissors, label: 'Clip' },
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

export function UploadPipeline({
  item,
  compact,
}: {
  item: Item
  compact?: boolean
}) {
  const stageIdx = getActiveStageIndex(item.mux_status)
  const isError = stageIdx === -1
  const isDuplicate = stageIdx === -2
  const allDone = stageIdx >= 4

  if (isError) {
    return (
      <div
        className={[
          'text-danger font-semibold flex items-center gap-1.5',
          compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-2 text-[11px]',
        ].join(' ')}
      >
        <AlertCircle className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        Processing failed
      </div>
    )
  }

  if (isDuplicate) {
    return (
      <div
        className={[
          'text-warning font-semibold flex items-center gap-1.5',
          compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-2 text-[11px]',
        ].join(' ')}
      >
        <AlertTriangle className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        Duplicate detected
      </div>
    )
  }

  return (
    <div className={compact ? 'px-2 py-1' : 'px-3 py-2'}>
      <div className="flex items-center">
        {STAGES.map((stage, i) => {
          const completed = allDone || i < stageIdx
          const active = !allDone && i === stageIdx
          const Icon = stage.icon

          return (
            <div
              key={stage.key}
              className={[
                'flex items-center',
                i < STAGES.length - 1 ? 'flex-1' : '',
              ].join(' ')}
            >
              {/* Dot + label */}
              <div
                className={[
                  'flex flex-col items-center',
                  compact ? 'gap-px min-w-7' : 'gap-1 min-w-10',
                ].join(' ')}
              >
                <div
                  className={[
                    'rounded-full flex items-center justify-center text-white font-extrabold',
                    compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5',
                    completed
                      ? 'bg-success'
                      : active
                        ? 'bg-accent animate-pulse-soft'
                        : 'bg-card border border-border',
                  ].join(' ')}
                >
                  {completed && (
                    <Check
                      className={compact ? 'w-1.5 h-1.5' : 'w-2 h-2'}
                      strokeWidth={4}
                    />
                  )}
                </div>
                {!compact && (
                  <div
                    className={[
                      'text-[9px] whitespace-nowrap flex items-center gap-0.5',
                      completed
                        ? 'text-success font-medium'
                        : active
                          ? 'text-accent font-bold'
                          : 'text-text-muted font-medium',
                    ].join(' ')}
                  >
                    <Icon className="w-2.5 h-2.5" />
                    {stage.label}
                  </div>
                )}
              </div>

              {/* Connecting line */}
              {i < STAGES.length - 1 && (
                <div
                  className={[
                    'flex-1 rounded-full',
                    compact ? 'h-0.5 mx-0.5' : 'h-0.5 mx-1 mb-4',
                    completed ? 'bg-success' : 'bg-border',
                  ].join(' ')}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Summary line when complete */}
      {allDone && item.clip_ids && item.clip_ids.length > 0 && (
        <div
          className={[
            'text-success font-semibold flex items-center gap-1',
            compact ? 'text-[8px] mt-0.5' : 'text-[11px] mt-1.5',
          ].join(' ')}
        >
          <Check className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
          Created {item.clip_ids.length} clip
          {item.clip_ids.length !== 1 ? 's' : ''}
          {item.analysis?.content_type ? ` \u00B7 ${item.analysis.content_type}` : ''}
          {item.analysis?.ad_potential ? ` \u00B7 ${item.analysis.ad_potential} potential` : ''}
        </div>
      )}
    </div>
  )
}
