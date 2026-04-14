'use client'
import { useState, useRef } from 'react'
import MuxPlayer from "@mux/mux-player-react"
import type { Item } from './types'
import { C } from './constants'
import { muxThumb, fmt, secColor, callClaude } from './utils'
import { Btn, Label, STitle, Input } from './ui-primitives'
import { VideoCard } from './VideoCard'
import { StitchedPreview } from './StitchedPreview'
import { ExportVideo } from './ExportVideo'
import { MusicPicker } from './MusicPicker'
import { createClient } from '@/lib/supabase/client'

export function BRollMode({libraryItems,onSaveForgedAd,onBack,workspaceId}:any){
  const [step,setStep]=useState<"upload"|"match"|"preview">("upload")
  const [baseItem,setBaseItem]=useState<Item|null>(null)
  const [matching,setMatching]=useState(false)
  const [brollSections,setBrollSections]=useState<any[]>([])
  const [musicUrl,setMusicUrl]=useState<string|null>(null)
  const [musicName,setMusicName]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  const [dragOver,setDragOver]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [uploadProgress,setUploadProgress]=useState(0)
  const [uploadMsg,setUploadMsg]=useState("")
  const [uploadFile,setUploadFile]=useState<File|null>(null)
  const [uploadTitle,setUploadTitle]=useState("")
  const [pickingIdx,setPickingIdx]=useState<number|null>(null)

  function handleFile(file:File|null){
    if(!file||!file.type.startsWith("video/"))return
    setUploadFile(file)
    const name=file.name.replace(/\.[^/.]+$/,"").replace(/[_-]+/g," ")
    if(!uploadTitle)setUploadTitle(name)
  }

  async function handleUploadBase(){
    if(!uploadFile||!uploadTitle.trim())return
    setUploading(true);setUploadProgress(5);setUploadMsg("Creating record…")
    try{
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:uploadFile.name,contentType:uploadFile.type,metadata:{title:uploadTitle},workspaceId})})
      const{itemId,uploadUrl,error}=await res.json()
      if(error)throw new Error(error)
      setUploadProgress(10);setUploadMsg("Uploading video…")
      await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(10+Math.round((e.loaded/e.total)*70))};xhr.onload=()=>resolve();xhr.onerror=()=>reject(new Error("Upload failed"));xhr.open("PUT",uploadUrl);xhr.setRequestHeader("Content-Type",uploadFile.type);xhr.send(uploadFile)})
      setUploadProgress(85);setUploadMsg("Processing… (1–3 mins)")
      let attempts=0
      while(attempts<60){
        await new Promise(r=>setTimeout(r,5000))
        const sr=await fetch(`/api/items/${itemId}/status`)
        const status=await sr.json()
        if(status.mux_status==="ready"){setUploadProgress(100);setUploadMsg("Done! ✓");const{data}=await createClient().from("items").select("*").eq("id",itemId).single();setBaseItem(data);break}
        if(status.mux_status==="errored")throw new Error("Processing failed")
        attempts++
      }
      setStep("match")
    }catch(e:any){setUploadMsg("Upload failed: "+e.message)}
    setUploading(false)
  }

  async function useExistingBase(item:Item){setBaseItem(item);await generateBrollSections(item)}

  async function generateBrollSections(item:Item){
    setMatching(true)
    try{
      const dur=item.duration_seconds||30
      const transcript=item.analysis?.summary||item.description||item.title||""
      const prompt=`You are a video editor planning b-roll for a direct response ad.
Base video: "${item.title}" (${dur}s)
Summary: ${transcript}

Split this video into 3-6 time segments where b-roll would improve it (e.g. product shots during product mention, lifestyle clips during benefit claims, reaction clips during social proof).

Library clips available: ${libraryItems.slice(0,30).map((i:Item)=>`ID:${i.id}|${i.title}|tags:${(i.analysis?.scene_tags||[]).join(",")}`).join("\n")}

Return ONLY valid JSON:
{"segments":[{"start_seconds":0,"end_seconds":5,"label":"HOOK","description":"What is being said here","suggested_broll":"what type of b-roll would work here","clip_id":"best matching ID from library or null"}]}`

      const raw=await callClaude([{role:"user",content:prompt}],800)
      const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
      setBrollSections((data.segments||[]).map((s:any,i:number)=>({
        id:i,
        start_seconds:s.start_seconds||0,
        end_seconds:s.end_seconds||5,
        label:s.label||"BODY",
        description:s.description||"",
        suggested_broll:s.suggested_broll||"",
        selectedClipId:s.clip_id&&libraryItems.find((it:Item)=>it.id===s.clip_id)?s.clip_id:null,
        autoSelected:!!s.clip_id,
      })))
      setStep("match")
    }catch(e){console.error(e)}
    setMatching(false)
  }

  async function saveAd(status:"draft"|"complete"){
    setSaving(true)
    const sections=brollSections.map(s=>({...s,type:s.label,spokenWords:s.description,visualDirection:s.suggested_broll}))
    await onSaveForgedAd({title:`B-Roll: ${baseItem?.title||"Untitled"}`,status,mode:"broll",sections,music_url:musicUrl,music_name:musicName,metadata:{baseItemId:baseItem?.id,baseTitle:baseItem?.title}})
    setSaving(false)
    onBack()
  }

  // Library items to pick existing base
  const originals=libraryItems.filter((i:Item)=>i.type==="original"&&i.mux_playback_id)

  if(step==="upload")return<div style={{maxWidth:700,margin:"0 auto",padding:28}}>
    <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back</button>
    <STitle size={22}>Add B-Roll to Existing Video</STitle>
    <div style={{color:C.muted,fontSize:14,marginBottom:24}}>Upload your existing video ad or talking head — the original audio stays intact. AI will suggest b-roll clips from your library to overlay at the right moments.</div>

    {/* Use existing from library */}
    {originals.length>0&&<div style={{marginBottom:24}}>
      <Label>Use a video already in your library</Label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:8}}>
        {originals.slice(0,8).map((item:Item)=><div key={item.id} onClick={()=>useExistingBase(item)} style={{cursor:"pointer"}}>
          <div style={{position:"relative",paddingTop:"177.78%",background:"#111",borderRadius:8,overflow:"hidden"}}>
            {item.mux_playback_id&&<img src={muxThumb(item.mux_playback_id,item.thumbnail_time||0)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}
          </div>
          <div style={{fontSize:10,color:C.text,marginTop:4,lineHeight:1.3,fontWeight:600,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>{item.title}</div>
        </div>)}
      </div>
      {matching&&<div style={{textAlign:"center",padding:20,color:C.muted}}>⏳ AI is analysing and matching b-roll…</div>}
    </div>}

    <div style={{borderTop:"1px solid "+C.border,paddingTop:20}}>
      <Label>Or upload a new video</Label>
      <div onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onClick={()=>{if(!uploadFile)fileRef.current?.click()}} style={{border:"2px dashed "+(dragOver?C.accent:C.border),borderRadius:12,padding:"24px 20px",textAlign:"center",cursor:uploadFile?"default":"pointer",background:dragOver?C.accentSoft:C.surface,marginBottom:12}}>
        <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>{handleFile(e.target.files?.[0]||null);e.target.value=""}}/>
        {uploadFile?<div><div style={{fontSize:28,marginBottom:6}}>🎬</div><div style={{fontWeight:600,color:C.green,marginBottom:4}}>✓ {uploadFile.name}</div><div style={{fontSize:11,color:C.muted}}>{(uploadFile.size/1024/1024).toFixed(1)} MB</div></div>:<div><div style={{fontSize:28,marginBottom:6}}>🎬</div><div style={{fontWeight:600,marginBottom:4}}>Drop video or click</div><div style={{fontSize:11,color:C.muted}}>Your existing ad or talking head</div></div>}
      </div>
      {uploadFile&&<div style={{marginBottom:12}}><Label>Title</Label><Input value={uploadTitle} onChange={(e:any)=>setUploadTitle(e.target.value)} placeholder="e.g. Sarah Founder Story"/></div>}
      {uploading&&<div style={{marginBottom:12}}><div style={{height:5,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:6}}><div style={{height:"100%",width:uploadProgress+"%",background:C.accent,borderRadius:4,transition:"width 0.3s"}}/></div><div style={{fontSize:11,color:C.muted}}>{uploadMsg}</div></div>}
      {uploadFile&&<Btn onClick={handleUploadBase} disabled={uploading||!uploadTitle.trim()} style={{background:uploading?C.border:C.accent,color:"#fff",width:"100%",padding:12,borderRadius:10}}>{uploading?`⏳ ${uploadMsg}`:"Upload & Match B-Roll"}</Btn>}
    </div>
  </div>

  if(step==="match")return<div style={{padding:20}}>
    <button onClick={()=>setStep("upload")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back</button>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <div>
        <STitle size={20} mb={4}>B-Roll Segments</STitle>
        <div style={{fontSize:13,color:C.muted}}>Base video: <strong style={{color:C.text}}>{baseItem?.title}</strong> · {fmt(baseItem?.duration_seconds)}</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={()=>generateBrollSections(baseItem!)} disabled={matching} style={{background:matching?C.border:C.accentSoft,color:matching?C.muted:C.accent,border:"1px solid "+C.accent+"44"}}>{matching?"🔍 Matching…":"🔄 Re-match"}</Btn>
        <Btn onClick={()=>setStep("preview")} style={{background:C.accent,color:"#fff"}}>Next: Preview →</Btn>
      </div>
    </div>

    {baseItem?.mux_playback_id&&<div style={{marginBottom:20}}>
      <div style={{borderRadius:12,overflow:"hidden",background:"#000",maxWidth:320}}>
        <MuxPlayer playbackId={baseItem.mux_playback_id} streamType="on-demand" accentColor={C.accent} style={{width:"100%",aspectRatio:"9/16",display:"block"}}/>
      </div>
    </div>}

    <div style={{display:"flex",gap:0,overflowX:"auto",paddingBottom:8}}>
      {brollSections.map((seg:any,idx:number)=>{
        const sc=secColor(seg.label)
        const clip=seg.selectedClipId?libraryItems.find((i:Item)=>i.id===seg.selectedClipId):null
        return<div key={seg.id} style={{width:220,flexShrink:0,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column"}}>
          <div style={{background:sc.bg,borderBottom:"1px solid "+sc.bd,padding:"8px 12px"}}>
            <div style={{color:sc.color,fontSize:10,fontWeight:800}}>{seg.label}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>{fmt(seg.start_seconds)} – {fmt(seg.end_seconds)}</div>
          </div>
          <div style={{padding:10,background:C.bg,flex:1}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:8,lineHeight:1.5}}>{seg.description}</div>
            <div style={{fontSize:10,color:C.accent,marginBottom:8,fontStyle:"italic"}}>{seg.suggested_broll}</div>
            <div style={{position:"relative",paddingTop:"177.78%",background:"#111",borderRadius:8,overflow:"hidden",marginBottom:8}}>
              {clip?.mux_playback_id?<img src={muxThumb(clip.mux_playback_id,clip.thumbnail_time||0)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}><div style={{fontSize:20}}>🎬</div><div style={{fontSize:9,color:C.muted}}>No b-roll yet</div></div>}
              {seg.autoSelected&&clip&&<div style={{position:"absolute",top:6,left:6,background:C.green,color:"#000",fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:3}}>✦ AI</div>}
            </div>
            {clip&&<div style={{fontSize:10,color:C.text,fontWeight:600,marginBottom:6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>{clip.title}</div>}
            <button onClick={()=>setPickingIdx(idx)} style={{width:"100%",background:clip?C.accentSoft:C.yellow+"22",border:"1px solid "+(clip?C.accent+"44":C.yellow+"44"),color:clip?C.accent:C.yellow,borderRadius:7,padding:"5px",cursor:"pointer",fontSize:11,fontWeight:600}}>{clip?"⇄ Swap":"+ Pick B-Roll"}</button>
          </div>
        </div>
      })}
    </div>

    {pickingIdx!==null&&<div onClick={()=>setPickingIdx(null)} style={{position:"fixed",inset:0,background:"#000000dd",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:12,padding:24,maxWidth:700,width:"100%",marginTop:40}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontWeight:700,fontSize:17}}>Pick B-Roll Clip</div><Btn onClick={()=>setPickingIdx(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px",fontSize:12}}>✕</Btn></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
          {libraryItems.filter((i:Item)=>i.mux_playback_id).map((item:Item)=><div key={item.id} onClick={()=>{setBrollSections(prev=>prev.map((s:any,i:number)=>i===pickingIdx?{...s,selectedClipId:item.id,autoSelected:false}:s));setPickingIdx(null)}}><VideoCard item={item} onClick={()=>{}} selectMode={false} isSelected={brollSections[pickingIdx!]?.selectedClipId===item.id} onToggleSelect={()=>{}}/></div>)}
        </div>
      </div>
    </div>}
  </div>

  if(step==="preview")return<div style={{maxWidth:860,margin:"0 auto",padding:28}}>
    <button onClick={()=>setStep("match")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to Segments</button>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <STitle size={20} mb={0}>Preview & Export</STitle>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={()=>saveAd("draft")} disabled={saving} style={{background:C.surface,color:C.text,border:"1px solid "+C.border}}>💾 Save Draft</Btn>
        <Btn onClick={()=>saveAd("complete")} disabled={saving} style={{background:C.green,color:"#000",fontWeight:700}}>✓ Mark Complete</Btn>
      </div>
    </div>
    <div style={{marginBottom:20}}>
      <Label>Background Music (optional)</Label>
      <MusicPicker suggestedMood="Uplifting" onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
    </div>
    <StitchedPreview sections={brollSections.map(s=>({...s,type:s.label,spokenWords:s.description,selectedClipId:s.selectedClipId}))} libraryItems={libraryItems}/>
    <ExportVideo sections={brollSections.map(s=>({...s,type:s.label,spokenWords:s.description}))} libraryItems={libraryItems} voiceoverUrl={null} musicUrl={musicUrl}/>
  </div>

  return null
}
