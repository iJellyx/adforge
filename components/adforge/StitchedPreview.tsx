'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import type { Item, CaptionStyle, CaptionSettings } from './types'
import { C, DEFAULT_CAPTIONS } from './constants'
import { muxThumb, secColor } from './utils'
import { CaptionOverlay, buildCaptionChunks } from './CaptionOverlay'

export function StitchedPreview({sections,libraryItems,voiceoverUrl,musicUrl,captionSettings,onCaptionChange,fullWidth,onClipChange}:any){
  const [globalTime,setGlobalTime]=useState(0)
  const [playing,setPlaying]=useState(false)
  const [captions,setCaptions]=useState<CaptionSettings>(captionSettings||DEFAULT_CAPTIONS)
  const [showCaptionPanel,setShowCaptionPanel]=useState(false)
  const vidRef=useRef<HTMLVideoElement>(null)
  const voiceRef=useRef<HTMLAudioElement>(null)
  const musicRef=useRef<HTMLAudioElement>(null)
  const globalStartTimesRef=useRef<number[]>([])
  const totalDurationRef=useRef(0)
  // Ad length cap: derived from voiceover duration OR sum of trimmed clip durations.
  // Whichever we compute first. Music is always bounded by this cap.
  const adDurationRef = useRef(0)

  useEffect(()=>{if(captionSettings)setCaptions(captionSettings)},[captionSettings])
  function updateCaptions(patch:Partial<CaptionSettings>){const next={...captions,...patch};setCaptions(next);onCaptionChange?.(next)}

  const clips=(sections||[]).flatMap((s:any,sectionIdx:number)=>{
    const segments=s.clipSegments&&s.clipSegments.length>0?s.clipSegments:[{clipId:s.selectedClipId}]
    const validSegs=segments.filter((seg:any)=>seg.clipId&&libraryItems.find((i:Item)=>i.id===seg.clipId))
    const segCount=validSegs.length
    const naturalDurs=validSegs.map((seg:any)=>{const item=libraryItems.find((i:Item)=>i.id===seg.clipId);const start=seg.trimStart??item?.start_seconds??0;const end=seg.trimEnd??item?.end_seconds??(start+(item?.duration_seconds||5));return Math.max(0.5,end-start)})
    const totalNatural=naturalDurs.reduce((a:number,b:number)=>a+b,0)||1
    return validSegs.map((seg:any,segIdx:number)=>{
      const item=libraryItems.find((i:Item)=>i.id===seg.clipId)
      if(!item?.mux_playback_id)return null
      const trimStart=seg.trimStart??item.start_seconds??0
      const trimEnd=seg.trimEnd??item.end_seconds??(trimStart+(item.duration_seconds||5))
      const naturalDur=naturalDurs[segIdx]
      return{item,start:trimStart,end:trimEnd,naturalDur,naturalFraction:naturalDur/totalNatural,sectionIdx,label:s.type,spoken:segIdx===0?s.spokenWords||"":"",muted:s.muted||false,voiceover_url:s.voiceover_url||null,sectionVoUrl:s.voiceover_url||null,isFirstInSection:segIdx===0,isLastInSection:segIdx===segCount-1,segCount,segIdx,word_timestamps:segIdx===0?(s.word_timestamps||null):null}
    }).filter(Boolean)
  }).filter(Boolean)

  // Recompute on EVERY change to clips (including trim values). Using a hash
  // that captures the trim state so React re-runs when trims change even if
  // clip count is unchanged.
  const clipsHash = clips.map((c:any)=>`${c.item?.id||'_'}-${c.start||0}-${c.end||0}`).join('|')
  useEffect(()=>{
    let acc=0
    globalStartTimesRef.current=clips.map((c:any)=>{
      const t=acc
      const dur=(c.end!=null&&c.start!=null&&c.end>c.start)?(c.end-c.start):3
      acc+=dur
      return t
    })
    totalDurationRef.current=acc
    adDurationRef.current=acc
  },[clipsHash])

  const getCurrentClipIdx=()=>{
    for(let i=clips.length-1;i>=0;i--){
      if(globalTime>=globalStartTimesRef.current[i])return i
    }
    return 0
  }

  const cur=clips[getCurrentClipIdx()]
  const clipIdx=getCurrentClipIdx()

  useEffect(()=>{
    const v=vidRef.current;if(!v||!cur)return
    v.src=`https://stream.mux.com/${cur.item.mux_playback_id}/capped-1080p.mp4`
    const clipGlobalStart=globalStartTimesRef.current[clipIdx]||0
    const sectionRelativeTime=globalTime-clipGlobalStart
    function seek(){if(v)v.currentTime=cur!.start+sectionRelativeTime}
    if(v.readyState>=1)seek();else v.addEventListener("loadedmetadata",seek,{once:true})
    if(playing)v.play().catch(()=>{})
    if(onClipChange)onClipChange(clipIdx)
  },[clipIdx,cur?.item.mux_playback_id])

  function onTimeUpdate(){
    const v=vidRef.current;if(!v||!cur)return
    const clipGlobalStart=globalStartTimesRef.current[clipIdx]||0
    const sectionRelativeTime=v.currentTime-cur.start
    const newGlobalTime=clipGlobalStart+sectionRelativeTime
    setGlobalTime(newGlobalTime)
    // Only re-seek audio if there's significant drift (>250ms). Constantly
    // setting currentTime on every timeupdate caused the voiceover to
    // stutter/reverb because the audio engine was re-decoding on each set.
    if(voiceRef.current&&voiceoverUrl&&!voiceRef.current.paused){
      const drift=Math.abs(voiceRef.current.currentTime-newGlobalTime)
      if(drift>0.25)voiceRef.current.currentTime=newGlobalTime
    }
    if(musicRef.current&&musicUrl&&!musicRef.current.paused){
      const drift=Math.abs(musicRef.current.currentTime-newGlobalTime)
      if(drift>0.25)musicRef.current.currentTime=newGlobalTime
      // Hard-stop music if it somehow exceeds ad duration (e.g. music track is
      // longer than the composition — which is usually the case for 3-min tracks
      // with a 30-sec ad). This enforces the ad length cap.
      if(musicRef.current.currentTime>=totalDurationRef.current){
        musicRef.current.pause()
      }
    }
    if(newGlobalTime>=totalDurationRef.current){
      v.pause();setPlaying(false);setGlobalTime(0);voiceRef.current?.pause();musicRef.current?.pause()
    }
  }

  function toggle(){
    const v=vidRef.current;if(!v)return
    if(playing){v.pause();voiceRef.current?.pause();musicRef.current?.pause();setPlaying(false)}
    else{
      v.play().catch(()=>{})
      if(voiceRef.current&&voiceoverUrl){voiceRef.current.currentTime=globalTime;voiceRef.current.play().catch(()=>{})}
      if(musicRef.current&&musicUrl){musicRef.current.currentTime=globalTime;musicRef.current.volume=0.2;musicRef.current.play().catch(()=>{})}
      setPlaying(true)
    }
  }

  function seekToClip(targetClipIdx:number){
    const targetGlobalStart=globalStartTimesRef.current[targetClipIdx]||0
    seekToTime(targetGlobalStart, false)
  }

  // Seek the whole composition to a specific global time. If the global time
  // falls inside a different clip, switch clips. Keep playback state.
  function seekToTime(targetGlobalTime:number, keepPlaying:boolean = playing){
    const clamped=Math.max(0,Math.min(totalDurationRef.current||0, targetGlobalTime))
    // Find which clip this time falls into
    let targetIdx=0
    for(let i=clips.length-1;i>=0;i--){
      if(clamped >= (globalStartTimesRef.current[i]||0)){ targetIdx=i; break }
    }
    const clipStartT=globalStartTimesRef.current[targetIdx]||0
    const sectionRelativeTime=clamped-clipStartT
    const targetClip=clips[targetIdx]
    // If same clip, just seek video element. If different clip, trigger reload via state.
    const v=vidRef.current
    setGlobalTime(clamped)
    if(v && targetClip){
      const desiredVideoTime = targetClip.start + sectionRelativeTime
      if(targetIdx===clipIdx){
        // Same clip — just move currentTime
        try{ v.currentTime = desiredVideoTime }catch{}
      } else {
        // Different clip — src will change via useEffect; seek happens in loadedmetadata
      }
    }
    if(voiceRef.current){ voiceRef.current.currentTime = clamped }
    if(musicRef.current){ musicRef.current.currentTime = clamped }
    if(!keepPlaying){
      vidRef.current?.pause()
      voiceRef.current?.pause()
      musicRef.current?.pause()
      setPlaying(false)
    }
  }

  // Scrub-bar drag handling
  const scrubRef=useRef<HTMLDivElement>(null)
  function getPctFromScrub(e:MouseEvent|React.MouseEvent):number{
    const rect=scrubRef.current?.getBoundingClientRect(); if(!rect) return 0
    return Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))
  }
  const [scrubbing,setScrubbing]=useState(false)
  useEffect(()=>{
    if(!scrubbing) return
    function onMove(e:MouseEvent){
      const p=getPctFromScrub(e)
      seekToTime(p*(totalDurationRef.current||0), false)
    }
    function onUp(){ setScrubbing(false) }
    window.addEventListener("mousemove",onMove)
    window.addEventListener("mouseup",onUp)
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp)}
  },[scrubbing])

  if(clips.length===0)return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:32,textAlign:"center",color:C.muted}}><div style={{fontSize:28,marginBottom:8}}>🎬</div><div style={{fontSize:13}}>Assign clips to sections to preview the full ad</div></div>

  const sc=secColor(cur?.label)
  const clipGlobalStart=globalStartTimesRef.current[clipIdx]||0
  const nextClipStart=clipIdx<clips.length-1?(globalStartTimesRef.current[clipIdx+1]||totalDurationRef.current):totalDurationRef.current
  const clipElapsedTime=globalTime-clipGlobalStart
  const clipDur=Math.max(1,nextClipStart-clipGlobalStart)

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,overflow:"hidden"}}>
    {voiceoverUrl&&<audio ref={voiceRef} key={voiceoverUrl} src={voiceoverUrl} style={{display:"none"}}/>}
    {/* No `loop` — music is bounded by ad duration and paused when it reaches the end. */}
    {musicUrl&&<audio ref={musicRef} src={musicUrl} style={{display:"none"}}/>}

    <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <div style={{fontWeight:700,fontSize:14}}>🎬 Preview</div>
      <span style={{fontSize:11,color:C.muted}}>{clips.length} clips</span>
      {voiceoverUrl&&<span style={{fontSize:10,color:C.green,background:"#22c55e11",padding:"2px 7px",borderRadius:99,border:"1px solid #22c55e33"}}>🎙️</span>}
      {musicUrl&&<span style={{fontSize:10,color:C.accent,background:C.accentSoft,padding:"2px 7px",borderRadius:99,border:"1px solid "+C.accent+"33"}}>🎵</span>}
      <div style={{flex:1}}/>
      <button onClick={()=>updateCaptions({enabled:!captions.enabled})} style={{background:captions.enabled?C.accent:C.surface,color:captions.enabled?"#fff":C.muted,border:"1.5px solid "+(captions.enabled?C.accent:C.border),borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>CC {captions.enabled?"On":"Off"}</button>
      <button onClick={()=>setShowCaptionPanel(v=>!v)} style={{background:showCaptionPanel?C.accentSoft:C.surface,border:"1px solid "+(showCaptionPanel?C.accent:C.border),color:showCaptionPanel?C.accent:C.muted,borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11}}>⚙ Captions</button>
      <span style={{background:sc?.bg,color:sc?.color,border:"1px solid "+sc?.bd,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5}}>{cur?.label}</span>
    </div>

    {showCaptionPanel&&<div style={{background:C.bg,borderBottom:"1px solid "+C.border,padding:"12px 14px",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:6}}>Style</div>
        <div style={{display:"flex",gap:6}}>
          {([["word","Word by word"],["line","Full line"],["karaoke","Karaoke"]] as [CaptionStyle,string][]).map(([v,l])=>
            <button key={v} onClick={()=>updateCaptions({style:v})} style={{background:captions.style===v?C.accent:C.surface,color:captions.style===v?"#fff":C.muted,border:"1px solid "+(captions.style===v?C.accent:C.border),borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:captions.style===v?700:400}}>{l}</button>
          )}
        </div>
      </div>
      <div>
        <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:6}}>Size</div>
        <div style={{display:"flex",gap:6}}>
          {([[18,"S"],[22,"M"],[28,"L"],[34,"XL"]] as [number,string][]).map(([v,l])=>
            <button key={v} onClick={()=>updateCaptions({fontSize:v})} style={{background:captions.fontSize===v?C.accent:C.surface,color:captions.fontSize===v?"#fff":C.muted,border:"1px solid "+(captions.fontSize===v?C.accent:C.border),borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:captions.fontSize===v?700:400}}>{l}</button>
          )}
        </div>
      </div>
      <div>
        <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:6}}>Accent colour</div>
        <div style={{display:"flex",gap:6}}>
          {[C.accent,"#FFD700","#FF3B5C","#00C4B4","#FF6B35","#fff"].map(col=>
            <button key={col} onClick={()=>updateCaptions({accentColor:col})} style={{width:24,height:24,borderRadius:"50%",background:col,border:"2px solid "+(captions.accentColor===col?"#fff":C.border),cursor:"pointer",outline:captions.accentColor===col?"2px solid "+C.accent:"none",outlineOffset:"1px"}}/>
          )}
          <input type="color" value={captions.accentColor} onChange={e=>updateCaptions({accentColor:e.target.value})} style={{width:24,height:24,borderRadius:"50%",border:"none",cursor:"pointer",padding:0,background:"none"}} title="Custom colour"/>
        </div>
      </div>
    </div>}

    <div style={{display:"grid",gridTemplateColumns:fullWidth?"1fr":"1fr 260px"}}>
      <div style={{position:"relative",background:"#000",display:"flex",alignItems:"center",justifyContent:"center",minHeight:320}}>
        {/* Mute clip audio when voiceover is present to prevent overlapping dialogue (turbine effect) */}
        <video ref={vidRef} playsInline preload="metadata" muted={!!voiceoverUrl || cur?.muted || false} style={{maxHeight:480,maxWidth:"100%",display:"block",cursor:"pointer"}} onTimeUpdate={onTimeUpdate} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onClick={toggle}/>
        {captions.enabled&&<CaptionOverlay spoken={cur?.spoken||""} elapsed={clipElapsedTime} clipDur={clipDur} settings={captions} wordTimestamps={cur?.word_timestamps||undefined}/>}
        {!playing&&<div onClick={toggle} style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:5}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:"#000a",border:"2px solid #fff4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>▶</div>
          {(voiceoverUrl||musicUrl)&&<div style={{position:"absolute",bottom:16,fontSize:11,color:"#fff",background:"#000a",padding:"3px 10px",borderRadius:99}}>{[voiceoverUrl?"🎙️ Voiceover":"",musicUrl?"🎵 Music":""].filter(Boolean).join(" + ")} will play</div>}
        </div>}
      </div>
      {!fullWidth&&<div style={{borderLeft:"1px solid "+C.border,overflowY:"auto",maxHeight:480}}>
        <div style={{padding:"8px 10px",borderBottom:"1px solid "+C.border,fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1}}>Timeline</div>
        {clips.map((clip:any,i:number)=>{const sc2=secColor(clip.label);const active=i===clipIdx;return<div key={i} onClick={()=>seekToClip(i)} style={{display:"flex",gap:8,padding:"8px 10px",borderBottom:"1px solid "+C.border,cursor:"pointer",background:active?C.accentSoft:"transparent"}}>
          <div style={{width:34,position:"relative",paddingTop:"60px",flexShrink:0,borderRadius:5,overflow:"hidden",background:"#111",border:"1px solid "+(active?C.accent:C.border)}}>{clip.item.mux_playback_id&&<img src={muxThumb(clip.item.mux_playback_id,clip.item.thumbnail_time||0)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{background:sc2.bg,color:sc2.color,fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:3,display:"inline-block",marginBottom:3}}>{clip.label}</div>
            <div style={{fontSize:10,color:active?C.text:C.muted,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>{clip.spoken||clip.item.title}</div>
          </div>
        </div>})}
      </div>}
    </div>

    <div style={{padding:"12px 16px",borderTop:"1px solid "+C.border}}>
      {/* Scrubbable master timeline — click anywhere or drag the playhead */}
      {(()=>{
        const total=totalDurationRef.current||0
        const globalPct=total>0?(globalTime/total)*100:0
        return<div
          ref={scrubRef}
          onMouseDown={(e)=>{setScrubbing(true); const p=getPctFromScrub(e); seekToTime(p*total,false)}}
          style={{position:"relative",height:26,borderRadius:6,cursor:"pointer",userSelect:"none",marginBottom:10,background:C.bg,border:"1px solid "+C.border}}
        >
          {/* Section-colored background segments */}
          <div style={{position:"absolute",inset:0,display:"flex",borderRadius:6,overflow:"hidden"}}>
            {clips.map((clip:any,i:number)=>{
              const sc2=secColor(clip.label)
              const start=globalStartTimesRef.current[i]||0
              const next=i<clips.length-1?(globalStartTimesRef.current[i+1]||total):total
              const widthPct=total>0?((next-start)/total)*100:0
              return<div key={i} title={`${clip.label} · ${(next-start).toFixed(1)}s`}
                onClick={(e)=>{e.stopPropagation();seekToClip(i)}}
                style={{
                  width:widthPct+"%",
                  height:"100%",
                  background:sc2.bg,
                  borderRight:i<clips.length-1?"1px solid "+C.card:"none",
                  position:"relative",
                  overflow:"hidden"
                }}>
                {/* Label overlay (only if segment wide enough) */}
                {widthPct>8 && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:sc2.color,pointerEvents:"none",letterSpacing:"0.05em"}}>{clip.label}</div>}
              </div>
            })}
          </div>
          {/* Progress fill */}
          <div style={{position:"absolute",top:0,left:0,width:globalPct+"%",height:"100%",background:"rgba(139,127,255,0.16)",borderRight:"2px solid "+C.accent,pointerEvents:"none",borderRadius:"6px 0 0 6px"}}/>
          {/* Playhead */}
          <div style={{position:"absolute",top:-4,left:`calc(${globalPct}% - 5px)`,width:10,height:34,background:C.accent,borderRadius:3,pointerEvents:"none",boxShadow:"0 2px 6px rgba(0,0,0,0.4)",zIndex:5}}/>
        </div>
      })()}

      {/* Controls row */}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button onClick={()=>seekToTime(0,false)} title="Restart" style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>⏮</button>
        <button onClick={()=>seekToClip(Math.max(0,clipIdx-1))} disabled={clipIdx===0} title="Previous section" style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"5px 10px",cursor:clipIdx===0?"not-allowed":"pointer",opacity:clipIdx===0?0.4:1,fontSize:12,fontFamily:"inherit"}}>‹</button>
        <button onClick={toggle} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>{playing?"⏸ Pause":"▶ Play"}</button>
        <button onClick={()=>seekToClip(Math.min(clips.length-1,clipIdx+1))} disabled={clipIdx===clips.length-1} title="Next section" style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"5px 10px",cursor:clipIdx===clips.length-1?"not-allowed":"pointer",opacity:clipIdx===clips.length-1?0.4:1,fontSize:12,fontFamily:"inherit"}}>›</button>
        <span style={{fontSize:11,color:C.muted,fontVariantNumeric:"tabular-nums"}}>{globalTime.toFixed(1)}s / {(totalDurationRef.current||0).toFixed(1)}s</span>
        <span style={{fontSize:10,color:C.muted,marginLeft:8}}>· Section {clipIdx+1}/{clips.length} · <strong style={{color:secColor(cur?.label).color}}>{cur?.label}</strong></span>
        {musicUrl&&<div style={{display:"flex",alignItems:"center",gap:5,marginLeft:"auto"}}>
          <span style={{fontSize:10,color:C.muted}}>🎵</span>
          <input type="range" min="0" max="1" step="0.05" defaultValue="0.2" onChange={e=>{if(musicRef.current)musicRef.current.volume=parseFloat(e.target.value)}} style={{width:60,accentColor:C.accent,cursor:"pointer"}}/>
        </div>}
      </div>
    </div>
  </div>
}
