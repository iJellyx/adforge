'use client'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { C } from './constants'
import { fmt, muxThumb, toNum, fx } from './utils'
import { Btn } from './ui-primitives'

/**
 * TrimEditorModal
 *
 * Works on both originals (full video, start=0, end=duration) and sub-clips
 * (item with start_seconds/end_seconds pointing into a parent video). Internally
 * uses a range model [tlStart, tlEnd] expressed in ABSOLUTE parent-video seconds:
 *   - Originals: tlStart=0, tlEnd=duration
 *   - Clips:     tlStart=item.start_seconds, tlEnd=item.end_seconds
 *
 * inPt/outPt are also absolute parent-video seconds. Percentage math converts
 * to the timeline width.
 *
 * When `lockedDuration` is provided, the two brackets are locked apart by that
 * duration and dragging either moves both (constant window width).
 */
export function TrimEditorModal({item,trimStart,trimEnd,originalDuration,lockedDuration,onSave,onClose}:any){
  // Timeline bounds in absolute parent-video time
  const isClip = (item.type === 'clip') && (item.start_seconds != null)
  const tlStart = useMemo(() => isClip ? toNum(item.start_seconds, 0) : 0, [item])
  const tlEnd = useMemo(() => {
    if (isClip) {
      if (item.end_seconds != null) return toNum(item.end_seconds)
      return toNum(item.start_seconds, 0) + toNum(item.duration_seconds, 5)
    }
    return toNum(originalDuration || item.duration_seconds, 30)
  }, [item, originalDuration])
  const tlDur = Math.max(0.1, tlEnd - tlStart)

  const lockWidth = typeof lockedDuration === 'number' ? Math.min(lockedDuration, tlDur) : null

  // Initial bracket positions (absolute)
  const initIn = useMemo(() => {
    if (trimStart != null) return Math.max(tlStart, Math.min(tlEnd, toNum(trimStart, tlStart)))
    return tlStart
  }, [trimStart, tlStart, tlEnd])
  const initOut = useMemo(() => {
    if (lockWidth != null) return Math.min(tlEnd, initIn + lockWidth)
    if (trimEnd != null) return Math.max(initIn, Math.min(tlEnd, toNum(trimEnd, tlEnd)))
    return tlEnd
  }, [trimEnd, initIn, lockWidth, tlEnd])

  const [inPt, setInPt] = useState(initIn)
  const [outPt, setOutPt] = useState(initOut)
  const [curTime, setCurTime] = useState(initIn)
  const [playing, setPlaying] = useState(false)
  const vidRef = useRef<HTMLVideoElement>(null)
  const tlRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<'in'|'out'|null>(null)

  useEffect(() => {
    const v = vidRef.current; if (!v) return
    v.src = 'https://stream.mux.com/' + item.mux_playback_id + '/capped-1080p.mp4'
    const onMeta = () => { if (v) v.currentTime = inPt }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
  }, [])

  useEffect(() => {
    const v = vidRef.current; if (!v) return
    function onUpdate(){
      if (!v) return
      setCurTime(v.currentTime)
      if (v.currentTime >= outPt) { v.pause(); v.currentTime = inPt; setPlaying(false) }
    }
    v.addEventListener('timeupdate', onUpdate)
    return () => v.removeEventListener('timeupdate', onUpdate)
  }, [inPt, outPt])

  function seekTo(t:number){
    const v = vidRef.current; if (!v) return
    const c = Math.max(tlStart, Math.min(tlEnd, t))
    v.currentTime = c
    setCurTime(c)
  }

  function togglePlay(){
    const v = vidRef.current; if (!v) return
    if (playing) { v.pause(); setPlaying(false) }
    else {
      if (v.currentTime >= outPt || v.currentTime < inPt) v.currentTime = inPt
      v.play().catch(()=>{})
      setPlaying(true)
    }
  }

  // Timeline percent helpers (map absolute time -> visible percentage)
  const timeToPct = (t:number) => ((t - tlStart) / tlDur) * 100
  const pctToTime = (p:number) => tlStart + p * tlDur

  function getPctFromX(e:MouseEvent|React.MouseEvent):number{
    const rect = tlRef.current?.getBoundingClientRect(); if (!rect) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  function onTlDown(e:React.MouseEvent){
    const pct = getPctFromX(e)
    const t = pctToTime(pct)
    const inPctVal = timeToPct(inPt) / 100
    const outPctVal = timeToPct(outPt) / 100
    const inDist = Math.abs(pct - inPctVal)
    const outDist = Math.abs(pct - outPctVal)
    if (inDist < 0.05 && inDist <= outDist) setDrag('in')
    else if (outDist < 0.05) setDrag('out')
    else seekTo(t)
  }

  useEffect(() => {
    function onMove(e:MouseEvent){
      if (!drag) return
      const pct = getPctFromX(e)
      const t = pctToTime(pct)
      if (lockWidth != null) {
        // Locked: dragging either handle moves both, keeping window width constant.
        if (drag === 'in') {
          const newIn = Math.max(tlStart, Math.min(t, tlEnd - lockWidth))
          setInPt(newIn); setOutPt(newIn + lockWidth); seekTo(newIn)
        } else {
          const newOut = Math.max(tlStart + lockWidth, Math.min(t, tlEnd))
          setOutPt(newOut); setInPt(newOut - lockWidth); seekTo(newOut - lockWidth)
        }
      } else {
        // Free trim
        if (drag === 'in') {
          const v = Math.min(t, outPt - 0.5)
          const clamped = Math.max(tlStart, v)
          setInPt(clamped); seekTo(clamped)
        } else {
          const v = Math.max(t, inPt + 0.5)
          const clamped = Math.min(tlEnd, v)
          setOutPt(clamped); seekTo(clamped)
        }
      }
    }
    function onUp(){ setDrag(null) }
    if (drag) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, inPt, outPt, tlStart, tlEnd, tlDur, lockWidth])

  const inPct = timeToPct(inPt)
  const outPct = timeToPct(outPt)
  const curPct = timeToPct(curTime)
  const selDur = outPt - inPt
  const thumbCount = 10

  // Display times relative to timeline start so the user sees 0..N, not absolute times
  const displayIn = inPt - tlStart
  const displayOut = outPt - tlStart
  const displayCur = Math.max(0, curTime - tlStart)

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:'1px solid '+C.border,borderRadius:20,width:'100%',maxWidth:820,overflow:'hidden'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid '+C.border,display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:15,color:C.text}}>{lockWidth!=null?`✂️ Pick a ${fx(lockWidth,1)}s window`:'✂️ Trim Clip'}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{item.title}</div>
          </div>
          <div style={{background:C.accentSoft,border:'1px solid '+C.border,borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:700,color:C.accent}}>
            {lockWidth!=null ? `Locked at ${fx(lockWidth)}s` : `${fx(selDur)}s selected`}
          </div>
          <button onClick={onClose} style={{background:'none',border:'1px solid '+C.border,borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12,color:C.muted,fontFamily:'inherit'}}>Cancel</button>
          <button onClick={()=>onSave({trimStart:inPt,trimEnd:outPt})} style={{background:C.accent,color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>Save Trim</button>
        </div>
        <div style={{background:'#000',position:'relative',display:'flex',alignItems:'center',justifyContent:'center',maxHeight:340,overflow:'hidden'}}>
          <video ref={vidRef} playsInline preload="auto" muted style={{maxHeight:340,width:'100%',objectFit:'contain',display:'block',cursor:'pointer'}} onClick={togglePlay}/>
          {!playing && <div onClick={togglePlay} style={{position:'absolute',width:56,height:56,borderRadius:'50%',background:'rgba(0,0,0,0.6)',border:'2px solid rgba(255,255,255,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'#fff',cursor:'pointer'}}>▶</div>}
          <div style={{position:'absolute',bottom:10,right:12,background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:5}}>{fx(displayCur)}s / {fx(tlDur)}s</div>
        </div>
        <div style={{padding:'16px 20px 20px'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.muted,marginBottom:6}}>
            <span style={{color:C.green,fontWeight:700}}>Start: {fx(displayIn,2)}s</span>
            <span style={{color:C.accent,fontWeight:700}}>Duration: {fx(selDur,2)}s</span>
            <span style={{color:C.red,fontWeight:700}}>End: {fx(displayOut,2)}s</span>
          </div>
          <div ref={tlRef} onMouseDown={onTlDown} style={{position:'relative',height:60,borderRadius:10,overflow:'hidden',cursor:'crosshair',userSelect:'none',marginBottom:10,background:'#000'}}>
            <div style={{position:'absolute',inset:0,display:'flex'}}>
              {Array.from({length:thumbCount},(_,ti)=>{
                const tt = tlStart + (ti/thumbCount) * tlDur
                const bg = 'url(' + muxThumb(item.mux_playback_id, tt) + ')'
                return <div key={ti} style={{flex:1,backgroundImage:bg,backgroundSize:'cover',backgroundPosition:'center'}}/>
              })}
            </div>
            <div style={{position:'absolute',top:0,left:0,width:inPct+'%',height:'100%',background:'rgba(0,0,0,0.65)'}}/>
            <div style={{position:'absolute',top:0,right:0,width:(100-outPct)+'%',height:'100%',background:'rgba(0,0,0,0.65)'}}/>
            <div style={{position:'absolute',top:0,left:inPct+'%',width:(outPct-inPct)+'%',height:'100%',border:'2px solid '+C.accent,boxSizing:'border-box' as const,pointerEvents:'none'}}/>
            <div style={{position:'absolute',top:-4,left:'calc('+inPct+'% - 8px)',width:16,height:68,background:C.green,borderRadius:4,cursor:'ew-resize',zIndex:10,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>
              <div style={{width:2,height:28,background:'rgba(255,255,255,0.9)',borderRadius:2}}/>
            </div>
            <div style={{position:'absolute',top:-4,left:'calc('+outPct+'% - 8px)',width:16,height:68,background:'#DC2626',borderRadius:4,cursor:'ew-resize',zIndex:10,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>
              <div style={{width:2,height:28,background:'rgba(255,255,255,0.9)',borderRadius:2}}/>
            </div>
            <div style={{position:'absolute',top:0,left:'calc('+curPct+'% - 1px)',width:2,height:'100%',background:'#fff',pointerEvents:'none',zIndex:20,boxShadow:'0 0 6px rgba(255,255,255,0.5)'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:C.muted,marginBottom:14}}>
            {Array.from({length:6},(_,ti)=><span key={ti}>{fx((ti/5)*tlDur,1)}s</span>)}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>seekTo(inPt)} style={{background:C.surface,border:'1px solid '+C.border,color:C.muted,borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>⏮ Start</button>
            <button onClick={togglePlay} style={{background:C.accent,color:'#fff',border:'none',borderRadius:8,padding:'9px 0',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',flex:1}}>{playing?'⏸ Pause':'▶ Play selection'}</button>
            <button onClick={()=>seekTo(outPt-0.1)} style={{background:C.surface,border:'1px solid '+C.border,color:C.muted,borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>End ⏭</button>
            {lockWidth == null && (
              <button onClick={()=>{setInPt(tlStart);setOutPt(tlEnd)}} style={{background:'#FEF2F2',border:'1px solid #FECACA',color:C.red,borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Reset</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
