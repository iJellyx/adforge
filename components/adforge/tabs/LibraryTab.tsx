'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Item, BrandProfile, Product } from '../types'
import { C, CONTENT_CATEGORIES, DURATION_RANGES, AD_POTENTIALS, SORTS, GENDERS, AGE_RANGES } from '../constants'
import { muxThumb, muxMp4, fmt, typeColor, getDurationRange, secColor } from '../utils'
import { Btn, Label, Card, STitle, Chip, Input, MultiSelect } from '../ui-primitives'
import { VideoCard } from '../VideoCard'
import { MuxClipPlayer } from '../MuxClipPlayer'
import { TagEditor } from '../TagEditor'
import { TrimSlider } from '../TrimSlider'
import { ClipsView } from '../ClipsView'
import { ClipDetailPanel } from '../ClipDetailPanel'
import { UploadPipeline } from '../UploadPipeline'
import { ArrowLeft, Film, Scissors as ScissorsIcon, Upload, FolderOpen, Link2, RefreshCw, X, AlertTriangle, CheckCircle2, Search, SlidersHorizontal } from 'lucide-react'

export function LibraryTab({items,onRefresh,view,setView,brand,products,onGoToBrand,workspaceId}:{items:Item[],onRefresh:()=>void,view:string,setView:(v:string)=>void,brand:BrandProfile,products:Product[],onGoToBrand:()=>void,workspaceId:string}){
  const supabase=createClient()
  const [selected,setSelected]=useState<Item|null>(null)
  const [search,setSearch]=useState("")
  const [filter,setFilter]=useState("All")
  const [sortIdx,setSortIdx]=useState(0)
  const [selectMode,setSelectMode]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [deleting,setDeleting]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  const [categoryOpen,setCategoryOpen]=useState<Record<string,boolean>>({})
  const [filterCtypes,setFilterCtypes]=useState<string[]>([])
  const [filterCreators,setFilterCreators]=useState<string[]>([])
  const [filterAges,setFilterAges]=useState<string[]>([])
  const [filterGenders,setFilterGenders]=useState<string[]>([])
  const [filterAdPotential,setFilterAdPotential]=useState<string[]>([])
  const [filterDuration,setFilterDuration]=useState<string[]>([])
  const [dragOver,setDragOver]=useState(false)
  const [uploadQueue,setUploadQueue]=useState<any[]>([])
  const [autoClipEnabled,setAutoClipEnabled]=useState(true)
  const [subView,setSubView]=useState<"clips"|"originals"|"upload">("clips")
  const [clipDetailItem,setClipDetailItem]=useState<Item|null>(null)

  // ── Google Drive integration state ──────────────────────────────────────
  const [gdriveStatus,setGdriveStatus]=useState<any>(null)
  const [gdriveSyncing,setGdriveSyncing]=useState(false)
  const [gdriveSyncMsg,setGdriveSyncMsg]=useState("")
  const [showFolderPicker,setShowFolderPicker]=useState(false)
  const [folderPickerItems,setFolderPickerItems]=useState<any[]>([])
  const [folderPickerLoading,setFolderPickerLoading]=useState(false)
  const [folderPickerPath,setFolderPickerPath]=useState<{id:string,name:string}[]>([])

  useEffect(()=>{
    loadGdriveStatus()
    const params=new URLSearchParams(window.location.search)
    const gdrive=params.get("gdrive")
    if(gdrive==="connected"){setShowFolderPicker(true);window.history.replaceState({},"",window.location.pathname)}
    if(gdrive==="error"){setGdriveSyncMsg("Connection failed — please try again");window.history.replaceState({},"",window.location.pathname)}
  },[])

  async function loadGdriveStatus(){
    try{const res=await fetch("/api/integrations/gdrive/sync");if(res.ok){const d=await res.json();setGdriveStatus(d)}}catch(e){}
  }

  async function syncNow(){
    setGdriveSyncing(true);setGdriveSyncMsg("Scanning folder...")
    try{
      const res=await fetch("/api/integrations/gdrive/sync",{method:"POST"})
      const d=await res.json()
      if(d.error){setGdriveSyncMsg("Sync failed: "+d.error)}
      else if(d.imported===0){setGdriveSyncMsg("Up to date — no new videos found")}
      else{setGdriveSyncMsg(`Imported ${d.imported} new video${d.imported!==1?"s":""}`);onRefresh()}
      loadGdriveStatus()
    }catch(e:any){setGdriveSyncMsg("Sync failed: "+e.message)}
    setGdriveSyncing(false)
  }

  async function disconnectDrive(){
    await fetch("/api/integrations/gdrive/manage",{method:"DELETE"})
    setGdriveStatus(null);setGdriveSyncMsg("")
  }

  async function openFolderPicker(parentId="root"){
    setFolderPickerLoading(true)
    try{
      const res=await fetch(`/api/integrations/gdrive/folders?parent=${parentId}`)
      const d=await res.json()
      setFolderPickerItems(d.folders||[])
    }catch(e){setFolderPickerItems([])}
    setFolderPickerLoading(false)
  }

  async function selectFolder(folder:{id:string,name:string}){
    await fetch("/api/integrations/gdrive/manage",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder_id:folder.id,folder_name:folder.name})})
    setShowFolderPicker(false);setFolderPickerPath([]);loadGdriveStatus()
    setTimeout(()=>syncNow(),500)
  }

  function addFiles(files:File[]){
    const newEntries=files.map(file=>({
      id:Date.now()+Math.random(),
      file,
      title:file.name.replace(/\.[^/.]+$/,"").replace(/[_-]+/g," "),
      creator:"",
      creatorAge:"",
      creatorGender:"",
      autoClip:true,
      status:"pending",
      progress:0,
      msg:"",
      previewUrl:null,
    }))
    setUploadQueue(prev=>[...prev,...newEntries])
  }

  function updateQueue(idx:number,update:any){setUploadQueue(prev=>prev.map((e,i)=>i===idx?{...e,...update}:e))}
  function removeFromQueue(idx:number){setUploadQueue(prev=>prev.filter((_,i)=>i!==idx))}

  async function uploadSingle(idx:number){
    const entry=uploadQueue[idx]
    if(!entry||!entry.title?.trim())return
    updateQueue(idx,{status:"uploading",progress:2,msg:"Checking for duplicates..."})

    try{
      const fileSizeMB=entry.file.size/1024/1024
      const videoDuration=await new Promise<number>((resolve)=>{
        const vid=document.createElement("video")
        vid.preload="metadata"
        vid.onloadedmetadata=()=>{URL.revokeObjectURL(vid.src);resolve(vid.duration)}
        vid.onerror=()=>resolve(0)
        vid.src=URL.createObjectURL(entry.file)
      })
      if(videoDuration>0){
        const possibleDupes=items.filter((item:Item)=>{
          if(!item.duration_seconds)return false
          const durDiff=Math.abs(item.duration_seconds-videoDuration)
          return durDiff<1.5
        })
        if(possibleDupes.length>0){
          const dupeTitle=possibleDupes[0].title
          updateQueue(idx,{status:"duplicate_warning",progress:0,msg:`Possible duplicate of "${dupeTitle}" (${videoDuration.toFixed(1)}s). Upload anyway?`})
          return
        }
      }
    }catch(e){}

    updateQueue(idx,{status:"uploading",progress:5,msg:"Creating record..."})

    try{
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:entry.file.name,contentType:entry.file.type,metadata:{title:entry.title,creator:entry.creator,creatorAge:entry.creatorAge,creatorGender:entry.creatorGender,autoClip:entry.autoClip!==false},workspaceId})})
      const{itemId,uploadUrl,error}=await res.json()
      if(error)throw new Error(error)
      updateQueue(idx,{progress:10,msg:"Uploading video..."})
      await new Promise<void>((resolve,reject)=>{
        const xhr=new XMLHttpRequest()
        xhr.upload.onprogress=e=>{if(e.lengthComputable)updateQueue(idx,{progress:10+Math.round((e.loaded/e.total)*75),msg:"Uploading..."})}
        xhr.onload=()=>resolve()
        xhr.onerror=()=>reject(new Error("Upload failed"))
        xhr.open("PUT",uploadUrl)
        xhr.setRequestHeader("Content-Type",entry.file.type)
        xhr.send(entry.file)
      })
      let pollAttempts = 0
      let finalStatus = 'done'
      while (pollAttempts < 10) {
        await new Promise(r => setTimeout(r, 3000))
        const supabase = createClient()
        const { data: statusCheck } = await supabase.from('items').select('mux_status').eq('id', itemId).single()
        if (statusCheck?.mux_status === 'duplicate') { finalStatus = 'duplicate'; break }
        if (statusCheck?.mux_status === 'analysing' || statusCheck?.mux_status === 'ready') break
        pollAttempts++
      }
      updateQueue(idx, {status: finalStatus, progress: 100, msg: finalStatus === 'duplicate' ? 'Duplicate blocked' : 'Done!'})
      if (finalStatus !== 'duplicate') onRefresh()
    }catch(e:any){
      updateQueue(idx,{status:"error",msg:"Failed: "+e.message})
    }
  }

  async function uploadAll(){
    const pending=uploadQueue.map((_,i)=>i).filter(i=>uploadQueue[i].status==="pending"&&uploadQueue[i].title?.trim())
    for(const idx of pending){await uploadSingle(idx)}
  }

  const allCreators=[...new Set(items.map(i=>i.creator).filter(Boolean))] as string[]
  const activeFilterCount=filterCtypes.length+filterCreators.length+filterAges.length+filterGenders.length+filterAdPotential.length+filterDuration.length
  function clearFilters(){setFilterCtypes([]);setFilterCreators([]);setFilterAges([]);setFilterGenders([]);setFilterAdPotential([]);setFilterDuration([])}
  async function handleDelete(id:string){const item=items.find(i=>i.id===id);await supabase.from("items").delete().in("id",[id,...(item?.clip_ids||[])]);onRefresh();setSelected(null);setView("grid")}
  async function bulkDelete(){setDeleting(true);const gone=new Set(selectedIds);selectedIds.forEach(id=>{const item=items.find(i=>i.id===id);(item?.clip_ids||[]).forEach((cid:string)=>gone.add(cid))});await supabase.from("items").delete().in("id",Array.from(gone));onRefresh();setSelectMode(false);setSelectedIds([]);setDeleting(false)}
  async function updateTags(id:string,tags:string[]){const item=items.find(i=>i.id===id);const newAnalysis={...(item?.analysis||{}),scene_tags:tags};await supabase.from("items").update({analysis:newAnalysis}).eq("id",id);onRefresh();if(selected?.id===id)setSelected({...selected,analysis:newAnalysis})}

  function sortItems(arr:Item[]){const c=[...arr];if(sortIdx===0)return c.sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime());if(sortIdx===1)return c.sort((a,b)=>new Date(a.created_at||0).getTime()-new Date(b.created_at||0).getTime());if(sortIdx===2)return c.sort((a,b)=>a.title.localeCompare(b.title));return c.sort((a,b)=>b.title.localeCompare(a.title))}

  const filtered=sortItems(items.filter(item=>{
    if(filter==="Originals"&&item.type!=="original")return false
    if(filter==="Clips"&&item.type!=="clip")return false
    if(filterCtypes.length>0){const ct=item.analysis?.content_type;if(!filterCtypes.some(f=>f===ct||(f==="Clip"&&item.type==="clip")))return false}
    if(filterCreators.length>0&&!filterCreators.includes(item.creator||""))return false
    if(filterAges.length>0&&!filterAges.includes(item.creator_age||""))return false
    if(filterGenders.length>0&&!filterGenders.includes(item.creator_gender||""))return false
    if(filterAdPotential.length>0&&!filterAdPotential.includes(item.analysis?.ad_potential||""))return false
    if(filterDuration.length>0&&!filterDuration.includes(getDurationRange(item.duration_seconds)))return false
    if(!search.trim())return true
    const q=search.toLowerCase(),a=item.analysis||{}
    return[item.title,item.creator,a.summary,a.tone,...(a.scene_tags||[]),...(a.topics||[])].some(f=>f&&String(f).toLowerCase().includes(q))
  }))

  // ── Sub-view toggle: Clips (default) | Originals | Upload ──
  if(view==="add"||subView==="upload")return(
    <div className="max-w-3xl mx-auto p-7">
      <button onClick={()=>{setView("grid");setSubView("clips")}} className="flex items-center gap-1 text-text-muted hover:text-text text-sm cursor-pointer transition-colors bg-transparent border-none mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Library
      </button>
      <STitle size={22}>Add Content</STitle>
      <div className="text-text-muted text-sm mb-6">Upload videos manually or connect a Google Drive folder for automatic syncing.</div>

      {/* ── Google Drive Folder Picker Modal ── */}
      {showFolderPicker&&<div onClick={()=>setShowFolderPicker(false)} className="fixed inset-0 bg-overlay z-[200] flex items-center justify-center p-5">
        <div onClick={e=>e.stopPropagation()} className="bg-surface border border-border rounded-xl p-6 max-w-[560px] w-full animate-scale-in">
          <div className="font-bold text-base mb-1 flex items-center gap-2"><FolderOpen className="w-5 h-5 text-accent" /> Select a Google Drive folder</div>
          <div className="text-sm text-text-muted mb-4">All videos in this folder (and subfolders) will be imported automatically.</div>
          {folderPickerPath.length>0&&<div className="flex gap-1 items-center mb-3 flex-wrap">
            <button onClick={()=>{setFolderPickerPath([]);openFolderPicker("root")}} className="bg-transparent border-none text-accent cursor-pointer text-xs p-0">My Drive</button>
            {folderPickerPath.map((p,i)=><span key={p.id} className="flex items-center gap-1"><span className="text-text-muted text-xs">/</span><button onClick={()=>{const newPath=folderPickerPath.slice(0,i+1);setFolderPickerPath(newPath);openFolderPicker(p.id)}} className={`bg-transparent border-none cursor-pointer text-xs p-0 ${i===folderPickerPath.length-1?"text-text":"text-accent"}`}>{p.name}</button></span>)}
          </div>}
          <div className="max-h-80 overflow-y-auto border border-border rounded-lg mb-4">
            {folderPickerLoading?<div className="p-6 text-center text-text-muted text-sm">Loading folders...</div>
            :folderPickerItems.length===0?<div className="p-6 text-center text-text-muted text-sm">No subfolders found</div>
            :folderPickerItems.map((folder:any)=><div key={folder.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border cursor-pointer hover:bg-accent-soft transition-colors">
              <FolderOpen className="w-4 h-4 text-text-muted" />
              <span className="flex-1 text-sm font-medium">{folder.name}</span>
              <button onClick={()=>{const newPath=[...folderPickerPath,{id:folder.id,name:folder.name}];setFolderPickerPath(newPath);openFolderPicker(folder.id)}} className="bg-transparent border-none text-text-muted cursor-pointer text-[11px] px-1.5 py-0.5 hover:text-text transition-colors">Open</button>
              <button onClick={()=>selectFolder(folder)} className="bg-accent text-white border-none rounded-md px-2.5 py-1 cursor-pointer text-[11px] font-bold hover:bg-accent-hover transition-colors">Select</button>
            </div>)}
          </div>
          {folderPickerPath.length>0&&<Btn onClick={()=>selectFolder(folderPickerPath[folderPickerPath.length-1])} style={{background:"var(--color-success)",color:"#000",fontWeight:700,width:"100%",marginBottom:8}}>Use "{folderPickerPath[folderPickerPath.length-1]?.name}"</Btn>}
          <Btn onClick={()=>setShowFolderPicker(false)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",width:"100%"}}>Cancel</Btn>
        </div>
      </div>}

      <Card style={{marginBottom:24}}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-info-soft flex items-center justify-center shrink-0"><Link2 className="w-4 h-4 text-info" /></div>
          <div className="flex-1">
            <div className="font-bold text-sm mb-0.5">Google Drive Sync</div>
            <div className="text-xs text-text-muted">
              {gdriveStatus?.folder_id?`Connected: ${gdriveStatus.folder_name||gdriveStatus.folder_id}`:"Connect a folder — new videos sync automatically"}
            </div>
          </div>
          {!gdriveStatus?.folder_id
            ?<a href="/api/integrations/gdrive/connect" className="no-underline"><Btn style={{background:"#4285F4",color:"#fff",fontWeight:700,fontSize:12,padding:"7px 14px",whiteSpace:"nowrap"}}>Connect Drive</Btn></a>
            :<div className="flex gap-2">
              <Btn onClick={()=>{openFolderPicker("root");setShowFolderPicker(true)}} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)",fontSize:12,padding:"6px 12px"}}>Change folder</Btn>
              <Btn onClick={syncNow} disabled={gdriveSyncing} style={{background:gdriveSyncing?"var(--color-border)":"var(--color-success)",color:gdriveSyncing?"var(--color-text-muted)":"#000",fontWeight:700,fontSize:12,padding:"6px 12px"}}>{gdriveSyncing?"Syncing...":"Sync now"}</Btn>
              <Btn onClick={disconnectDrive} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:12,padding:"6px 10px"}}>Disconnect</Btn>
            </div>}
        </div>
        {gdriveStatus?.folder_id&&<div className="flex gap-4 text-xs text-text-muted pt-2 border-t border-border flex-wrap">
          {gdriveStatus.last_synced&&<span>Last synced: {new Date(gdriveStatus.last_synced).toLocaleString()}</span>}
          {gdriveStatus.imported_ids?.length>0&&<span>{gdriveStatus.imported_ids.length} videos imported</span>}
          {gdriveStatus.sync_status==="error"&&<span className="text-danger"><AlertTriangle className="w-3 h-3 inline" /> {gdriveStatus.sync_error}</span>}
        </div>}
        {gdriveSyncMsg&&<div className={`mt-2 text-xs font-semibold ${gdriveSyncMsg.startsWith("Up to date")||gdriveSyncMsg.startsWith("Imported")?"text-success":"text-danger"}`}>{gdriveSyncMsg}</div>}
      </Card>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-text-muted font-semibold uppercase tracking-wider">or upload manually</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Drop zone */}
      <div
        onDrop={e=>{e.preventDefault();setDragOver(false);const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("video/"));if(files.length>0)addFiles(files)}}
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onClick={()=>fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer mb-5 transition-all duration-150 ${
          dragOver ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-accent"
        }`}
      >
        <input ref={fileRef} type="file" accept="video/*" multiple className="hidden" onChange={e=>{const files=Array.from(e.target.files||[]).filter(f=>f.type.startsWith("video/"));if(files.length>0)addFiles(files);e.target.value=""}}/>
        <Film className="w-9 h-9 mx-auto mb-2.5 text-text-muted" />
        <div className="font-bold text-base mb-1.5">Drop videos here or click to select</div>
        <div className="text-sm text-text-muted mb-1">MP4, MOV, WebM — select multiple files at once</div>
        <div className="text-xs text-accent">AI will auto-transcribe and analyse each video</div>
      </div>

      <div className="flex items-center gap-2.5 mt-3 px-3.5 py-2.5 bg-surface rounded-lg border border-border">
        <div onClick={()=>setAutoClipEnabled((v:boolean)=>!v)} className={`w-9 h-5 rounded-full cursor-pointer relative transition-colors shrink-0 ${autoClipEnabled?"bg-accent":"bg-border"}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left] ${autoClipEnabled?"left-[18px]":"left-0.5"}`}/>
        </div>
        <div>
          <div className="text-xs font-bold text-text">Auto-clip with AI</div>
          <div className="text-[11px] text-text-muted">{autoClipEnabled?"AI will create clips from each video":"Analysis only — no clips will be created"}</div>
        </div>
      </div>

      {/* Upload queue — aggregate view */}
      {uploadQueue.length>0&&<div className="mb-5 mt-4">
        {(()=>{
          const total=uploadQueue.length
          const done=uploadQueue.filter((e:any)=>e.status==="done"||e.status==="duplicate").length
          const errored=uploadQueue.filter((e:any)=>e.status==="error").length
          const uploading=uploadQueue.filter((e:any)=>e.status==="uploading"||e.status==="processing").length
          const pending=uploadQueue.filter((e:any)=>e.status==="pending").length
          const pct=Math.round((done/total)*100)
          const remaining=pending+uploading
          const minsLeft=Math.ceil(remaining*90/60)
          const allDone=done+errored===total
          return<>
            <div className="bg-card border border-border rounded-lg p-5 mb-3">
              <div className="flex justify-between items-center mb-2.5">
                <div className="font-bold text-[15px] text-text">{allDone?"Upload complete":"Uploading & analysing..."}</div>
                <div className="text-sm text-text-muted font-semibold">{done}/{total} videos</div>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-[width] duration-500 ${allDone?"bg-success":"bg-accent"}`} style={{width:pct+"%"}}/>
              </div>
              <div className="flex justify-between text-xs text-text-muted">
                <span>{allDone?"All videos processed — AI analysis running in background":"AI is transcribing and analysing each video"}</span>
                {!allDone&&remaining>0&&<span className="font-semibold text-accent">~{minsLeft} min{minsLeft!==1?"s":""} left</span>}
              </div>
              {errored>0&&<div className="mt-2 text-xs text-danger"><AlertTriangle className="w-3 h-3 inline" /> {errored} video{errored!==1?"s":""} failed</div>}
              {uploadQueue.filter((e:any)=>e.status==="duplicate").length>0&&<div className="mt-1.5 text-xs text-warning"><AlertTriangle className="w-3 h-3 inline" /> {uploadQueue.filter((e:any)=>e.status==="duplicate").length} duplicate{uploadQueue.filter((e:any)=>e.status==="duplicate").length!==1?"s":""} blocked</div>}
            </div>
            {uploadQueue.filter((e:any)=>e.status==="error").map((entry:any)=><div key={entry.id} className="bg-danger-soft border border-danger/30 rounded-lg px-3.5 py-2.5 mb-2 text-xs text-danger">{entry.title} — {entry.msg}</div>)}
            {items.filter(it=>it.mux_status&&it.mux_status!=="ready"&&it.mux_status!=="errored"&&it.mux_status!=="duplicate").slice(0,5).map(it=><div key={it.id} className="bg-card border border-border rounded-lg px-3.5 py-1.5 mb-1.5 flex items-center gap-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold overflow-hidden whitespace-nowrap text-ellipsis">{it.title}</div>
                <UploadPipeline item={it} compact/>
              </div>
            </div>)}
            {uploadQueue.filter((e:any)=>e.status==="duplicate_warning").map((entry:any)=>{
              const realIdx=uploadQueue.indexOf(entry)
              return<div key={entry.id} className="bg-warning-soft border border-warning/40 rounded-lg px-3.5 py-2.5 mb-2 flex gap-2.5 items-center flex-wrap">
                <div className="flex-1 min-w-[200px]"><div className="text-xs font-bold text-warning mb-0.5"><AlertTriangle className="w-3 h-3 inline" /> Possible duplicate</div><div className="text-[11px] text-warning">{entry.msg}</div></div>
                <div className="flex gap-2">
                  <Btn onClick={()=>updateQueue(realIdx,{status:"pending",progress:0,msg:""})} style={{background:"var(--color-accent)",color:"#fff",fontSize:11,padding:"5px 12px"}}>Upload anyway</Btn>
                  <Btn onClick={()=>updateQueue(realIdx,{status:"duplicate",progress:0,msg:"Skipped"})} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:11,padding:"5px 12px"}}>Skip</Btn>
                </div>
              </div>
            })}
            {uploadQueue.filter((e:any)=>e.status==="pending").map((entry:any)=>{
              const realIdx=uploadQueue.indexOf(entry)
              return<div key={entry.id} className="bg-card border border-border rounded-lg px-3.5 py-2.5 mb-2 flex gap-2.5 items-center">
                <div className="flex-1 min-w-0">
                  <input value={entry.title} onChange={e=>updateQueue(realIdx,{title:e.target.value})} placeholder="Video title *" className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-text text-xs outline-none"/>
                </div>
                <Btn onClick={()=>uploadSingle(realIdx)} disabled={!entry.title?.trim()} style={{background:"var(--color-accent)",color:"#fff",fontSize:11,padding:"5px 12px"}}>Upload</Btn>
                <Btn onClick={()=>removeFromQueue(realIdx)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:11,padding:"5px 10px"}}><X className="w-3 h-3"/></Btn>
              </div>
            })}
          </>
        })()}
      </div>}

      {uploadQueue.filter((e:any)=>e.status==="pending").length>1&&<Btn onClick={uploadAll} disabled={uploadQueue.some((e:any)=>e.status==="uploading")} style={{background:"var(--color-accent)",color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12,marginBottom:12}}>
        Upload All {uploadQueue.filter((e:any)=>e.status==="pending").length} Videos
      </Btn>}

      {uploadQueue.some((e:any)=>e.status==="uploading"||e.status==="processing"||e.status==="done")&&<div className="mb-3">
        {(!brand?.name||!brand?.description)&&<div className="bg-warning-soft border border-warning/40 rounded-xl px-4 py-3.5 mb-2.5">
          <div className="font-bold text-sm text-warning mb-1">While you wait — set up your Brand Profile</div>
          <div className="text-xs text-text-muted mb-2.5">Your brand name, voice, and description help AI write better scripts and match clips more accurately.</div>
          <button onClick={onGoToBrand} className="bg-warning text-white border-none rounded-lg px-4 py-[7px] cursor-pointer text-xs font-bold hover:opacity-90 transition-opacity">Set up Brand</button>
        </div>}
        {brand?.name&&(!products||products.length===0)&&<div className="bg-info-soft border border-info/40 rounded-xl px-4 py-3.5 mb-2.5">
          <div className="font-bold text-sm text-info mb-1">Add your products while you wait</div>
          <div className="text-xs text-text-muted mb-2.5">Products let AI create targeted scripts with specific benefits, claims, and pricing.</div>
          <button onClick={()=>{onRefresh();setView("grid")}} className="bg-info text-white border-none rounded-lg px-4 py-[7px] cursor-pointer text-xs font-bold hover:opacity-90 transition-opacity">Add Products</button>
        </div>}
      </div>}
    </div>
  )

  if(view==="detail"&&selected){
    const a=selected.analysis||{}
    const clips=selected.type==="original"&&selected.clip_ids?items.filter(i=>selected.clip_ids!.includes(i.id)):[]
    const adPotColor=a.ad_potential==="High"?"text-success":a.ad_potential==="Medium"?"text-warning":"text-danger"
    return(
      <div className="max-w-3xl mx-auto p-7">
        <button onClick={()=>{setSelected(null);setView("grid")}} className="flex items-center gap-1 text-text-muted hover:text-text text-sm cursor-pointer transition-colors bg-transparent border-none mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </button>
        <div className="flex justify-between items-start mb-4 gap-4">
          <div>
            <Chip label={selected.type==="clip"?"CLIP":(a.content_type||"Untagged")} color={selected.type==="clip"?typeColor("Clip"):undefined}/>
            <div className="font-extrabold text-[22px] mt-2 mb-1">{selected.title}</div>
            <div className="text-text-muted text-sm flex gap-3 flex-wrap">
              {selected.duration_seconds&&<span>{fmt(selected.duration_seconds)}</span>}
              {selected.creator&&<span>{selected.creator}{selected.creator_age?` · ${selected.creator_age}`:""}</span>}
              {selected.created_at&&<span>Added {new Date(selected.created_at).toLocaleDateString()}</span>}
            </div>
          </div>
          <Btn onClick={async()=>{
            if(selected.type==="clip"&&selected.parent_id){
              const parent=items.find(i=>i.id===selected.parent_id)
              if(parent?.clip_ids){
                await supabase.from("items").update({clip_ids:parent.clip_ids.filter((id:string)=>id!==selected.id)}).eq("id",selected.parent_id)
              }
              await supabase.from("items").delete().eq("id",selected.id)
            } else {
              await handleDelete(selected.id)
            }
            onRefresh();setSelected(null);setView("grid")
          }} style={{background:"var(--color-danger-soft)",color:"var(--color-danger)",border:"1px solid rgba(239,68,68,0.2)",flexShrink:0}}>Delete</Btn>
        </div>
        <MuxClipPlayer item={selected}/>
        {a.summary&&<Card style={{marginBottom:12}}><Label>Summary</Label><p className="m-0 leading-relaxed text-sm">{a.summary}</p></Card>}
        {(a.creative_tags?.length>0||a.is_talking_head!=null||a.is_broll!=null||a.visual_style)&&<Card style={{marginBottom:12}}>
          <div className="font-bold text-[11px] text-text-muted uppercase tracking-wider mb-2.5">Creative Tags</div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {a.is_talking_head&&<span className="bg-[#7C3AED22] text-[#7C3AED] px-2 py-0.5 rounded-full text-[10px] font-bold border border-[#7C3AED33]">Talking Head</span>}
            {a.is_broll&&<span className="bg-info-soft text-info px-2 py-0.5 rounded-full text-[10px] font-bold border border-info/20">B-Roll</span>}
            {a.visual_style&&<span className="bg-accent-soft text-accent px-2 py-0.5 rounded-full text-[10px] font-bold border border-accent/20">{a.visual_style.replace(/_/g," ")}</span>}
            {a.has_face&&<span className="bg-warning-soft text-warning px-2 py-0.5 rounded-full text-[10px] font-bold border border-warning/20">Has Face</span>}
            {a.product_visible&&<span className="bg-success-soft text-success px-2 py-0.5 rounded-full text-[10px] font-bold border border-success/20">Product Visible</span>}
          </div>
          {a.creative_tags?.length>0&&<div className="flex gap-1.5 flex-wrap">{a.creative_tags.map((t:string,i:number)=><span key={i} className="bg-surface text-text-muted px-2 py-0.5 rounded-full text-[9px] font-semibold border border-border">{t.replace(/_/g," ")}</span>)}</div>}
        </Card>}
        {selected.type==="clip"&&<Card style={{marginBottom:12}}>
          <div className="font-bold text-[11px] text-text-muted uppercase tracking-wider mb-2.5">Clip Role</div>
          <div className="flex gap-1.5 flex-wrap">
            {["hook","problem","solution","social_proof","cta","b_roll","product_demo","reaction","before_after","testimonial"].map(role=>{
              const active=(selected.clip_role||a.clip_role)===role
              return<button key={role} onClick={async()=>{
                const supabase=createClient()
                await supabase.from("items").update({clip_role:role,analysis:{...a,clip_role:role}}).eq("id",selected.id)
                setSelected({...selected,clip_role:role,analysis:{...a,clip_role:role}})
              }} className={`rounded-full px-2.5 py-1 text-[11px] cursor-pointer border transition-all duration-150 ${
                active?"bg-accent text-white border-accent font-bold":"bg-surface text-text-muted border-border hover:border-border-strong"
              }`}>
                {role.replace(/_/g," ")}
              </button>
            })}
          </div>
          {(selected.clip_role||a.clip_role)&&<div className="text-[11px] text-success mt-2"><CheckCircle2 className="w-3 h-3 inline" /> Role set — this clip will be prioritised for {(selected.clip_role||a.clip_role)?.replace(/_/g," ")} sections</div>}
          {a.quality_score&&<div className={`text-[11px] mt-1.5 ${a.quality_score==="High"?"text-success":a.quality_score==="Low"?"text-danger":"text-warning"}`}>AI Quality: {a.quality_score}</div>}
        </Card>}
        {selected.type!=="clip"&&<div className="grid grid-cols-3 gap-2.5 mb-3">{[{l:"Tone",v:a.tone},{l:"Ad Potential",v:a.ad_potential,c:adPotColor},{l:"Confidence",v:a.confidence}].map(s=><Card key={s.l} style={{textAlign:"center",padding:14}}><div className="text-[10px] text-text-muted font-semibold uppercase tracking-wider mb-1">{s.l}</div><div className={`font-bold text-sm ${(s as any).c||"text-text"}`}>{s.v||"--"}</div></Card>)}</div>}
        <Card style={{marginBottom:12}}>
          <div className="font-bold text-[11px] text-text-muted uppercase tracking-wider mb-2.5">Clip Role</div>
          <div className="flex gap-1.5 flex-wrap">
            {["hook","problem","solution","social_proof","cta","b_roll","product_demo","testimonial"].map(role=>{
              const isActive=(selected.clip_role||selected.analysis?.clip_role)===role
              return<button key={role} onClick={async()=>{
                await supabase.from("items").update({clip_role:isActive?null:role}).eq("id",selected.id)
                onRefresh()
                setSelected({...selected,clip_role:isActive?undefined:role})
              }} className={`rounded-full px-2.5 py-1 cursor-pointer text-[11px] border transition-all duration-150 ${
                isActive?"bg-accent text-white border-accent font-bold":"bg-surface text-text-muted border-border hover:border-border-strong"
              }`}>{role.replace("_"," ")}</button>
            })}
          </div>
          <div className="text-[10px] text-text-muted mt-1.5">Assigning a role helps AI match this clip to the right script sections</div>
        </Card>
        {selected.transcript&&<Card style={{marginBottom:12}}><div className="font-bold text-[11px] text-text-muted uppercase tracking-wider mb-2">Auto-Transcript</div><div className="text-sm leading-relaxed text-text-muted max-h-[120px] overflow-y-auto">{selected.transcript}</div></Card>}
        {a.key_quotes?.length>0&&<Card style={{marginBottom:12}}><Label>Key Quotes</Label>{a.key_quotes.map((q:string,i:number)=><div key={i} className="border-l-[3px] border-accent pl-3 mb-2 text-sm italic">"{q}"</div>)}</Card>}
        {a.ad_notes&&<Card style={{marginBottom:12}}><div className="font-bold text-[11px] mb-1.5" style={{color:a.ad_potential==="High"?"var(--color-success)":a.ad_potential==="Medium"?"var(--color-warning)":"var(--color-danger)"}}>AD USAGE</div><div className="text-sm leading-relaxed">{a.ad_notes}</div></Card>}
        {selected.type==="original"&&selected.mux_status==="ready"&&<Card style={{marginBottom:12,background:clips.length===0?"var(--color-warning-soft)":"var(--color-info-soft)",border:clips.length===0?"1.5px solid var(--color-warning)":"1.5px solid var(--color-accent-muted)"}}>
          <div className="flex justify-between items-center">
            <div>
              {clips.length===0?<>
                <div className="font-bold text-sm text-warning mb-0.5"><AlertTriangle className="w-3.5 h-3.5 inline" /> No clips generated</div>
                <div className="text-[11px] text-text-muted">This may have happened due to low AI credits. Re-analyse to generate clips.</div>
              </>:<>
                <div className="font-bold text-sm text-accent mb-0.5"><RefreshCw className="w-3.5 h-3.5 inline" /> Re-analyse Video</div>
                <div className="text-[11px] text-text-muted">Re-run AI analysis to benefit from improved tagging & clip detection. Existing clips will be replaced.</div>
              </>}
            </div>
            <Btn onClick={async()=>{
              await supabase.from("items").update({mux_status:"analysing"}).eq("id",selected.id)
              setSelected({...selected,mux_status:"analysing"})
              fetch("/api/items/reanalyse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:selected.id})}).then(()=>onRefresh())
            }} style={{background:clips.length===0?"var(--color-warning)":"var(--color-accent)",color:"#fff",fontSize:12,padding:"7px 16px",whiteSpace:"nowrap"}}>Re-analyse</Btn>
          </div>
        </Card>}
        {selected.type==="original"&&selected.mux_status==="analysing"&&<Card style={{marginBottom:12,background:"var(--color-info-soft)",border:"1.5px solid var(--color-accent-muted)"}}>
          <div className="flex items-center gap-2.5">
            <div className="w-[18px] h-[18px] border-2 border-accent border-t-transparent rounded-full animate-spin"/>
            <div className="text-sm text-accent font-semibold">Re-analysing... This may take a minute.</div>
          </div>
        </Card>}
        {clips.length>0&&<div className="mt-6"><STitle><ScissorsIcon className="w-4 h-4 inline" /> Auto-Generated Clips ({clips.length})</STitle><div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">{clips.map(c=><VideoCard key={c.id} item={c} onClick={()=>setSelected(c)} selectMode={false} isSelected={false} onToggleSelect={()=>{}}/>)}</div></div>}
      </div>
    )
  }

  // ── Sub-view: Clips (default) ──
  if(subView==="clips"&&view==="grid"){
    return(
      <div className="relative">
        {/* Sub-view toggle bar */}
        <div className="px-6 pt-4 flex items-center gap-4 border-b border-border bg-card">
          <div className="flex gap-1">
            {(["clips","originals","upload"] as const).map(sv=>{
              const labels={clips:"Clips",originals:"Originals",upload:"Upload"}
              const icons={clips:<ScissorsIcon className="w-3.5 h-3.5"/>,originals:<Film className="w-3.5 h-3.5"/>,upload:<Upload className="w-3.5 h-3.5"/>}
              const active=subView===sv
              return<button key={sv} onClick={()=>{if(sv==="upload"){setView("add");setSubView("upload")}else setSubView(sv)}} className={`flex items-center gap-1.5 px-4 py-2.5 bg-transparent border-none border-b-2 text-sm cursor-pointer transition-all duration-150 whitespace-nowrap ${
                active?"border-accent text-text font-bold":"border-transparent text-text-muted font-medium hover:text-text"
              }`}>{icons[sv]} {labels[sv]}</button>
            })}
          </div>
          <div className="ml-auto text-xs text-text-muted">
            {items.filter(i=>i.type==="clip").length} clips from {items.filter(i=>i.type==="original").length} videos
          </div>
        </div>
        {/* Recent clips */}
        {(()=>{
          const recentClips=items.filter(i=>i.type==="clip"&&i.mux_status==="ready").slice(0,6)
          if(recentClips.length===0)return null
          return<div className="px-6 py-4 border-b border-border">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2.5">Recent Clips</div>
            <div className="flex gap-2.5 overflow-x-auto pb-2">
              {recentClips.map(clip=><div key={clip.id} className="shrink-0 w-[100px]"><VideoCard item={clip} compact onClick={()=>setClipDetailItem(clip)} selectMode={false} isSelected={false} onToggleSelect={()=>{}}/></div>)}
            </div>
          </div>
        })()}
        {/* Clips view */}
        <div className="flex">
          <div className="flex-1"><ClipsView items={items} onRefresh={onRefresh} workspaceId={workspaceId} onSelectClip={(item:Item)=>setClipDetailItem(item)}/></div>
          {clipDetailItem&&<ClipDetailPanel item={clipDetailItem} items={items} onClose={()=>setClipDetailItem(null)} onUpdate={()=>{onRefresh();const updated=items.find(i=>i.id===clipDetailItem.id);if(updated)setClipDetailItem(updated)}} workspaceId={workspaceId}/>}
        </div>
      </div>
    )
  }

  const originals=items.filter(i=>i.type==="original")
  const categoryGroups:Record<string,Item[]>={}
  CONTENT_CATEGORIES.forEach(cat=>{const g=originals.filter(i=>i.analysis?.content_type===cat);if(g.length>0)categoryGroups[cat]=g})
  const uncategorised=originals.filter(i=>!i.analysis?.content_type||!CONTENT_CATEGORIES.includes(i.analysis.content_type))
  if(uncategorised.length>0)categoryGroups["Uncategorised"]=uncategorised
  const hasActiveFilters=activeFilterCount>0||search.trim()||filter!=="All"

  return(
    <div className="p-5">
      {/* Sub-view toggle bar for originals */}
      <div className="flex gap-1 mb-5">
        {(["clips","originals","upload"] as const).map(sv=>{
          const labels={clips:"Clips",originals:"Originals",upload:"Upload"}
          const icons={clips:<ScissorsIcon className="w-3.5 h-3.5"/>,originals:<Film className="w-3.5 h-3.5"/>,upload:<Upload className="w-3.5 h-3.5"/>}
          const active=subView===sv
          return<button key={sv} onClick={()=>{if(sv==="upload"){setView("add");setSubView("upload")}else setSubView(sv)}} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-all ${
            active?"bg-accent-soft border border-accent text-accent font-semibold":"text-text-muted border border-border hover:border-border-strong"
          }`}>{icons[sv]} {labels[sv]}</button>
        })}
      </div>
      <div className="flex gap-2.5 mb-3 flex-wrap items-center">
        <input placeholder="Search titles, creators, tags..." value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 min-w-[180px] bg-surface border border-border rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent transition-colors"/>
        <select value={sortIdx} onChange={e=>setSortIdx(Number(e.target.value))} className="bg-surface border border-border rounded-lg px-3 py-2.5 text-text text-sm outline-none cursor-pointer">{SORTS.map((s,i)=><option key={i} value={i}>{s}</option>)}</select>
        {!selectMode&&<Btn onClick={()=>setSelectMode(true)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",padding:"9px 14px"}}>Select</Btn>}
        {selectMode&&<div className="flex gap-2 items-center">
          <Btn onClick={()=>setSelectedIds(filtered.map(i=>i.id))} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)",padding:"9px 14px"}}>Select All ({filtered.length})</Btn>
          <Btn onClick={bulkDelete} disabled={selectedIds.length===0||deleting} style={{background:selectedIds.length>0?"rgba(239,68,68,0.2)":"var(--color-border)",color:selectedIds.length>0?"var(--color-danger)":"var(--color-text-muted)",border:"1px solid "+(selectedIds.length>0?"rgba(239,68,68,0.4)":"var(--color-border)")}}>Delete ({selectedIds.length})</Btn>
          <Btn onClick={async()=>{const origIds=selectedIds.filter(id=>{const it=items.find((i:Item)=>i.id===id);return it?.type==="original"&&it?.mux_status==="ready"});if(origIds.length===0)return;for(const id of origIds){await supabase.from("items").update({mux_status:"analysing"}).eq("id",id);fetch("/api/items/reanalyse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:id})}).then(()=>onRefresh())};setSelectMode(false);setSelectedIds([]);onRefresh()}} disabled={selectedIds.length===0} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)"}}><RefreshCw className="w-3 h-3 inline"/> Re-analyse ({selectedIds.filter(id=>{const it=items.find((i:Item)=>i.id===id);return it?.type==="original"}).length})</Btn>
          <Btn onClick={()=>{setSelectMode(false);setSelectedIds([])}} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)"}}>Cancel</Btn>
        </div>}
      </div>
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex gap-1.5">{["All","Originals","Clips"].map(f=><button key={f} onClick={()=>setFilter(f)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold cursor-pointer border transition-colors ${filter===f?"bg-accent text-white border-accent":"bg-surface text-text-muted border-border hover:border-border-strong"}`}>{f}</button>)}</div>
        <div className="w-px h-5 bg-border shrink-0"/>
        <MultiSelect label="Content Type" options={CONTENT_CATEGORIES} selected={filterCtypes} onChange={setFilterCtypes}/>
        {allCreators.length>0&&<MultiSelect label="Creator" options={allCreators} selected={filterCreators} onChange={setFilterCreators}/>}
        <MultiSelect label="Age" options={AGE_RANGES} selected={filterAges} onChange={setFilterAges}/>
        <MultiSelect label="Gender" options={GENDERS} selected={filterGenders} onChange={setFilterGenders}/>
        <MultiSelect label="Ad Potential" options={AD_POTENTIALS} selected={filterAdPotential} onChange={setFilterAdPotential}/>
        <MultiSelect label="Duration" options={DURATION_RANGES} selected={filterDuration} onChange={setFilterDuration}/>
        {activeFilterCount>0&&<button onClick={clearFilters} className="bg-transparent border-none text-text-muted text-[11px] cursor-pointer underline">Clear all ({activeFilterCount})</button>}
      </div>
      {!hasActiveFilters&&Object.keys(categoryGroups).length>0&&<div className="mb-8">
        <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-4 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> Browse by Category</div>
        {Object.entries(categoryGroups).map(([cat,catItems])=>{
          const isOpen=categoryOpen[cat]!==false;const tc=typeColor(cat)
          return<div key={cat} className="mb-3 border border-border rounded-xl overflow-hidden">
            <div onClick={()=>setCategoryOpen(x=>({...x,[cat]:!isOpen}))} className="bg-card px-4 py-3 flex items-center gap-2.5 cursor-pointer hover:bg-card-hover transition-colors">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{background:tc.bg,color:tc.color}}>{cat}</span>
              <span className="text-sm text-text-muted">{catItems.length} video{catItems.length!==1?"s":""}</span>
              <span className="ml-auto text-[11px] text-text-muted">{isOpen?"▲":"▼"}</span>
            </div>
            {isOpen&&<div className="p-3.5 bg-bg">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">{catItems.map(item=><VideoCard key={item.id} item={item} onClick={()=>{setSelected(item);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(item.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(item.id)?prev.filter(x=>x!==item.id):[...prev,item.id])}/>)}</div>
              {catItems.some(i=>i.clip_ids?.length)&&<div className="mt-4 border-t border-border pt-3.5">
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1"><ScissorsIcon className="w-3 h-3" /> Clips from {cat}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">{catItems.flatMap(i=>i.clip_ids||[]).map(clipId=>{const clip=items.find(i=>i.id===clipId);if(!clip)return null;return<VideoCard key={clip.id} item={clip} onClick={()=>{setSelected(clip);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(clip.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(clip.id)?prev.filter(x=>x!==clip.id):[...prev,clip.id])}/>})}</div>
              </div>}
            </div>}
          </div>
        })}
        <div className="border-t border-border pt-5 mt-2"><div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-4">All Content</div></div>
      </div>}
      {filtered.length===0?<div className="text-center py-16 px-5 text-text-muted">
        <Film className="w-11 h-11 mx-auto mb-3.5 text-text-muted" />
        <div className="text-[17px] font-semibold text-text mb-1.5">{items.length===0?"Your library is empty":"No results"}</div>
        <div className="text-sm text-text-muted mb-5">{items.length===0?"Upload your first video to get started.":"Try adjusting your search or filters."}</div>
        {items.length===0&&<Btn onClick={()=>setView("add")} style={{background:"var(--color-accent)",color:"#fff"}}>+ Add First Content</Btn>}
        {activeFilterCount>0&&<Btn onClick={clearFilters} style={{background:"var(--color-surface)",color:"var(--color-text-muted)",border:"1px solid var(--color-border)"}}>Clear Filters</Btn>}
      </div>
      :<><div className={`text-xs text-text-muted mb-3 ${hasActiveFilters?"block":"hidden"}`}>Showing {filtered.length} result{filtered.length!==1?"s":""}</div><div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5">{filtered.map(item=><div key={item.id}><VideoCard item={item} onClick={()=>{setSelected(item);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(item.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(item.id)?prev.filter(x=>x!==item.id):[...prev,item.id])}/>{item.mux_status&&item.mux_status!=="ready"&&<UploadPipeline item={item} compact/>}</div>)}</div></>}
    </div>
  )
}
