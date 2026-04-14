'use client'
import { useState, useEffect, useRef } from 'react'
import { Play } from 'lucide-react'

export function ClipSegmentPlayer({
  playbackId,
  start,
  end,
  muted,
}: {
  playbackId: string
  start: number
  end?: number
  muted: boolean
}) {
  const vidRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const src = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`

  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    function seek() {
      if (v) v.currentTime = start
    }
    if (v.readyState >= 1) seek()
    else v.addEventListener('loadedmetadata', seek, { once: true })
  }, [src, start])

  function onTimeUpdate() {
    const v = vidRef.current
    if (!v) return
    if (end && v.currentTime >= end) {
      v.pause()
      v.currentTime = start
      setPlaying(false)
    }
  }

  function toggle() {
    const v = vidRef.current
    if (!v) return
    if (playing) {
      v.pause()
      setPlaying(false)
    } else {
      v.play().catch(() => {})
      setPlaying(true)
    }
  }

  return (
    <div className="relative w-full h-full">
      <video
        ref={vidRef}
        src={src}
        playsInline
        preload="metadata"
        muted={muted}
        className="w-full h-full object-contain max-h-full"
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div
        onClick={toggle}
        className="absolute inset-0 flex items-center justify-center cursor-pointer"
      >
        {!playing && (
          <div className="w-9 h-9 rounded-full bg-black/40 border-2 border-white/40 flex items-center justify-center">
            <Play className="w-4 h-4 text-white fill-white" />
          </div>
        )}
      </div>
    </div>
  )
}
