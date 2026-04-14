'use client'
import React, { useState, useEffect, useRef } from 'react'
import { Scissors, Play, Pause, SkipBack, SkipForward, RotateCcw, X } from 'lucide-react'
import { C } from './constants'
import { fmt, muxThumb } from './utils'
import { Btn } from './ui-primitives'

export function TrimEditorModal({item,trimStart,trimEnd,originalDuration,onSave,onClose}:any){
  const fullDur=originalDuration||item.duration_seconds||30
  const playbackId=item.mux_playback_id
  const [inPt,setInPt]=useState(trimStart??item.start_seconds??0)
  const [outPt,setOutPt]=useState(trimEnd??item.end_seconds??(item.start_seconds||0)+(item.duration_seconds||5))
  const [curTime,setCurTime]=useState(inPt)
  const [playing,setPlaying]=useState(false)
  const vidRef=useRef<HTMLVideoElement>(null)
  const tlRef=useRef<HTMLDivElement>(null)
  const [drag,setDrag]=useState<"in"|"out"|null>(null)

  useEffect(()=>{
    const v=vidRef.current;if(!v)return
    v.src="https://stream.mux.com/"+item.mux_playback_id+"/capped-1080p.mp4"
    const onMeta=()=>{if(v)v.currentTime=inPt}
    v.addEventListener("loadedmetadata",onMeta,{once:true})
  },[])

  useEffect(()=>{
    const v=vidRef.current;if(!v)return
    function onUpdate(){
      if(!v)return
      setCurTime(v.currentTime)
      if(v.currentTime>=outPt){v.pause();v.currentTime=inPt;setPlaying(false)}
    }
    v.addEventListener("timeupdate",onUpdate)
    return()=>v.removeEventListener("timeupdate",onUpdate)
  },[inPt,outPt])

  function seekTo(t:number){
    const v=vidRef.current;if(!v)return
    const c=Math.max(0,Math.min(fullDur,t))
    v.currentTime=c;setCurTime(c)
  }

  function togglePlay(){
    const v=vidRef.current;if(!v)return
    if(playing){v.pause();setPlaying(false)}
    else{if(v.currentTime>=outPt)v.currentTime=inPt;v.play();setPlaying(true)}
  }

  function getPctFromX(e:MouseEvent|React.MouseEvent):number{
    const rect=tlRef.current?.getBoundingClientRect();if(!rect)return 0
    return Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))
  }

  function onTlDown(e:React.MouseEvent){
    const pct=getPctFromX(e);const t=pct*fullDur
    const inDist=Math.abs(pct-(inPt/fullDur))
    const outDist=Math.abs(pct-(outPt/fullDur))
    if(inDist<0.05&&inDist<=outDist)setDrag("in")
    else if(outDist<0.05)setDrag("out")
    else seekTo(t)
  }

  useEffect(()=>{
    function onMove(e:MouseEvent){
      if(!drag)return
      const pct=getPctFromX(e);const t=pct*fullDur
      if(drag==="in"){const v=Math.min(t,outPt-0.5);const clamped=Math.max(0,v);setInPt(clamped);seekTo(clamped)}
      else{const v=Math.max(t,inPt+0.5);const clamped=Math.min(fullDur,v);setOutPt(clamped);seekTo(clamped)}
    }
    function onUp(){setDrag(null)}
    if(drag){window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp)}
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp)}
  },[drag,inPt,outPt,fullDur])

  const inPct=(inPt/fullDur)*100
  const outPct=(outPt/fullDur)*100
  const curPct=(curTime/fullDur)*100
  const selDur=outPt-inPt
  const thumbCount=10

  return<div onClick={onClose} className="bg-overlay fixed inset-0 z-[500] flex items-center justify-center p-5 animate-fade-in">
    <div onClick={e=>e.stopPropagation()} className="bg-surface border border-border rounded-xl w-full max-w-3xl overflow-hidden shadow-xl animate-scale-in">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="flex-1">
          <div className="font-extrabold text-[15px] text-text flex items-center gap-2"><Scissors className="w-4 h-4" /> Trim Clip</div>
          <div className="text-xs text-text-muted mt-0.5">{item.title}</div>
        </div>
        <div className="bg-accent-soft border border-border rounded-md px-3 py-1.5 text-xs font-bold text-accent">{selDur.toFixed(1)}s selected</div>
        <button onClick={onClose} className="bg-transparent border border-border rounded-md px-3 py-1.5 cursor-pointer text-xs text-text-muted hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">Cancel</button>
        <button onClick={()=>onSave({trimStart:inPt,trimEnd:outPt})} className="bg-accent text-white border-none rounded-md px-5 py-2 cursor-pointer text-sm font-bold hover:bg-accent-hover transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">Save Trim</button>
      </div>
      <div className="bg-black relative flex items-center justify-center max-h-[340px] overflow-hidden">
        <video ref={vidRef} playsInline preload="auto" muted className="max-h-[340px] w-full object-contain block cursor-pointer" onClick={togglePlay}/>
        {!playing&&<div onClick={togglePlay} className="absolute w-14 h-14 rounded-full bg-black/60 border-2 border-white/30 flex items-center justify-center text-white cursor-pointer hover:bg-black/80 transition-all duration-150">
          <Play className="w-5 h-5 ml-0.5" />
        </div>}
        <div className="absolute bottom-2.5 right-3 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-md">{curTime.toFixed(1)}s / {fullDur.toFixed(1)}s</div>
      </div>
      <div className="px-5 pt-4 pb-5">
        <div className="flex justify-between text-xs text-text-muted mb-1.5">
          <span className="text-success font-bold">In: {inPt.toFixed(2)}s</span>
          <span className="text-accent font-bold">Duration: {selDur.toFixed(2)}s</span>
          <span className="text-danger font-bold">Out: {outPt.toFixed(2)}s</span>
        </div>
        <div ref={tlRef} onMouseDown={onTlDown} className="relative h-[60px] rounded-md overflow-hidden cursor-crosshair select-none mb-2.5">
          <div className="absolute inset-0 flex">
            {Array.from({length:thumbCount},(_,ti)=>{
              const tt=(ti/thumbCount)*fullDur
              const bg="url("+muxThumb(item.mux_playback_id,tt)+")"
              return<div key={ti} className="flex-1 bg-cover bg-center" style={{backgroundImage:bg}}/>
            })}
          </div>
          <div className="absolute top-0 left-0 h-full bg-black/65" style={{width:inPct+"%"}}/>
          <div className="absolute top-0 right-0 h-full bg-black/65" style={{width:(100-outPct)+"%"}}/>
          <div className="absolute top-0 h-full border-2 border-accent box-border" style={{left:inPct+"%",width:(outPct-inPct)+"%"}}/>
          <div className="absolute -top-1 w-3.5 h-[68px] bg-success rounded cursor-ew-resize z-10 flex items-center justify-center" style={{left:"calc("+inPct+"% - 7px)"}}>
            <div className="w-0.5 h-6 bg-white/80 rounded"/>
          </div>
          <div className="absolute -top-1 w-3.5 h-[68px] bg-danger rounded cursor-ew-resize z-10 flex items-center justify-center" style={{left:"calc("+outPct+"% - 7px)"}}>
            <div className="w-0.5 h-6 bg-white/80 rounded"/>
          </div>
          <div className="absolute top-0 w-0.5 h-full bg-white pointer-events-none z-20" style={{left:"calc("+curPct+"% - 1px)"}}/>
        </div>
        <div className="flex justify-between text-[9px] text-text-muted mb-3.5">
          {Array.from({length:6},(_,ti)=><span key={ti}>{((ti/5)*fullDur).toFixed(0)}s</span>)}
        </div>
        <div className="flex gap-2">
          <button onClick={()=>seekTo(inPt)} className="bg-surface border border-border text-text-muted rounded-md px-3.5 py-2 cursor-pointer text-xs hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center gap-1">
            <SkipBack className="w-3 h-3" /> In
          </button>
          <button onClick={togglePlay} className="bg-accent text-white border-none rounded-md py-2.5 cursor-pointer text-sm font-bold flex-1 hover:bg-accent-hover transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center justify-center gap-1.5">
            {playing?<><Pause className="w-4 h-4" /> Pause</>:<><Play className="w-4 h-4" /> Play Selection</>}
          </button>
          <button onClick={()=>seekTo(outPt-0.1)} className="bg-surface border border-border text-text-muted rounded-md px-3.5 py-2 cursor-pointer text-xs hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center gap-1">
            Out <SkipForward className="w-3 h-3" />
          </button>
          <button onClick={()=>{setInPt(item.start_seconds??0);setOutPt(item.end_seconds??(item.start_seconds||0)+(item.duration_seconds||fullDur))}} className="bg-danger-soft border border-danger/30 text-danger rounded-md px-3 py-2 cursor-pointer text-xs hover:bg-danger/20 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-danger/50 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>
    </div>
  </div>
}
