'use client'
import MuxPlayer from '@mux/mux-player-react'
import { ClipSegmentPlayer } from './ClipSegmentPlayer'
import { Film } from 'lucide-react'

export function MuxClipPlayer({ item }: any) {
  if (!item?.mux_playback_id) {
    return (
      <div className="bg-black rounded-lg p-8 text-center text-text-muted mb-4">
        <Film className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <div className="text-[13px]">
          {item?.mux_status === 'pending' || item?.mux_status === 'analysing'
            ? 'Video is still processing\u2026'
            : 'No video available'}
        </div>
      </div>
    )
  }

  if (item.type === 'clip' && item.start_seconds != null) {
    return (
      <div className="rounded-lg overflow-hidden mb-4 bg-black aspect-[9/16] max-h-[500px] relative">
        <ClipSegmentPlayer
          playbackId={item.mux_playback_id}
          start={item.start_seconds || 0}
          end={item.end_seconds}
          muted={false}
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg overflow-hidden mb-4 bg-black">
      <MuxPlayer
        playbackId={item.mux_playback_id}
        startTime={item.start_seconds || 0}
        streamType="on-demand"
        accentColor="#8B7FFF"
        style={{
          width: '100%',
          aspectRatio: '9/16',
          maxHeight: 500,
          display: 'block',
        }}
      />
    </div>
  )
}
