'use client'
import { useState, useRef } from 'react'
import { C } from './constants'
import { fmt } from './utils'

export function TrimSlider({item,trimStart,trimEnd,onUpdate}:any){
  const dur=item.duration_seconds||30
  const start=trimStart??item.start_seconds??0
  const end=trimEnd??item.end_seconds??dur
  const vidRef=useRef<HTMLVideoElement>(null)
  const [scrub,setScrub]=useState(start)

  function preview(t:number){
    const v=vidRef.current;if(!v)return
    v.currentTime=t;setScrub(t)
  }

  return<div className="bg-bg border-[1.5px] border-border rounded-md p-2.5 mb-1.5">
    <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Trim clip</div>
    <div className="relative pt-[56.25%] bg-black rounded-md overflow-hidden mb-2">
      <video ref={vidRef} src={`https://stream.mux.com/${item.mux_playback_id}/capped-1080p.mp4`} playsInline preload="metadata" muted className="absolute inset-0 w-full h-full object-cover"/>
    </div>
    <div className="mb-1.5">
      <div className="flex justify-between text-[9px] text-text-muted mb-0.5">
        <span>In: {start.toFixed(1)}s</span>
        <span>Out: {end.toFixed(1)}s</span>
        <span>Dur: {(end-start).toFixed(1)}s</span>
      </div>
      <input type="range" min={0} max={dur} step={0.1} value={start} onChange={e=>{const v=parseFloat(e.target.value);preview(v);onUpdate({trimStart:v,trimEnd:Math.max(v+0.5,end)})}} className="w-full accent-accent mb-1 cursor-pointer"/>
      <input type="range" min={0} max={dur} step={0.1} value={end} onChange={e=>{const v=parseFloat(e.target.value);preview(v);onUpdate({trimStart:Math.min(start,v-0.5),trimEnd:v})}} className="w-full accent-danger cursor-pointer"/>
    </div>
    <div className="flex gap-1">
      <button onClick={()=>onUpdate({trimStart:item.start_seconds??0,trimEnd:item.end_seconds??dur})} className="flex-1 bg-accent-soft text-accent border-none rounded-md py-1 cursor-pointer text-[9px] font-bold transition-all duration-150 hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent/50">Reset</button>
      <button onClick={()=>preview(start)} className="flex-1 bg-surface text-text-muted border-[1.5px] border-border rounded-md py-1 cursor-pointer text-[9px] transition-all duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/50">Preview In</button>
      <button onClick={()=>preview(end-0.5)} className="flex-1 bg-surface text-text-muted border-[1.5px] border-border rounded-md py-1 cursor-pointer text-[9px] transition-all duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/50">Preview Out</button>
    </div>
  </div>
}
