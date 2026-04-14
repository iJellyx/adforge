'use client'
import { useState } from 'react'
import { muxThumb, fmt, typeColor, secColor } from './utils'
import { Chip } from './ui-primitives'
import { Check, X, User, Paperclip, Scissors } from 'lucide-react'

export function VideoCard({
  item,
  onClick,
  selectMode,
  isSelected,
  onToggleSelect,
  compact,
  highlight,
  showApprovalButtons,
  onApprove,
  onReject,
}: any) {
  const [hover, setHover] = useState(false)
  const chipLabel =
    item.type === 'clip'
      ? item.analysis?.use_case || 'Clip'
      : item.analysis?.content_type || 'Untagged'
  const tc =
    item.type === 'clip' ? typeColor('Clip') : typeColor(item.analysis?.content_type)
  const thumbTime = item.thumbnail_time ?? item.start_seconds ?? 0
  const isClip = item.type === 'clip'
  const qualScore = item.analysis?.quality_score as string | undefined
  const clipStatus = item.clip_status as string | undefined
  const clipRole = item.clip_role as string | undefined
  const parentTitle = item.analysis?.parent_title as string | undefined

  function handleClick(e: any) {
    if (selectMode) {
      e.stopPropagation()
      onToggleSelect()
    } else onClick()
  }

  const qualClasses: Record<string, string> = {
    High: 'bg-success',
    Medium: 'bg-warning',
    Low: 'bg-danger',
  }
  const statusConfig: Record<string, { icon: React.ReactNode; cls: string }> = {
    approved: {
      icon: <Check className="w-2.5 h-2.5" strokeWidth={3} />,
      cls: 'bg-success text-white',
    },
    pending: {
      icon: <span className="w-1.5 h-1.5 rounded-full border border-white" />,
      cls: 'bg-warning text-white',
    },
    rejected: {
      icon: <X className="w-2.5 h-2.5" strokeWidth={3} />,
      cls: 'bg-danger text-white',
    },
  }

  return (
    <div
      onClick={handleClick}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      className={[
        'bg-card border-2 overflow-hidden cursor-pointer flex flex-col relative',
        'transition-all duration-200 group',
        compact ? 'rounded-md' : 'rounded-lg',
        isSelected
          ? 'border-accent shadow-glow'
          : highlight
            ? 'border-success hover:border-success hover:shadow-glow'
            : 'border-border hover:border-accent hover:shadow-glow',
      ].join(' ')}
    >
      {/* Select mode checkbox */}
      {selectMode && (
        <div
          className={[
            'absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-[5px] border-2 flex items-center justify-center',
            isSelected
              ? 'bg-accent border-white'
              : 'bg-black/40 border-white/20',
          ].join(' ')}
        >
          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </div>
      )}

      {/* Auto highlight badge */}
      {highlight && (
        <div className="absolute top-1.5 left-1.5 z-10 bg-success text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded-xs">
          AUTO
        </div>
      )}

      {/* Thumbnail area */}
      <div className="relative w-full aspect-[9/16] bg-black overflow-hidden shrink-0">
        {item.mux_playback_id ? (
          <img
            src={muxThumb(item.mux_playback_id, thumbTime)}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover block"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className={compact ? 'text-lg' : 'text-3xl'}>
              {item.mux_status === 'pending' || item.mux_status === 'analysing'
                ? '\u23F3'
                : '\uD83C\uDFAC'}
            </div>
            {!compact && (
              <div className="text-[9px] text-text-muted text-center">
                {item.mux_status === 'analysing'
                  ? 'Analysing\u2026'
                  : item.mux_status === 'pending'
                    ? 'Processing\u2026'
                    : 'No preview'}
              </div>
            )}
          </div>
        )}

        {/* Clip badge */}
        {isClip && (
          <div
            className={[
              'absolute bg-warning/90 text-black font-extrabold rounded-xs flex items-center justify-center',
              compact
                ? 'top-1 left-1 text-[7px] px-1 py-px'
                : 'top-2 left-2 text-[9px] px-1.5 py-px',
            ].join(' ')}
          >
            <Scissors className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
          </div>
        )}

        {/* B-ROLL / TALKING HEAD badge */}
        {item.analysis?.is_broll && (
          <div
            className={[
              'absolute bg-info/85 text-white font-extrabold rounded-xs',
              compact
                ? 'top-1 right-1 text-[6px] px-1 py-px'
                : 'top-2 right-2 text-[8px] px-1 py-px',
            ].join(' ')}
          >
            B-ROLL
          </div>
        )}
        {item.analysis?.is_talking_head && !item.analysis?.is_broll && (
          <div
            className={[
              'absolute bg-[#7C3AED]/85 text-white font-extrabold rounded-xs',
              compact
                ? 'top-1 right-1 text-[6px] px-1 py-px'
                : 'top-2 right-2 text-[8px] px-1 py-px',
            ].join(' ')}
          >
            TALKING HEAD
          </div>
        )}

        {/* Quality dot */}
        {isClip && qualScore && qualClasses[qualScore] && (
          <div
            className={[
              'absolute rounded-full border-[1.5px] border-white shadow-sm',
              qualClasses[qualScore],
              compact
                ? 'top-4 right-1 w-2 h-2'
                : 'top-6 right-2 w-2.5 h-2.5',
            ].join(' ')}
          />
        )}

        {/* Duration badge */}
        {item.duration_seconds && (
          <div
            className={[
              'absolute bg-black/75 text-white font-bold rounded-xs backdrop-blur-sm',
              compact
                ? 'bottom-1 right-1 text-[8px] px-1 py-px'
                : 'bottom-2 right-2 text-[10px] px-1.5 py-px',
            ].join(' ')}
          >
            {fmt(item.duration_seconds)}
          </div>
        )}

        {/* Approval status badge */}
        {isClip && clipStatus && statusConfig[clipStatus] && (
          <div
            className={[
              'absolute flex items-center gap-0.5 font-extrabold rounded-xs shadow-sm',
              statusConfig[clipStatus].cls,
              compact
                ? 'bottom-1 left-1 text-[7px] px-1 py-px'
                : 'bottom-2 left-2 text-[9px] px-1.5 py-px',
            ].join(' ')}
          >
            {statusConfig[clipStatus].icon}
          </div>
        )}

        {/* Review mode overlay buttons */}
        {showApprovalButtons && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={[
              'absolute inset-0 bg-black/65 flex items-center justify-center gap-3 z-[15]',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
            ].join(' ')}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                onApprove?.()
              }}
              className={[
                'w-11 h-11 rounded-full border-2 border-success text-white text-xl font-extrabold',
                'cursor-pointer flex items-center justify-center transition-colors',
                clipStatus === 'approved' ? 'bg-success' : 'bg-success/20',
              ].join(' ')}
            >
              <Check className="w-5 h-5" strokeWidth={3} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onReject?.()
              }}
              className={[
                'w-11 h-11 rounded-full border-2 border-danger text-white text-xl font-extrabold',
                'cursor-pointer flex items-center justify-center transition-colors',
                clipStatus === 'rejected' ? 'bg-danger' : 'bg-danger/20',
              ].join(' ')}
            >
              <X className="w-5 h-5" strokeWidth={3} />
            </button>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className={compact ? 'p-1.5 flex-1 flex flex-col gap-0.5' : 'p-3 flex-1 flex flex-col gap-1'}>
        <div className="flex gap-1 flex-wrap items-center">
          <Chip label={chipLabel} color={tc} />
          {item.analysis?.creative_tags?.slice(0, 2).map((t: string, i: number) => (
            <span
              key={i}
              className="bg-accent-soft text-accent px-1.5 py-px rounded-full text-[7px] font-semibold border border-accent/15"
            >
              {t.replace(/_/g, ' ')}
            </span>
          ))}
        </div>

        {/* Clip role pill */}
        {isClip &&
          clipRole &&
          (() => {
            const rc = secColor(clipRole.toUpperCase())
            return (
              <div className="flex mt-px">
                <span
                  style={{
                    background: rc.bg,
                    color: rc.color,
                    borderColor: rc.bd || rc.color + '22',
                  }}
                  className="border px-2 py-px rounded-full text-[7px] font-bold"
                >
                  {clipRole.toUpperCase()}
                </span>
              </div>
            )
          })()}

        <div
          className={[
            'font-bold leading-tight line-clamp-2',
            compact ? 'text-[10px]' : 'text-sm',
          ].join(' ')}
        >
          {item.title}
        </div>

        {item.creator && (
          <div
            className={[
              'text-text-muted flex items-center gap-1',
              compact ? 'text-[8px]' : 'text-[10px]',
            ].join(' ')}
          >
            <User className={compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} />
            {item.creator}
            {item.creator_age ? ` \u00B7 ${item.creator_age}` : ''}
          </div>
        )}

        {/* Source video name for clips */}
        {isClip && parentTitle && (
          <div
            className={[
              'text-text-muted opacity-70 overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1',
              compact ? 'text-[7px]' : 'text-[9px]',
            ].join(' ')}
          >
            <Paperclip className={compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} />
            from {parentTitle}
          </div>
        )}

        {!compact &&
          (item.analysis?.scene_tags || []).slice(0, 2).map((t: string, i: number) => (
            <span
              key={i}
              className="bg-success-soft text-success px-1.5 py-px rounded-full text-[8px] font-semibold"
            >
              {t}
            </span>
          ))}
      </div>
    </div>
  )
}
