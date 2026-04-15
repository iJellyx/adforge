'use client'
import React, { useState, useEffect, useRef } from 'react'
import { C } from './constants'
import { fmt, muxThumb, toNum, fx } from './utils'
import { Btn } from './ui-primitives'

export function TrimEditorModal({item,trimStart,trimEnd,originalDuration,onSave,onClose}:any){
  const fullDur=toNum(originalDuration||item.duration_seconds,30)
  // If clip is a sub-clip, the playback ID belongs to the original — use it
  const playbackId=item.mux_playback_id
  const [inPt,setInPt]=useState(toNum(trimStart??item.start_seconds,0))
  const [outPt,setOutPt]=useState(toNum(trimEnd??item.end_seconds,toNum(item.start_seconds,0)+toNum(item.duration_seconds,5)))
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

  return<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:20,width:"100%",maxWidth:780,overflow:"hidden"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:15,color:C.text}}>✂️ Trim Clip</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{item.title}</div>
        </div>
        <div style={{background:"#EDE8FF",border:"1px solid "+C.border,borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,color:C.accent}}>{fx(selDur)}s selected</div>
        <button onClick={onClose} style={{background:"none",border:"1px solid "+C.border,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,color:C.muted,fontFamily:"inherit"}}>Cancel</button>
        <button onClick={()=>onSave({trimStart:inPt,trimEnd:outPt})} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>Save Trim</button>
      </div>
      <div style={{background:"#000",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",maxHeight:340,overflow:"hidden"}}>
        <video ref={vidRef} playsInline preload="auto" muted style={{maxHeight:340,width:"100%",objectFit:"contain",display:"block",cursor:"pointer"}} onClick={togglePlay}/>
        {!playing&&<div onClick={togglePlay} style={{position:"absolute",width:56,height:56,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"2px solid rgba(255,255,255,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#fff",cursor:"pointer"}}>▶</div>}
        <div style={{position:"absolute",bottom:10,right:12,background:"rgba(0,0,0,0.7)",color:"#fff",fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:5}}>{fx(curTime)}s / {fx(fullDur)}s</div>
      </div>
      <div style={{padding:"16px 20px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:6}}>
          <span style={{color:C.green,fontWeight:700}}>In: {fx(inPt,2)}s</span>
          <span style={{color:C.accent,fontWeight:700}}>Duration: {fx(selDur,2)}s</span>
          <span style={{color:C.red,fontWeight:700}}>Out: {fx(outPt,2)}s</span>
        </div>
        <div ref={tlRef} onMouseDown={onTlDown} style={{position:"relative",height:60,borderRadius:10,overflow:"hidden",cursor:"crosshair",userSelect:"none",marginBottom:10}}>
          <div style={{position:"absolute",inset:0,display:"flex"}}>
            {Array.from({length:thumbCount},(_,ti)=>{
              const tt=(ti/thumbCount)*fullDur
              const bg="url("+muxThumb(item.mux_playback_id,tt)+")"
              return<div key={ti} style={{flex:1,backgroundImage:bg,backgroundSize:"cover",backgroundPosition:"center"}}/>
            })}
          </div>
          <div style={{position:"absolute",top:0,left:0,width:inPct+"%",height:"100%",background:"rgba(0,0,0,0.65)"}}/>
          <div style={{position:"absolute",top:0,right:0,width:(100-outPct)+"%",height:"100%",background:"rgba(0,0,0,0.65)"}}/>
          <div style={{position:"absolute",top:0,left:inPct+"%",width:(outPct-inPct)+"%",height:"100%",border:"2px solid "+C.accent,boxSizing:"border-box" as const}}/>
          <div style={{position:"absolute",top:-4,left:"calc("+inPct+"% - 7px)",width:14,height:68,background:C.green,borderRadius:4,cursor:"ew-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:2,height:24,background:"rgba(255,255,255,0.8)",borderRadius:2}}/>
          </div>
          <div style={{position:"absolute",top:-4,left:"calc("+outPct+"% - 7px)",width:14,height:68,background:"#DC2626",borderRadius:4,cursor:"ew-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:2,height:24,background:"rgba(255,255,255,0.8)",borderRadius:2}}/>
          </div>
          <div style={{position:"absolute",top:0,left:"calc("+curPct+"% - 1px)",width:2,height:"100%",background:"#fff",pointerEvents:"none",zIndex:20}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginBottom:14}}>
          {Array.from({length:6},(_,ti)=><span key={ti}>{fx((ti/5)*fullDur,0)}s</span>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>seekTo(inPt)} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>⏮ In</button>
          <button onClick={togglePlay} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 0",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",flex:1}}>{playing?"⏸ Pause":"▶ Play Selection"}</button>
          <button onClick={()=>seekTo(outPt-0.1)} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Out ⏭</button>
          <button onClick={()=>{setInPt(item.start_seconds??0);setOutPt(item.end_seconds??(item.start_seconds||0)+(item.duration_seconds||fullDur))}} style={{background:"#FEF2F2",border:"1px solid #FECACA",color:C.red,borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Reset</button>
        </div>
      </div>
    </div>
  </div>
}
