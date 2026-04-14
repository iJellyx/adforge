'use client'
import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Scissors, Volume2, VolumeX, Film, Sparkles, ArrowUp, ArrowDown, X, Wand2, Loader2 } from 'lucide-react'
import type { Item } from './types'
import { C, SEC_TYPES } from './constants'
import { muxThumb, secColor, callClaude } from './utils'
import { ClipSegmentPlayer } from './ClipSegmentPlayer'
import { ClipPickerModal } from './ClipPickerModal'
import { TrimEditorModal } from './TrimEditorModal'

export function ScriptTable({sections,onChange,libraryItems,readOnly,brandName,productName,voiceoverUrl}:any){
  const [pickerIdx,setPickerIdx]=useState<number|null>(null)
  const [fillingIdx,setFillingIdx]=useState<number|null>(null)
  const [trimModalData,setTrimModalData]=useState<any>(null)
  const [activeIdx,setActiveIdx]=useState(0)
  const [mutedClips,setMutedClips]=useState<Record<number,boolean>>(()=>{
    if(!voiceoverUrl)return{}
    const m:Record<number,boolean>={};(sections||[]).forEach((_:any,i:number)=>{m[i]=true});return m
  })
  const [allMuted,setAllMuted]=useState(!!voiceoverUrl)
  const [editingScript,setEditingScript]=useState(false)
  const [regeneratingSection,setRegeneratingSection]=useState<number|null>(null)
  const timelineRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{
    if(voiceoverUrl&&sections.length>0&&!sections[0].hasOwnProperty('muted')){
      onChange(sections.map((s:any)=>({...s,muted:true})))
    }
  },[voiceoverUrl])

  function updM(idx:number,obj:any){onChange(sections.map((s:any,i:number)=>i===idx?{...s,...obj}:s))}
  function upd(idx:number,key:string,val:any){onChange(sections.map((s:any,i:number)=>i===idx?{...s,[key]:val}:s))}
  function addRow(){onChange([...sections,{id:Date.now(),type:"BODY",spokenWords:"",visualDirection:"",matchedClipIds:[],selectedClipId:null,autoSelected:false}])}
  function removeRow(idx:number){if(activeIdx>=sections.length-1)setActiveIdx(Math.max(0,sections.length-2));onChange(sections.filter((_:any,i:number)=>i!==idx))}
  function move(idx:number,dir:number){const a=[...sections],t=idx+dir;if(t<0||t>=a.length)return;[a[idx],a[t]]=[a[t],a[idx]];setActiveIdx(t);onChange(a)}
  function toggleMuteAll(){const next=!allMuted;setAllMuted(next);const m:Record<number,boolean>={};sections.forEach((_:any,i:number)=>{m[i]=next});setMutedClips(m);onChange(sections.map((s:any)=>({...s,muted:next})))}
  function toggleMuteClip(idx:number){const next=!mutedClips[idx];setMutedClips(prev=>({...prev,[idx]:next}));updM(idx,{muted:next})}

  async function autofillRow(idx:number){
    const row=sections[idx];setFillingIdx(idx)
    try{const ctx=sections.map((s:any,i:number)=>`[${i===idx?"-> THIS":"  "}] ${s.type}: ${(s.spokenWords||"(empty)").substring(0,60)}`).join("\n");const raw=await callClaude([{role:"user",content:`Write a ${row.type} section for a direct response video ad.\nBrand: ${brandName||"Unknown"}\nProduct: ${productName||"Unknown"}\n\nContext:\n${ctx}\n\nReturn ONLY JSON: {"spokenWords":"exact words","visualDirection":"what is on screen"}`}],400);const data=JSON.parse(raw.replace(/```json|```/g,"").trim());updM(idx,{spokenWords:data.spokenWords||row.spokenWords,visualDirection:data.visualDirection||row.visualDirection})}catch(e){console.error(e)}
    setFillingIdx(null)
  }

  const allClips=sections.flatMap((s:any,sIdx:number)=>{
    const segs=s.clipSegments&&s.clipSegments.length>0?s.clipSegments:[{id:`seg-${sIdx}-0`,clipId:s.selectedClipId||null}]
    return segs.map((seg:any,segIdx:number)=>{
      const clip=seg.clipId?libraryItems.find((i:Item)=>i.id===seg.clipId):null
      return{sIdx,segIdx,seg,clip,type:s.type,spoken:s.spokenWords||""}
    })
  })

  const activeRow=sections[activeIdx]||sections[0]
  const activeClip=activeRow?.selectedClipId?libraryItems.find((i:Item)=>i.id===activeRow.selectedClipId):null
  const activeSc=secColor(activeRow?.type)
  const alternatives=(activeRow?.matchedClipIds||[]).filter((id:string)=>id!==activeRow?.selectedClipId).map((id:string)=>libraryItems.find((i:Item)=>i.id===id)).filter(Boolean).slice(0,6)

  useEffect(()=>{
    const el=timelineRef.current?.querySelector(`[data-tidx="${activeIdx}"]`) as HTMLElement
    if(el)el.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"})
  },[activeIdx])

  return<div className="bg-card border border-border rounded-lg overflow-hidden">
    {trimModalData&&<TrimEditorModal item={trimModalData.segClip} trimStart={trimModalData.seg.trimStart} trimEnd={trimModalData.seg.trimEnd} originalDuration={libraryItems.find((i:Item)=>i.id===trimModalData.segClip.parent_id)?.duration_seconds||trimModalData.segClip.duration_seconds||30} onSave={(updates:any)=>{const{idx,segIdx}=trimModalData;const currentSegs=sections[idx]?.clipSegments&&sections[idx].clipSegments.length>0?sections[idx].clipSegments:[{id:"seg-"+idx+"-0",clipId:sections[idx]?.selectedClipId}];const newSegs=currentSegs.map((s:any,si:number)=>si===segIdx?{...s,...updates}:s);onChange(sections.map((s:any,i:number)=>i===idx?{...s,clipSegments:newSegs}:s));setTrimModalData(null)}} onClose={()=>setTrimModalData(null)}/>}
    {pickerIdx!==null&&<ClipPickerModal currentId={pickerIdx>=1000?sections[Math.floor(pickerIdx/1000)]?.clipSegments?.[pickerIdx%1000]?.clipId:sections[pickerIdx]?.selectedClipId} matchedIds={sections[Math.floor(pickerIdx>=1000?pickerIdx/1000:pickerIdx)]?.matchedClipIds||[]} libraryItems={libraryItems} sectionLabel={sections[Math.floor(pickerIdx>=1000?pickerIdx/1000:pickerIdx)]?.type||""} onSelect={(id:string)=>{const secIdx=pickerIdx>=1000?Math.floor(pickerIdx/1000):pickerIdx;const segIdx=pickerIdx>=1000?pickerIdx%1000:0;const currentSegs=sections[secIdx]?.clipSegments&&sections[secIdx].clipSegments.length>0?sections[secIdx].clipSegments:[{id:`seg-${secIdx}-0`,clipId:sections[secIdx]?.selectedClipId||null}];const newSegs=currentSegs.map((seg:any,si:number)=>si===segIdx?{...seg,clipId:id}:seg);onChange(sections.map((s:any,i:number)=>i===secIdx?{...s,clipSegments:newSegs,selectedClipId:newSegs[0]?.clipId||id,autoSelected:false}:s))}} onClose={()=>setPickerIdx(null)}/>}

    {/* Top bar */}
    <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5 bg-surface">
      <div className="font-bold text-sm flex items-center gap-1.5"><Film className="w-4 h-4" /> Ad Editor</div>
      <span className="text-xs text-text-muted">{sections.length} sections · {allClips.filter((c:any)=>c.clip).length} clips</span>
      {voiceoverUrl&&<span className="text-[10px] text-success bg-success-soft px-2 py-0.5 rounded-full border border-success/30 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Voiceover</span>}
      <div className="flex-1"/>
      <button onClick={toggleMuteAll} className={`rounded-md px-2.5 py-1 cursor-pointer text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${allMuted?"bg-danger-soft border border-danger/40 text-danger":"bg-accent-soft border border-accent/30 text-accent"}`}>
        {allMuted?<><VolumeX className="w-3.5 h-3.5" /> Muted</>:<><Volume2 className="w-3.5 h-3.5" /> Audio</>}
      </button>
    </div>

    {/* Main area: Preview + Detail panel */}
    <div className="grid grid-cols-[1fr_320px]" style={{height:360}}>
      {/* Left: Large clip preview */}
      <div className="relative bg-black flex items-center justify-center overflow-hidden">
        {activeClip?.mux_playback_id?<div className="w-full h-full flex items-center justify-center">
          <ClipSegmentPlayer playbackId={activeClip.mux_playback_id} start={activeClip.start_seconds||0} end={activeClip.end_seconds} muted={mutedClips[activeIdx]||false}/>
        </div>:<div className="text-center text-text-muted p-10">
          <Film className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <div className="text-sm font-semibold mb-1">No clip assigned</div>
          <div className="text-xs">Click "Change Clip" to assign one</div>
        </div>}
        {/* Section badge overlay */}
        <div className="absolute top-3 left-3 text-[10px] font-extrabold px-2.5 py-1 rounded-md backdrop-blur-sm" style={{background:activeSc.bg,color:activeSc.color,border:"1px solid "+activeSc.bd}}>{activeRow?.type}</div>
        {activeClip&&activeRow?.autoSelected&&<div className="absolute top-3 left-[100px] bg-success text-white text-[9px] font-extrabold px-2 py-0.5 rounded flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> AI Matched</div>}
        {/* Navigation arrows */}
        <button onClick={()=>setActiveIdx(Math.max(0,activeIdx-1))} disabled={activeIdx===0} className={`absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 border border-white/10 rounded-md px-3 py-2 backdrop-blur-sm transition-all duration-150 ${activeIdx===0?"text-white/20 cursor-default":"text-white cursor-pointer hover:bg-black/80"}`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={()=>setActiveIdx(Math.min(sections.length-1,activeIdx+1))} disabled={activeIdx>=sections.length-1} className={`absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 border border-white/10 rounded-md px-3 py-2 backdrop-blur-sm transition-all duration-150 ${activeIdx>=sections.length-1?"text-white/20 cursor-default":"text-white cursor-pointer hover:bg-black/80"}`}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Section detail panel */}
      <div className="border-l border-border flex flex-col overflow-hidden">
        {/* Section header */}
        <div className="px-3.5 py-2.5 border-b border-border" style={{background:activeSc.bg}}>
          <div className="flex items-center justify-between gap-2">
            {readOnly?<span className="text-xs font-extrabold" style={{color:activeSc.color}}>{activeRow?.type}</span>:<select value={activeRow?.type} onChange={e=>upd(activeIdx,"type",e.target.value)} className="bg-transparent border-none text-xs font-extrabold outline-none cursor-pointer" style={{color:activeSc.color}}>{SEC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>}
            <div className="flex gap-1">
              {!readOnly&&<button onClick={()=>move(activeIdx,-1)} disabled={activeIdx===0} className="bg-transparent border border-border text-text-muted rounded px-1.5 py-0.5 cursor-pointer text-[10px] hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50"><ArrowUp className="w-3 h-3" /></button>}
              {!readOnly&&<button onClick={()=>move(activeIdx,1)} disabled={activeIdx>=sections.length-1} className="bg-transparent border border-border text-text-muted rounded px-1.5 py-0.5 cursor-pointer text-[10px] hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50"><ArrowDown className="w-3 h-3" /></button>}
              {!readOnly&&<button onClick={()=>removeRow(activeIdx)} className="bg-danger-soft border border-danger/30 text-danger rounded px-1.5 py-0.5 cursor-pointer text-[10px] hover:bg-danger/20 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-danger/50"><X className="w-3 h-3" /></button>}
            </div>
          </div>
        </div>

        {/* Script text */}
        <div className="px-3.5 py-2.5 border-b border-border overflow-auto transition-all duration-200" style={{flex:editingScript?1:0,minHeight:editingScript?120:0,maxHeight:editingScript?300:80}}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Script</span>
            <div className="flex gap-2 items-center">
              {!readOnly&&activeRow?.voiceover_url&&<button onClick={()=>{setRegeneratingSection(activeIdx);const fn=(window as any).__voiceoverRegenerateSection;if(fn)fn(activeIdx,(success:boolean)=>{setRegeneratingSection(null)})}} disabled={regeneratingSection===activeIdx} className={`bg-transparent border border-success rounded-md px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-success/50 ${regeneratingSection===activeIdx?"text-text-muted cursor-default":"text-success cursor-pointer hover:bg-success-soft"}`}>
                <RefreshCw className={`w-3 h-3 ${regeneratingSection===activeIdx?"animate-spin":""}`} /> {regeneratingSection===activeIdx?"Re-voicing...":"Re-voice"}
              </button>}
              {!readOnly&&<button onClick={()=>setEditingScript(!editingScript)} className="bg-transparent border-none text-accent cursor-pointer text-[10px] font-semibold hover:underline transition-all duration-150">{editingScript?"Collapse":"Edit"}</button>}
            </div>
          </div>
          {fillingIdx===activeIdx?<div className="text-text-muted text-xs italic flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> AI writing...</div>
          :editingScript&&!readOnly?<>
            <textarea value={activeRow?.spokenWords||""} onChange={e=>upd(activeIdx,"spokenWords",e.target.value)} placeholder="Spoken words..." className="w-full bg-bg border border-border rounded-md resize-none text-text text-xs leading-relaxed outline-none font-inherit min-h-[60px] p-1.5 mb-1.5 focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150"/>
            <textarea value={activeRow?.visualDirection||""} onChange={e=>upd(activeIdx,"visualDirection",e.target.value)} placeholder="Visual direction..." className="w-full bg-bg border border-border rounded-md resize-none text-text-muted text-xs leading-normal outline-none font-inherit min-h-[40px] p-1.5 focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150"/>
            <div className="flex gap-1.5 mt-1.5">
              {!readOnly&&activeRow?.voiceover_url&&<button onClick={()=>{setRegeneratingSection(activeIdx);const fn=(window as any).__voiceoverRegenerateSection;if(fn)fn(activeIdx,(success:boolean)=>{setRegeneratingSection(null)})}} disabled={regeneratingSection===activeIdx} className={`border border-success rounded-md px-2.5 py-1 cursor-pointer text-[10px] font-semibold flex items-center gap-1 transition-all duration-150 ${regeneratingSection===activeIdx?"bg-border text-text-muted":"bg-success-soft text-success hover:bg-success hover:text-white"}`}>
                <RefreshCw className={`w-3 h-3 ${regeneratingSection===activeIdx?"animate-spin":""}`} /> {regeneratingSection===activeIdx?"Re-voicing...":"Re-voice"}
              </button>}
              {!readOnly&&<button onClick={()=>autofillRow(activeIdx)} disabled={!!fillingIdx} className="bg-accent-soft border border-accent/30 text-accent rounded-md px-2.5 py-1 cursor-pointer text-[10px] font-semibold flex items-center gap-1 hover:bg-accent hover:text-white transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
                <Wand2 className="w-3 h-3" /> AI Rewrite
              </button>}
            </div>
          </>
          :<div>
            <div className="text-xs leading-relaxed text-text mb-0.5">{(activeRow?.spokenWords||"No script").substring(0,120)}{(activeRow?.spokenWords||"").length>120?"...":""}</div>
            {activeRow?.visualDirection&&<div className="text-[10px] text-text-muted italic">{activeRow.visualDirection.substring(0,80)}</div>}
          </div>}
        </div>

        {/* Clip actions + match score */}
        <div className="px-3.5 py-2.5 border-b border-border">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Clip</span>
            {(()=>{const activeSeg=(activeRow?.clipSegments||[])[0];const score=activeSeg?.match_score;if(score==null)return null;const sc=score>=80?{cls:"text-success bg-success-soft border-success/30",label:"Great Match"}:score>=60?{cls:"text-warning bg-warning-soft border-warning/30",label:"Fair Match"}:{cls:"text-danger bg-danger-soft border-danger/30",label:"Weak Match"};return<div className="flex items-center gap-1.5"><span className={`text-[10px] font-semibold ${sc.cls.split(" ")[0]}`}>{sc.label}</span><span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${sc.cls}`}>{score}%</span></div>})()}
          </div>
          {(()=>{const activeSeg=(activeRow?.clipSegments||[])[0];return activeSeg?.reason?<div className="text-xs text-text-muted mb-2 italic leading-snug flex items-start gap-1.5"><Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5 text-accent" /> {activeSeg.reason}</div>:null})()}
          <div className="flex gap-1.5 flex-wrap">
            {!readOnly&&<button onClick={()=>setPickerIdx(activeIdx*1000)} className="bg-accent text-white border-none rounded-md px-3 py-1.5 cursor-pointer text-xs font-bold hover:bg-accent-hover transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Change Clip</button>}
            {activeClip&&!readOnly&&<button onClick={()=>{const seg=(activeRow?.clipSegments||[{id:"seg-"+activeIdx+"-0",clipId:activeRow?.selectedClipId}])[0];setTrimModalData({segClip:activeClip,idx:activeIdx,segIdx:0,seg})}} className="bg-surface text-text border border-border rounded-md px-3 py-1.5 cursor-pointer text-xs font-semibold hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center gap-1"><Scissors className="w-3 h-3" /> Trim</button>}
            {activeClip&&<button onClick={()=>toggleMuteClip(activeIdx)} className={`border rounded-md px-3 py-1.5 cursor-pointer text-xs font-semibold flex items-center gap-1 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${mutedClips[activeIdx]?"bg-danger-soft text-danger border-danger/30":"bg-surface text-text border-border hover:border-border-strong"}`}>
              {mutedClips[activeIdx]?<><VolumeX className="w-3 h-3" /> Muted</>:<><Volume2 className="w-3 h-3" /> Audio</>}
            </button>}
          </div>
        </div>

        {/* Section duration control */}
        {!readOnly&&<div className="px-3.5 py-2.5 border-b border-border">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Section Duration</span>
            <span className="text-xs font-bold text-text">{activeRow?.targetDuration?activeRow.targetDuration.toFixed(1)+"s":"Auto"}</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="range" min="1" max="15" step="0.5" value={activeRow?.targetDuration||0} onChange={e=>{const v=parseFloat(e.target.value);upd(activeIdx,"targetDuration",v>0?v:null)}} className="flex-1 accent-accent cursor-pointer"/>
            {activeRow?.targetDuration&&<button onClick={()=>upd(activeIdx,"targetDuration",null)} className="bg-transparent border border-border text-text-muted rounded px-1.5 py-0.5 cursor-pointer text-[9px] hover:border-border-strong transition-all duration-150">Auto</button>}
          </div>
          <div className="text-[9px] text-text-muted mt-1">{activeRow?.targetDuration?"Clips and voiceover will conform to this duration":"Duration driven by clip length or voiceover"}</div>
        </div>}

        {/* Quick-swap alternatives */}
        {alternatives.length>0&&<div className="px-3.5 py-2.5 flex-1 overflow-auto">
          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Quick Swap</div>
          <div className="grid grid-cols-3 gap-1.5">
            {alternatives.map((alt:Item)=><div key={alt.id} title={alt.title} onClick={()=>{if(!readOnly){const segs=activeRow?.clipSegments&&activeRow.clipSegments.length>0?activeRow.clipSegments:[{id:`seg-${activeIdx}-0`,clipId:activeRow?.selectedClipId}];const newSegs=segs.map((s:any,si:number)=>si===0?{...s,clipId:alt.id}:s);updM(activeIdx,{clipSegments:newSegs,selectedClipId:alt.id,autoSelected:false})}}} className={`relative pt-[177%] bg-black rounded-md overflow-hidden border-2 border-border transition-all duration-150 ${readOnly?"cursor-default":"cursor-pointer hover:border-accent"}`}>
              {alt.mux_playback_id?<img src={muxThumb(alt.mux_playback_id,alt.thumbnail_time||alt.start_seconds||0)} alt="" className="absolute inset-0 w-full h-full object-cover"/>:<div className="absolute inset-0 flex items-center justify-center"><Film className="w-4 h-4 text-text-muted" /></div>}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-3 text-[8px] text-white font-semibold truncate">{alt.title}</div>
            </div>)}
          </div>
        </div>}
      </div>
    </div>

    {/* Timeline track */}
    <div className="border-t border-border bg-bg">
      <div ref={timelineRef} className="overflow-x-auto px-3 py-2.5 flex gap-1 scroll-smooth">
        {sections.map((row:any,idx:number)=>{
          const sc=secColor(row.type)
          const segs=row.clipSegments&&row.clipSegments.length>0?row.clipSegments:[{id:`seg-${idx}-0`,clipId:row.selectedClipId||null}]
          const isActive=idx===activeIdx
          return<div key={row.id||idx} data-tidx={idx} onClick={()=>setActiveIdx(idx)} className="flex gap-0.5 cursor-pointer flex-shrink-0">
            {segs.map((seg:any,segIdx:number)=>{
              const clip=seg.clipId?libraryItems.find((i:Item)=>i.id===seg.clipId):null
              return<div key={seg.id||segIdx} className={`w-20 rounded-md overflow-hidden border-2 bg-card transition-all duration-150 ${isActive?"border-accent -translate-y-0.5":"border-transparent"}`}>
                <div className={`relative pt-[56.25%] overflow-hidden ${clip?"bg-black":"bg-accent-soft"}`}>
                  {clip?.mux_playback_id?<img src={muxThumb(clip.mux_playback_id,clip.thumbnail_time||clip.start_seconds||0)} alt="" className="absolute inset-0 w-full h-full object-cover"/>:<div className="absolute inset-0 flex items-center justify-center text-text-muted"><Film className="w-3.5 h-3.5" /></div>}
                  {row.autoSelected&&segIdx===0&&<div className="absolute top-0.5 left-0.5 bg-success text-white text-[6px] font-extrabold px-1 rounded">AI</div>}
                  {seg.match_score!=null&&<div className={`absolute top-0.5 right-0.5 text-white text-[7px] font-extrabold px-1 rounded ${seg.match_score>=80?"bg-success/80":seg.match_score>=60?"bg-warning/80":"bg-danger/80"}`}>{seg.match_score}%</div>}
                </div>
                <div className="px-1 py-0.5 border-t-2" style={{background:sc.bg,borderTopColor:sc.color}}>
                  <div className="text-[7px] font-extrabold uppercase tracking-wide truncate" style={{color:sc.color}}>{row.type}{segs.length>1?` ${segIdx+1}/${segs.length}`:""}</div>
                </div>
              </div>
            })}
          </div>
        })}
        {!readOnly&&<button onClick={addRow} className="w-11 h-14 flex-shrink-0 bg-transparent border-2 border-dashed border-border text-text-muted rounded-md cursor-pointer text-lg flex items-center justify-center self-start hover:border-accent hover:text-accent transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">+</button>}
      </div>
    </div>
  </div>
}
