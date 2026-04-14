'use client'
import { useState, useRef } from 'react'
import { Film, Upload, Search, RefreshCw, ChevronRight, Save, Check, Loader2, Sparkles, X } from 'lucide-react'
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
    setUploading(true);setUploadProgress(5);setUploadMsg("Creating record...")
    try{
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:uploadFile.name,contentType:uploadFile.type,metadata:{title:uploadTitle},workspaceId})})
      const{itemId,uploadUrl,error}=await res.json()
      if(error)throw new Error(error)
      setUploadProgress(10);setUploadMsg("Uploading video...")
      await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(10+Math.round((e.loaded/e.total)*70))};xhr.onload=()=>resolve();xhr.onerror=()=>reject(new Error("Upload failed"));xhr.open("PUT",uploadUrl);xhr.setRequestHeader("Content-Type",uploadFile.type);xhr.send(uploadFile)})
      setUploadProgress(85);setUploadMsg("Processing... (1-3 mins)")
      let attempts=0
      while(attempts<60){
        await new Promise(r=>setTimeout(r,5000))
        const sr=await fetch(`/api/items/${itemId}/status`)
        const status=await sr.json()
        if(status.mux_status==="ready"){setUploadProgress(100);setUploadMsg("Done!");const{data}=await createClient().from("items").select("*").eq("id",itemId).single();setBaseItem(data);break}
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

  const originals=libraryItems.filter((i:Item)=>i.type==="original"&&i.mux_playback_id)

  if(step==="upload")return<div className="max-w-[700px] mx-auto p-7">
    <button onClick={onBack} className="bg-transparent border-none text-text-muted cursor-pointer mb-5 text-sm hover:text-text transition-colors duration-150">&larr; Back</button>
    <div className="flex items-center gap-2 font-bold text-[22px] mb-1"><Film className="w-5 h-5" /> Add B-Roll to Existing Video</div>
    <p className="text-text-muted text-sm mb-6">Upload your existing video ad or talking head -- the original audio stays intact. AI will suggest b-roll clips from your library to overlay at the right moments.</p>

    {originals.length>0&&<div className="mb-6">
      <Label>Use a video already in your library</Label>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5 mb-2">
        {originals.slice(0,8).map((item:Item)=><div key={item.id} onClick={()=>useExistingBase(item)} className="cursor-pointer group">
          <div className="relative pt-[177.78%] bg-black rounded-md overflow-hidden border-2 border-border group-hover:border-accent transition-all duration-150">
            {item.mux_playback_id&&<img src={muxThumb(item.mux_playback_id,item.thumbnail_time||0)} alt="" className="absolute inset-0 w-full h-full object-cover"/>}
          </div>
          <div className="text-[10px] text-text mt-1 leading-snug font-semibold line-clamp-2">{item.title}</div>
        </div>)}
      </div>
      {matching&&<div className="text-center py-5 text-text-muted flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> AI is analysing and matching b-roll...</div>}
    </div>}

    <div className="border-t border-border pt-5">
      <Label>Or upload a new video</Label>
      <div onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onClick={()=>{if(!uploadFile)fileRef.current?.click()}} className={`border-2 border-dashed rounded-lg px-5 py-6 text-center mb-3 transition-all duration-150 ${uploadFile?"cursor-default":"cursor-pointer"} ${dragOver?"border-accent bg-accent-soft":"border-border bg-surface hover:border-border-strong"}`}>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e=>{handleFile(e.target.files?.[0]||null);e.target.value=""}}/>
        {uploadFile?<div>
          <Film className="w-7 h-7 mx-auto mb-1.5 text-success" />
          <div className="font-semibold text-success mb-1"><Check className="w-3.5 h-3.5 inline" /> {uploadFile.name}</div>
          <div className="text-xs text-text-muted">{(uploadFile.size/1024/1024).toFixed(1)} MB</div>
        </div>:<div>
          <Upload className="w-7 h-7 mx-auto mb-1.5 text-text-muted" />
          <div className="font-semibold mb-1">Drop video or click</div>
          <div className="text-xs text-text-muted">Your existing ad or talking head</div>
        </div>}
      </div>
      {uploadFile&&<div className="mb-3"><Label>Title</Label><Input value={uploadTitle} onChange={(e:any)=>setUploadTitle(e.target.value)} placeholder="e.g. Sarah Founder Story"/></div>}
      {uploading&&<div className="mb-3">
        <div className="h-1.5 bg-border rounded-full overflow-hidden mb-1.5"><div className="h-full bg-accent rounded-full transition-all duration-300" style={{width:uploadProgress+"%"}}/></div>
        <div className="text-xs text-text-muted">{uploadMsg}</div>
      </div>}
      {uploadFile&&<Btn onClick={handleUploadBase} disabled={uploading||!uploadTitle.trim()} className={`w-full py-3 rounded-md font-bold flex items-center justify-center gap-2 transition-all duration-150 ${uploading?"bg-border text-text-muted":"bg-accent text-white hover:bg-accent-hover active:scale-[0.99]"}`}>
        {uploading?<><Loader2 className="w-4 h-4 animate-spin" /> {uploadMsg}</>:<><Upload className="w-4 h-4" /> Upload & Match B-Roll</>}
      </Btn>}
    </div>
  </div>

  if(step==="match")return<div className="p-5">
    <button onClick={()=>setStep("upload")} className="bg-transparent border-none text-text-muted cursor-pointer mb-5 text-sm hover:text-text transition-colors duration-150">&larr; Back</button>
    <div className="flex justify-between items-center mb-5 flex-wrap gap-2.5">
      <div>
        <div className="font-bold text-xl mb-1">B-Roll Segments</div>
        <div className="text-sm text-text-muted">Base video: <strong className="text-text">{baseItem?.title}</strong> · {fmt(baseItem?.duration_seconds)}</div>
      </div>
      <div className="flex gap-2.5">
        <Btn onClick={()=>generateBrollSections(baseItem!)} disabled={matching} className={`flex items-center gap-1.5 border border-accent/30 transition-all duration-150 ${matching?"bg-border text-text-muted":"bg-accent-soft text-accent hover:bg-accent hover:text-white"}`}>
          {matching?<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Matching...</>:<><RefreshCw className="w-3.5 h-3.5" /> Re-match</>}
        </Btn>
        <Btn onClick={()=>setStep("preview")} className="bg-accent text-white flex items-center gap-1 hover:bg-accent-hover transition-all duration-150">Next: Preview <ChevronRight className="w-3.5 h-3.5" /></Btn>
      </div>
    </div>

    {baseItem?.mux_playback_id&&<div className="mb-5">
      <div className="rounded-lg overflow-hidden bg-black max-w-[320px]">
        <MuxPlayer playbackId={baseItem.mux_playback_id} streamType="on-demand" accentColor={C.accent} style={{width:"100%",aspectRatio:"9/16",display:"block"}}/>
      </div>
    </div>}

    <div className="flex gap-0 overflow-x-auto pb-2">
      {brollSections.map((seg:any,idx:number)=>{
        const sc=secColor(seg.label)
        const clip=seg.selectedClipId?libraryItems.find((i:Item)=>i.id===seg.selectedClipId):null
        return<div key={seg.id} className="w-[220px] flex-shrink-0 border-r border-border flex flex-col">
          <div className="px-3 py-2 border-b" style={{background:sc.bg,borderBottomColor:sc.bd}}>
            <div className="text-[10px] font-extrabold" style={{color:sc.color}}>{seg.label}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{fmt(seg.start_seconds)} - {fmt(seg.end_seconds)}</div>
          </div>
          <div className="p-2.5 bg-bg flex-1">
            <div className="text-xs text-text-muted mb-2 leading-normal">{seg.description}</div>
            <div className="text-[10px] text-accent mb-2 italic">{seg.suggested_broll}</div>
            <div className="relative pt-[177.78%] bg-black rounded-md overflow-hidden mb-2">
              {clip?.mux_playback_id?<img src={muxThumb(clip.mux_playback_id,clip.thumbnail_time||0)} alt="" className="absolute inset-0 w-full h-full object-cover"/>:<div className="absolute inset-0 flex items-center justify-center flex-col gap-1">
                <Film className="w-5 h-5 text-text-muted" />
                <div className="text-[9px] text-text-muted">No b-roll yet</div>
              </div>}
              {seg.autoSelected&&clip&&<div className="absolute top-1.5 left-1.5 bg-success text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> AI</div>}
            </div>
            {clip&&<div className="text-[10px] text-text font-semibold mb-1.5 line-clamp-2">{clip.title}</div>}
            <button onClick={()=>setPickingIdx(idx)} className={`w-full rounded-md py-1.5 cursor-pointer text-xs font-semibold flex items-center justify-center gap-1 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${clip?"bg-accent-soft border border-accent/30 text-accent hover:bg-accent hover:text-white":"bg-warning-soft border border-warning/30 text-warning hover:bg-warning hover:text-black"}`}>
              {clip?<><RefreshCw className="w-3 h-3" /> Swap</>:<>+ Pick B-Roll</>}
            </button>
          </div>
        </div>
      })}
    </div>

    {pickingIdx!==null&&<div onClick={()=>setPickingIdx(null)} className="bg-overlay fixed inset-0 z-[300] flex items-start justify-center p-5 overflow-y-auto animate-fade-in">
      <div onClick={e=>e.stopPropagation()} className="bg-surface border border-border rounded-xl p-6 max-w-[700px] w-full mt-10 shadow-xl animate-scale-in">
        <div className="flex justify-between items-center mb-4">
          <div className="font-bold text-[17px]">Pick B-Roll Clip</div>
          <button onClick={()=>setPickingIdx(null)} className="bg-transparent border border-border text-text-muted rounded-md px-3 py-1.5 text-xs cursor-pointer hover:border-border-strong transition-all duration-150"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5">
          {libraryItems.filter((i:Item)=>i.mux_playback_id).map((item:Item)=><div key={item.id} onClick={()=>{setBrollSections(prev=>prev.map((s:any,i:number)=>i===pickingIdx?{...s,selectedClipId:item.id,autoSelected:false}:s));setPickingIdx(null)}}><VideoCard item={item} onClick={()=>{}} selectMode={false} isSelected={brollSections[pickingIdx!]?.selectedClipId===item.id} onToggleSelect={()=>{}}/></div>)}
        </div>
      </div>
    </div>}
  </div>

  if(step==="preview")return<div className="max-w-[860px] mx-auto p-7">
    <button onClick={()=>setStep("match")} className="bg-transparent border-none text-text-muted cursor-pointer mb-5 text-sm hover:text-text transition-colors duration-150">&larr; Back to Segments</button>
    <div className="flex justify-between items-center mb-5 flex-wrap gap-2.5">
      <div className="font-bold text-xl">Preview & Export</div>
      <div className="flex gap-2.5">
        <Btn onClick={()=>saveAd("draft")} disabled={saving} className="bg-surface text-text border border-border flex items-center gap-1.5 hover:border-border-strong transition-all duration-150">
          <Save className="w-3.5 h-3.5" /> Save Draft
        </Btn>
        <Btn onClick={()=>saveAd("complete")} disabled={saving} className="bg-success text-black font-bold flex items-center gap-1.5 hover:bg-success/90 transition-all duration-150">
          <Check className="w-3.5 h-3.5" /> Mark Complete
        </Btn>
      </div>
    </div>
    <div className="mb-5">
      <Label>Background Music (optional)</Label>
      <MusicPicker suggestedMood="Uplifting" onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
    </div>
    <StitchedPreview sections={brollSections.map(s=>({...s,type:s.label,spokenWords:s.description,selectedClipId:s.selectedClipId}))} libraryItems={libraryItems}/>
    <ExportVideo sections={brollSections.map(s=>({...s,type:s.label,spokenWords:s.description}))} libraryItems={libraryItems} voiceoverUrl={null} musicUrl={musicUrl}/>
  </div>

  return null
}
