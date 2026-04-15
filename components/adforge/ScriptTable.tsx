'use client'
import { useState, useEffect, useRef } from 'react'
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
    try{const ctx=sections.map((s:any,i:number)=>`[${i===idx?"→ THIS":"  "}] ${s.type}: ${(s.spokenWords||"(empty)").substring(0,60)}`).join("\n");const raw=await callClaude([{role:"user",content:`Write a ${row.type} section for a direct response video ad.\nBrand: ${brandName||"Unknown"}\nProduct: ${productName||"Unknown"}\n\nContext:\n${ctx}\n\nReturn ONLY JSON: {"spokenWords":"exact words","visualDirection":"what is on screen"}`}],400);const data=JSON.parse(raw.replace(/```json|```/g,"").trim());updM(idx,{spokenWords:data.spokenWords||row.spokenWords,visualDirection:data.visualDirection||row.visualDirection})}catch(e){console.error(e)}
    setFillingIdx(null)
  }

  // Build flat list of all clip segments for the timeline
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

  // Scroll timeline to keep active section visible
  useEffect(()=>{
    const el=timelineRef.current?.querySelector(`[data-tidx="${activeIdx}"]`) as HTMLElement
    if(el)el.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"})
  },[activeIdx])

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,overflow:"hidden"}}>
    {trimModalData&&<TrimEditorModal item={trimModalData.segClip} trimStart={trimModalData.seg.trimStart} trimEnd={trimModalData.seg.trimEnd} originalDuration={libraryItems.find((i:Item)=>i.id===trimModalData.segClip.parent_id)?.duration_seconds||trimModalData.segClip.duration_seconds||30} onSave={(updates:any)=>{const{idx,segIdx}=trimModalData;const currentSegs=sections[idx]?.clipSegments&&sections[idx].clipSegments.length>0?sections[idx].clipSegments:[{id:"seg-"+idx+"-0",clipId:sections[idx]?.selectedClipId}];const newSegs=currentSegs.map((s:any,si:number)=>si===segIdx?{...s,...updates}:s);onChange(sections.map((s:any,i:number)=>i===idx?{...s,clipSegments:newSegs}:s));setTrimModalData(null)}} onClose={()=>setTrimModalData(null)}/>}
    {pickerIdx!==null&&<ClipPickerModal currentId={pickerIdx>=1000?sections[Math.floor(pickerIdx/1000)]?.clipSegments?.[pickerIdx%1000]?.clipId:sections[pickerIdx]?.selectedClipId} matchedIds={sections[Math.floor(pickerIdx>=1000?pickerIdx/1000:pickerIdx)]?.matchedClipIds||[]} libraryItems={libraryItems} sectionLabel={sections[Math.floor(pickerIdx>=1000?pickerIdx/1000:pickerIdx)]?.type||""} onSelect={(id:string)=>{const secIdx=pickerIdx>=1000?Math.floor(pickerIdx/1000):pickerIdx;const segIdx=pickerIdx>=1000?pickerIdx%1000:0;const currentSegs=sections[secIdx]?.clipSegments&&sections[secIdx].clipSegments.length>0?sections[secIdx].clipSegments:[{id:`seg-${secIdx}-0`,clipId:sections[secIdx]?.selectedClipId||null}];const newSegs=currentSegs.map((seg:any,si:number)=>si===segIdx?{...seg,clipId:id}:seg);onChange(sections.map((s:any,i:number)=>i===secIdx?{...s,clipSegments:newSegs,selectedClipId:newSegs[0]?.clipId||id,autoSelected:false}:s))}} onClose={()=>setPickerIdx(null)}/>}

    {/* ── Top bar ── */}
    <div style={{padding:"10px 16px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:10,background:C.surface}}>
      <div style={{fontWeight:700,fontSize:14}}>🎬 Ad Editor</div>
      <span style={{fontSize:11,color:C.muted}}>{sections.length} sections · {allClips.filter((c:any)=>c.clip).length} clips</span>
      {voiceoverUrl&&<span style={{fontSize:10,color:C.green,background:"#22c55e11",padding:"2px 7px",borderRadius:99,border:"1px solid #22c55e33"}}>🎙️ Voiceover</span>}
      <div style={{flex:1}}/>
      <button onClick={toggleMuteAll} style={{background:allMuted?"#ef444422":C.accentSoft,border:"1px solid "+(allMuted?"#ef444466":C.accent+"44"),color:allMuted?"#ef4444":C.accent,borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>{allMuted?"🔇 Muted":"🔊 Audio"}</button>
    </div>

    {/* ── Main area: Preview + Detail panel ── */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 320px",height:360}}>
      {/* Left: Large clip preview */}
      <div style={{position:"relative",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        {activeClip?.mux_playback_id?<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <ClipSegmentPlayer playbackId={activeClip.mux_playback_id} start={activeClip.start_seconds||0} end={activeClip.end_seconds} muted={mutedClips[activeIdx]||false}/>
        </div>:<div style={{textAlign:"center",color:C.muted,padding:40}}>
          <div style={{fontSize:40,marginBottom:8}}>🎬</div>
          <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>No clip assigned</div>
          <div style={{fontSize:12}}>Click "Change Clip" to assign one</div>
        </div>}
        {/* Section badge overlay */}
        <div style={{position:"absolute",top:12,left:12,background:activeSc.bg,color:activeSc.color,fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:6,border:"1px solid "+activeSc.bd,backdropFilter:"blur(8px)"}}>{activeRow?.type}</div>
        {activeClip&&activeRow?.autoSelected&&<div style={{position:"absolute",top:12,left:activeSc?100:12,background:C.green,color:"#fff",fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:4}}>AI Matched</div>}
        {/* Navigation arrows */}
        <button onClick={()=>setActiveIdx(Math.max(0,activeIdx-1))} disabled={activeIdx===0} style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",background:"#000a",border:"1px solid #fff2",color:activeIdx===0?"#fff3":"#fff",borderRadius:8,padding:"8px 12px",cursor:activeIdx===0?"default":"pointer",fontSize:16,backdropFilter:"blur(4px)"}}>‹</button>
        <button onClick={()=>setActiveIdx(Math.min(sections.length-1,activeIdx+1))} disabled={activeIdx>=sections.length-1} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"#000a",border:"1px solid #fff2",color:activeIdx>=sections.length-1?"#fff3":"#fff",borderRadius:8,padding:"8px 12px",cursor:activeIdx>=sections.length-1?"default":"pointer",fontSize:16,backdropFilter:"blur(4px)"}}>›</button>
      </div>

      {/* Right: Section detail panel */}
      <div style={{borderLeft:"1px solid "+C.border,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Section header */}
        <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border,background:activeSc.bg}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            {readOnly?<span style={{color:activeSc.color,fontSize:12,fontWeight:800}}>{activeRow?.type}</span>:<select value={activeRow?.type} onChange={e=>upd(activeIdx,"type",e.target.value)} style={{background:"transparent",color:activeSc.color,border:"none",fontSize:12,fontWeight:800,outline:"none",cursor:"pointer"}}>{SEC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>}
            <div style={{display:"flex",gap:4}}>
              {!readOnly&&<button onClick={()=>move(activeIdx,-1)} disabled={activeIdx===0} style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:10}}>← Move</button>}
              {!readOnly&&<button onClick={()=>move(activeIdx,1)} disabled={activeIdx>=sections.length-1} style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:10}}>Move →</button>}
              {!readOnly&&<button onClick={()=>removeRow(activeIdx)} style={{background:"#ef444422",border:"1px solid #ef444433",color:"#ef4444",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:10}}>×</button>}
            </div>
          </div>
        </div>

        {/* Script text */}
        <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border,flex:editingScript?1:0,minHeight:editingScript?120:0,maxHeight:editingScript?300:80,overflow:"auto",transition:"all 0.2s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1}}>Script</span>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {!readOnly&&activeRow?.voiceover_url&&<button onClick={()=>{setRegeneratingSection(activeIdx);const fn=(window as any).__voiceoverRegenerateSection;if(fn)fn(activeIdx,(success:boolean)=>{setRegeneratingSection(null)})}} disabled={regeneratingSection===activeIdx} title="Regenerate voiceover for this section" style={{background:"none",border:"1px solid "+C.green,color:regeneratingSection===activeIdx?C.muted:C.green,cursor:regeneratingSection===activeIdx?"default":"pointer",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:600}}>🔄 {regeneratingSection===activeIdx?"Re-voicing…":"Re-voice"}</button>}
              {!readOnly&&<button onClick={()=>setEditingScript(!editingScript)} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:10,fontWeight:600}}>{editingScript?"Collapse":"Edit"}</button>}
            </div>
          </div>
          {fillingIdx===activeIdx?<div style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>AI writing…</div>
          :editingScript&&!readOnly?<>
            <textarea value={activeRow?.spokenWords||""} onChange={e=>upd(activeIdx,"spokenWords",e.target.value)} placeholder="Spoken words…" style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:6,resize:"none",color:C.text,fontSize:12,lineHeight:1.6,outline:"none",fontFamily:"inherit",minHeight:60,boxSizing:"border-box",padding:"6px 8px",marginBottom:6}}/>
            <textarea value={activeRow?.visualDirection||""} onChange={e=>upd(activeIdx,"visualDirection",e.target.value)} placeholder="Visual direction…" style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:6,resize:"none",color:C.muted,fontSize:11,lineHeight:1.5,outline:"none",fontFamily:"inherit",minHeight:40,boxSizing:"border-box",padding:"6px 8px"}}/>
            <div style={{display:"flex",gap:6,marginTop:6}}>
              {!readOnly&&activeRow?.voiceover_url&&<button onClick={()=>{setRegeneratingSection(activeIdx);const fn=(window as any).__voiceoverRegenerateSection;if(fn)fn(activeIdx,(success:boolean)=>{setRegeneratingSection(null)})}} disabled={regeneratingSection===activeIdx} style={{background:regeneratingSection===activeIdx?C.border:"#22c55e22",border:"1px solid "+C.green,color:regeneratingSection===activeIdx?C.muted:C.green,borderRadius:6,padding:"4px 10px",cursor:regeneratingSection===activeIdx?"default":"pointer",fontSize:10,fontWeight:600}}>🔄 {regeneratingSection===activeIdx?"Re-voicing…":"Re-voice"}</button>}
              {!readOnly&&<button onClick={()=>autofillRow(activeIdx)} disabled={!!fillingIdx} style={{background:C.accentSoft,border:"1px solid "+C.accent+"44",color:C.accent,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:600}}>✨ AI Rewrite</button>}
            </div>
          </>
          :<div>
            <div style={{fontSize:12,lineHeight:1.6,color:C.text,marginBottom:2}}>{(activeRow?.spokenWords||"No script").substring(0,120)}{(activeRow?.spokenWords||"").length>120?"…":""}</div>
            {activeRow?.visualDirection&&<div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{activeRow.visualDirection.substring(0,80)}</div>}
          </div>}
        </div>

        {/* Clip actions + match score */}
        <div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1}}>Clip</span>
            {(()=>{const activeSeg=(activeRow?.clipSegments||[])[0];const score=activeSeg?.match_score;if(score==null)return null;const sc=score>=80?{bg:"#22c55e22",color:C.green,label:"Great Match"}:score>=60?{bg:"#f59e0b22",color:C.yellow,label:"Fair Match"}:{bg:"#ef444422",color:"#ef4444",label:"Weak Match"};return<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10,color:sc.color,fontWeight:600}}>{sc.label}</span><span style={{background:sc.bg,color:sc.color,fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:99,border:"1px solid "+sc.color+"33"}}>{score}%</span></div>})()}
          </div>
          {(()=>{const activeSeg=(activeRow?.clipSegments||[])[0];return activeSeg?.reason?<div style={{fontSize:11,color:C.muted,marginBottom:8,fontStyle:"italic",lineHeight:1.4}}>💡 {activeSeg.reason}</div>:null})()}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {!readOnly&&<button onClick={()=>setPickerIdx(activeIdx*1000)} style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>⇄ Change Clip</button>}
            {activeClip&&!readOnly&&<button onClick={()=>{const seg=(activeRow?.clipSegments||[{id:"seg-"+activeIdx+"-0",clipId:activeRow?.selectedClipId}])[0];setTrimModalData({segClip:activeClip,idx:activeIdx,segIdx:0,seg})}} style={{background:C.surface,color:C.text,border:"1px solid "+C.border,borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:600}}>✂️ Trim</button>}
            {activeClip&&<button onClick={()=>toggleMuteClip(activeIdx)} style={{background:mutedClips[activeIdx]?"#ef444422":C.surface,color:mutedClips[activeIdx]?"#ef4444":C.text,border:"1px solid "+(mutedClips[activeIdx]?"#ef444433":C.border),borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:600}}>{mutedClips[activeIdx]?"🔇 Muted":"🔊 Audio"}</button>}
          </div>
        </div>

        {/* Section duration control */}
        {!readOnly&&<div style={{padding:"10px 14px",borderBottom:"1px solid "+C.border}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1}}>Section Duration</span>
            <span style={{fontSize:11,fontWeight:700,color:C.text}}>{activeRow?.targetDuration!=null?Number(activeRow.targetDuration).toFixed(1)+"s":"Auto"}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input type="range" min="1" max="15" step="0.5" value={activeRow?.targetDuration||0} onChange={e=>{const v=parseFloat(e.target.value);upd(activeIdx,"targetDuration",v>0?v:null)}} style={{flex:1,accentColor:C.accent,cursor:"pointer"}}/>
            {activeRow?.targetDuration&&<button onClick={()=>upd(activeIdx,"targetDuration",null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9}}>Auto</button>}
          </div>
          <div style={{fontSize:9,color:C.muted,marginTop:4}}>{activeRow?.targetDuration?"Clips and voiceover will conform to this duration":"Duration driven by clip length or voiceover"}</div>
        </div>}

        {/* Quick-swap alternatives */}
        {alternatives.length>0&&<div style={{padding:"10px 14px",flex:1,overflow:"auto"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:8}}>Quick Swap</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
            {alternatives.map((alt:Item)=><div key={alt.id} title={alt.title} onClick={()=>{if(!readOnly){const segs=activeRow?.clipSegments&&activeRow.clipSegments.length>0?activeRow.clipSegments:[{id:`seg-${activeIdx}-0`,clipId:activeRow?.selectedClipId}];const newSegs=segs.map((s:any,si:number)=>si===0?{...s,clipId:alt.id}:s);updM(activeIdx,{clipSegments:newSegs,selectedClipId:alt.id,autoSelected:false})}}} style={{position:"relative",paddingTop:"177%",background:"#111",borderRadius:6,overflow:"hidden",cursor:readOnly?"default":"pointer",border:"2px solid "+C.border,transition:"border-color 0.15s"}} onMouseEnter={e=>(e.currentTarget.style.borderColor=C.accent)} onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
              {alt.mux_playback_id?<img src={muxThumb(alt.mux_playback_id,alt.thumbnail_time||alt.start_seconds||0)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🎬</div>}
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,#000c)",padding:"12px 4px 3px",fontSize:8,color:"#fff",fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{alt.title}</div>
            </div>)}
          </div>
        </div>}
      </div>
    </div>

    {/* ── Timeline track ── */}
    <div style={{borderTop:"1px solid "+C.border,background:C.bg}}>
      <div ref={timelineRef} style={{overflowX:"auto",padding:"10px 12px",display:"flex",gap:4,scrollBehavior:"smooth"}}>
        {sections.map((row:any,idx:number)=>{
          const sc=secColor(row.type)
          const segs=row.clipSegments&&row.clipSegments.length>0?row.clipSegments:[{id:`seg-${idx}-0`,clipId:row.selectedClipId||null}]
          const isActive=idx===activeIdx
          return<div key={row.id||idx} data-tidx={idx} onClick={()=>setActiveIdx(idx)} style={{display:"flex",gap:2,cursor:"pointer",flexShrink:0}}>
            {segs.map((seg:any,segIdx:number)=>{
              const clip=seg.clipId?libraryItems.find((i:Item)=>i.id===seg.clipId):null
              return<div key={seg.id||segIdx} style={{width:80,borderRadius:6,overflow:"hidden",border:"2px solid "+(isActive?C.accent:"transparent"),transition:"border-color 0.15s,transform 0.15s",transform:isActive?"translateY(-2px)":"none",background:C.card}}>
                <div style={{position:"relative",paddingTop:"56.25%",background:clip?"#111":"#E8E6FF",overflow:"hidden"}}>
                  {clip?.mux_playback_id?<img src={muxThumb(clip.mux_playback_id,clip.thumbnail_time||clip.start_seconds||0)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:C.muted}}>🎬</div>}
                  {row.autoSelected&&segIdx===0&&<div style={{position:"absolute",top:2,left:2,background:C.green,color:"#fff",fontSize:6,fontWeight:800,padding:"0px 3px",borderRadius:2}}>AI</div>}
                  {seg.match_score!=null&&<div style={{position:"absolute",top:2,right:2,background:seg.match_score>=80?"#22c55ecc":seg.match_score>=60?"#f59e0bcc":"#ef4444cc",color:"#fff",fontSize:7,fontWeight:800,padding:"0px 3px",borderRadius:2}}>{seg.match_score}%</div>}
                </div>
                <div style={{padding:"3px 4px",background:sc.bg,borderTop:"2px solid "+sc.color}}>
                  <div style={{fontSize:7,fontWeight:800,color:sc.color,textTransform:"uppercase" as const,letterSpacing:0.5,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{row.type}{segs.length>1?` ${segIdx+1}/${segs.length}`:""}</div>
                </div>
              </div>
            })}
          </div>
        })}
        {!readOnly&&<button onClick={addRow} style={{width:44,height:56,flexShrink:0,background:"none",border:"2px dashed "+C.border,color:C.muted,borderRadius:6,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",alignSelf:"flex-start"}}>+</button>}
      </div>
    </div>
  </div>
}
