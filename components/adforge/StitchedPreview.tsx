'use client'
import { useState, useEffect, useRef } from 'react'
import { Play, Pause, ChevronLeft, ChevronRight, Film, Mic, Music, Volume2, Settings } from 'lucide-react'
import type { Item, CaptionStyle, CaptionSettings } from './types'
import { C, DEFAULT_CAPTIONS } from './constants'
import { muxThumb, secColor } from './utils'
import { CaptionOverlay, buildCaptionChunks } from './CaptionOverlay'

export function StitchedPreview({sections,libraryItems,voiceoverUrl,musicUrl,captionSettings,onCaptionChange}:any){
  const [globalTime,setGlobalTime]=useState(0)
  const [playing,setPlaying]=useState(false)
  const [captions,setCaptions]=useState<CaptionSettings>(captionSettings||DEFAULT_CAPTIONS)
  const [showCaptionPanel,setShowCaptionPanel]=useState(false)
  const vidRef=useRef<HTMLVideoElement>(null)
  const voiceRef=useRef<HTMLAudioElement>(null)
  const musicRef=useRef<HTMLAudioElement>(null)
  const globalStartTimesRef=useRef<number[]>([])
  const totalDurationRef=useRef(0)

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

  useEffect(()=>{
    let acc=0
    globalStartTimesRef.current=clips.map((c:any)=>{const t=acc;const dur=(c.end!=null&&c.start!=null&&c.end>c.start)?(c.end-c.start):3;acc+=dur;return t})
    totalDurationRef.current=acc
  },[clips.length])

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
  },[clipIdx,cur?.item.mux_playback_id])

  function onTimeUpdate(){
    const v=vidRef.current;if(!v||!cur)return
    const clipGlobalStart=globalStartTimesRef.current[clipIdx]||0
    const sectionRelativeTime=v.currentTime-cur.start
    const newGlobalTime=clipGlobalStart+sectionRelativeTime
    setGlobalTime(newGlobalTime)
    if(voiceRef.current&&voiceoverUrl){voiceRef.current.currentTime=newGlobalTime}
    if(musicRef.current&&musicUrl){musicRef.current.currentTime=newGlobalTime}
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
    setGlobalTime(targetGlobalStart)
    if(voiceRef.current){voiceRef.current.currentTime=targetGlobalStart;voiceRef.current.pause()}
    if(musicRef.current){musicRef.current.currentTime=targetGlobalStart;musicRef.current.pause()}
    setPlaying(false)
  }

  if(clips.length===0)return<div className="bg-card border border-border rounded-lg p-8 text-center text-text-muted">
    <Film className="w-7 h-7 mx-auto mb-2 opacity-50" />
    <div className="text-sm">Assign clips to sections to preview the full ad</div>
  </div>

  const sc=secColor(cur?.label)
  const clipGlobalStart=globalStartTimesRef.current[clipIdx]||0
  const nextClipStart=clipIdx<clips.length-1?(globalStartTimesRef.current[clipIdx+1]||totalDurationRef.current):totalDurationRef.current
  const clipElapsedTime=globalTime-clipGlobalStart
  const clipDur=Math.max(1,nextClipStart-clipGlobalStart)

  return<div className="bg-card border border-border rounded-lg overflow-hidden">
    {voiceoverUrl&&<audio ref={voiceRef} key={voiceoverUrl} src={voiceoverUrl} className="hidden"/>}
    {musicUrl&&<audio ref={musicRef} src={musicUrl} className="hidden" loop/>}

    <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
      <div className="font-bold text-sm flex items-center gap-1.5"><Film className="w-4 h-4" /> Preview</div>
      <span className="text-xs text-text-muted">{clips.length} clips</span>
      {voiceoverUrl&&<span className="text-[10px] text-success bg-success-soft px-2 py-0.5 rounded-full border border-success/30 flex items-center gap-1"><Mic className="w-3 h-3" /></span>}
      {musicUrl&&<span className="text-[10px] text-accent bg-accent-soft px-2 py-0.5 rounded-full border border-accent/30 flex items-center gap-1"><Music className="w-3 h-3" /></span>}
      <div className="flex-1"/>
      <button onClick={()=>updateCaptions({enabled:!captions.enabled})} className={`rounded-md px-2.5 py-1 cursor-pointer text-xs font-bold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${captions.enabled?"bg-accent text-white border-[1.5px] border-accent":"bg-surface text-text-muted border-[1.5px] border-border hover:border-border-strong"}`}>CC {captions.enabled?"On":"Off"}</button>
      <button onClick={()=>setShowCaptionPanel(v=>!v)} className={`rounded-md px-2.5 py-1 cursor-pointer text-xs transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center gap-1 ${showCaptionPanel?"bg-accent-soft border border-accent text-accent":"bg-surface border border-border text-text-muted hover:border-border-strong"}`}>
        <Settings className="w-3 h-3" /> Captions
      </button>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{background:sc?.bg,color:sc?.color,borderColor:sc?.bd}}>{cur?.label}</span>
    </div>

    {showCaptionPanel&&<div className="bg-bg border-b border-border px-3.5 py-3 flex gap-4 flex-wrap items-center">
      <div>
        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Style</div>
        <div className="flex gap-1.5">
          {([["word","Word by word"],["line","Full line"],["karaoke","Karaoke"]] as [CaptionStyle,string][]).map(([v,l])=>
            <button key={v} onClick={()=>updateCaptions({style:v})} className={`rounded-md px-2.5 py-1.5 cursor-pointer text-xs transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${captions.style===v?"bg-accent text-white font-bold border border-accent":"bg-surface text-text-muted border border-border hover:border-border-strong"}`}>{l}</button>
          )}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Size</div>
        <div className="flex gap-1.5">
          {([[18,"S"],[22,"M"],[28,"L"],[34,"XL"]] as [number,string][]).map(([v,l])=>
            <button key={v} onClick={()=>updateCaptions({fontSize:v})} className={`rounded-md px-2.5 py-1.5 cursor-pointer text-xs transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${captions.fontSize===v?"bg-accent text-white font-bold border border-accent":"bg-surface text-text-muted border border-border hover:border-border-strong"}`}>{l}</button>
          )}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Accent colour</div>
        <div className="flex gap-1.5">
          {[C.accent,"#FFD700","#FF3B5C","#00C4B4","#FF6B35","#fff"].map(col=>
            <button key={col} onClick={()=>updateCaptions({accentColor:col})} className={`w-6 h-6 rounded-full cursor-pointer transition-all duration-150 ${captions.accentColor===col?"ring-2 ring-accent ring-offset-1 ring-offset-bg":""}`} style={{background:col,border:"2px solid "+(captions.accentColor===col?"#fff":C.border)}}/>
          )}
          <input type="color" value={captions.accentColor} onChange={e=>updateCaptions({accentColor:e.target.value})} className="w-6 h-6 rounded-full border-none cursor-pointer p-0 bg-transparent" title="Custom colour"/>
        </div>
      </div>
    </div>}

    <div className="grid grid-cols-[1fr_260px]">
      <div className="relative bg-black flex items-center justify-center min-h-[320px]">
        <video ref={vidRef} playsInline preload="metadata" muted={cur?.muted||false} className="max-h-[480px] max-w-full block cursor-pointer" onTimeUpdate={onTimeUpdate} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onClick={toggle}/>
        {captions.enabled&&<CaptionOverlay spoken={cur?.spoken||""} elapsed={clipElapsedTime} clipDur={clipDur} settings={captions} wordTimestamps={cur?.word_timestamps||undefined}/>}
        {!playing&&<div onClick={toggle} className="absolute inset-0 flex items-center justify-center cursor-pointer z-5">
          <div className="w-13 h-13 rounded-full bg-black/60 border-2 border-white/30 flex items-center justify-center hover:bg-black/80 transition-all duration-150">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </div>
          {(voiceoverUrl||musicUrl)&&<div className="absolute bottom-4 text-xs text-white bg-black/60 px-2.5 py-1 rounded-full flex items-center gap-1.5">{voiceoverUrl&&<><Mic className="w-3 h-3" /> Voiceover</>}{voiceoverUrl&&musicUrl&&" + "}{musicUrl&&<><Music className="w-3 h-3" /> Music</>} will play</div>}
        </div>}
      </div>
      <div className="border-l border-border overflow-y-auto max-h-[480px]">
        <div className="px-2.5 py-2 border-b border-border text-[10px] font-bold text-text-muted uppercase tracking-wider">Timeline</div>
        {clips.map((clip:any,i:number)=>{const sc2=secColor(clip.label);const active=i===clipIdx;return<div key={i} onClick={()=>seekToClip(i)} className={`flex gap-2 px-2.5 py-2 border-b border-border cursor-pointer transition-colors duration-150 ${active?"bg-accent-soft":"hover:bg-card-hover"}`}>
          <div className={`w-[34px] relative h-[60px] flex-shrink-0 rounded-md overflow-hidden bg-black border ${active?"border-accent":"border-border"}`}>{clip.item.mux_playback_id&&<img src={muxThumb(clip.item.mux_playback_id,clip.item.thumbnail_time||0)} alt="" className="absolute inset-0 w-full h-full object-cover"/>}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[8px] font-extrabold px-1.5 py-0.5 rounded inline-block mb-1" style={{background:sc2.bg,color:sc2.color}}>{clip.label}</div>
            <div className={`text-[10px] leading-snug overflow-hidden line-clamp-2 ${active?"text-text":"text-text-muted"}`}>{clip.spoken||clip.item.title}</div>
          </div>
        </div>})}
      </div>
    </div>

    <div className="px-4 py-2.5 border-t border-border">
      <div className="flex gap-0.5 mb-2">
        {clips.map((clip:any,i:number)=>{const sc2=secColor(clip.label);const active=i===clipIdx;return<div key={i} onClick={()=>seekToClip(i)} title={clip.label} className="flex-1 h-1.5 rounded-sm cursor-pointer transition-all duration-150" style={{background:active?sc2.color:sc2.bg}}/>})}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={()=>seekToClip(Math.max(0,clipIdx-1))} disabled={clipIdx===0} className="bg-transparent border border-border text-text-muted rounded-md px-2.5 py-1.5 cursor-pointer hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={toggle} className="bg-accent text-white border-none rounded-md px-4.5 py-2 cursor-pointer text-sm font-semibold flex items-center gap-1.5 hover:bg-accent-hover transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
          {playing?<><Pause className="w-4 h-4" /> Pause</>:<><Play className="w-4 h-4" /> Play Full Ad</>}
        </button>
        <button onClick={()=>seekToClip(Math.min(clips.length-1,clipIdx+1))} disabled={clipIdx===clips.length-1} className="bg-transparent border border-border text-text-muted rounded-md px-2.5 py-1.5 cursor-pointer hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-text-muted">{clipIdx+1}/{clips.length}</span>
        {musicUrl&&<div className="flex items-center gap-1.5 ml-auto">
          <Music className="w-3 h-3 text-text-muted" />
          <input type="range" min="0" max="1" step="0.05" defaultValue="0.2" onChange={e=>{if(musicRef.current)musicRef.current.volume=parseFloat(e.target.value)}} className="w-15 accent-accent cursor-pointer"/>
        </div>}
      </div>
    </div>
  </div>
}
