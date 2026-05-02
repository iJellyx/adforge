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
import { ClipReviewModal } from '../ClipReviewModal'
import { ManualClipModal } from '../ManualClipModal'
import { UploadPipeline } from '../UploadPipeline'
import { FolderTree } from '../FolderTree'

export function LibraryTab({items:rawItems,onRefresh,view,setView,brand,products,onGoToBrand,workspaceId}:{items:Item[],onRefresh:()=>void,view:string,setView:(v:string)=>void,brand:BrandProfile,products:Product[],onGoToBrand:()=>void,workspaceId:string}){
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
  const [manualClipFor,setManualClipFor]=useState<Item|null>(null)
  // Folders: null = all, '__root' = unfiled, else = specific folder id
  const [activeFolderId,setActiveFolderId]=useState<string|null|'__root'>(null)
  const [folderRefreshTick,setFolderRefreshTick]=useState(0)

  // Pre-filter items by folder. Folder semantics: an original belongs to a
  // folder; its clips are considered to live there too. So when a user clicks
  // a folder we include both the originals in that folder and the clips
  // descended from those originals — even if the clip's own folder_id is null.
  const folderScopedItems=(()=>{
    if(activeFolderId===null)return rawItems
    if(activeFolderId==='__root'){
      const unfiledOriginals=new Set(rawItems.filter(i=>i.type==='original'&&!i.folder_id).map(i=>i.id))
      return rawItems.filter(i=>{
        if(i.type==='original')return !i.folder_id
        if(i.folder_id)return false
        return !i.parent_id||unfiledOriginals.has(i.parent_id)
      })
    }
    const originalsInFolder=new Set(rawItems.filter(i=>i.type==='original'&&i.folder_id===activeFolderId).map(i=>i.id))
    return rawItems.filter(i=>{
      if(i.type==='original')return i.folder_id===activeFolderId
      if(i.folder_id===activeFolderId)return true
      if(i.parent_id&&originalsInFolder.has(i.parent_id))return true
      return false
    })
  })()
  // Local `items` shadows the prop so all downstream filters/searches/sorts
  // operate on the folder-scoped subset without touching the rest of the file.
  const items=folderScopedItems

  // Folder counts (originals only — clips are implicit children)
  const folderCounts:Record<string,number>={}
  rawItems.forEach(i=>{if(i.type==='original'&&i.folder_id){folderCounts[i.folder_id]=(folderCounts[i.folder_id]||0)+1}})
  const totalOriginals=rawItems.filter(i=>i.type==='original').length
  const unfiledOriginals=rawItems.filter(i=>i.type==='original'&&!i.folder_id).length

  async function moveItemToFolder(itemId:string,folderId:string|null){
    await supabase.from('items').update({folder_id:folderId}).eq('id',itemId)
    onRefresh()
    setFolderRefreshTick(x=>x+1)
  }

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
    // Check for OAuth callback result in URL
    const params=new URLSearchParams(window.location.search)
    const gdrive=params.get("gdrive")
    if(gdrive==="connected"){setShowFolderPicker(true);window.history.replaceState({},"",window.location.pathname)}
    if(gdrive==="error"){setGdriveSyncMsg("Connection failed — please try again");window.history.replaceState({},"",window.location.pathname)}
  },[])

  async function loadGdriveStatus(){
    try{const res=await fetch("/api/integrations/gdrive/sync");if(res.ok){const d=await res.json();setGdriveStatus(d)}}catch(e){}
  }

  async function syncNow(){
    setGdriveSyncing(true);setGdriveSyncMsg("Scanning folder…")
    try{
      const res=await fetch("/api/integrations/gdrive/sync",{method:"POST"})
      const d=await res.json()
      if(d.error){setGdriveSyncMsg("Sync failed: "+d.error)}
      else if(d.imported===0){setGdriveSyncMsg("✓ Up to date — no new videos found")}
      else{setGdriveSyncMsg(`✓ Imported ${d.imported} new video${d.imported!==1?"s":""}`);onRefresh()}
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
    // Kick off initial sync
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
    updateQueue(idx,{status:"uploading",progress:2,msg:"Checking for duplicates…"})

    // Duplicate detection — check duration + file size against existing items
    try{
      const fileSizeMB=entry.file.size/1024/1024
      // Get video duration from file
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
          return durDiff<1.5 // within 1.5 seconds = likely same video
        })
        if(possibleDupes.length>0){
          const dupeTitle=possibleDupes[0].title
          updateQueue(idx,{status:"duplicate_warning",progress:0,msg:`Possible duplicate of "${dupeTitle}" (${videoDuration.toFixed(1)}s). Upload anyway?`})
          return
        }
      }
    }catch(e){/* continue with upload if check fails */}

    updateQueue(idx,{status:"uploading",progress:5,msg:"Creating record…"})

    try{
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:entry.file.name,contentType:entry.file.type,metadata:{title:entry.title,creator:entry.creator,creatorAge:entry.creatorAge,creatorGender:entry.creatorGender,autoClip:entry.autoClip!==false},workspaceId})})
      const{itemId,uploadUrl,error}=await res.json()
      if(error)throw new Error(error)
      updateQueue(idx,{progress:10,msg:"Uploading video…"})
      await new Promise<void>((resolve,reject)=>{
        const xhr=new XMLHttpRequest()
        xhr.upload.onprogress=e=>{if(e.lengthComputable)updateQueue(idx,{progress:10+Math.round((e.loaded/e.total)*75),msg:"Uploading…"})}
        xhr.onload=()=>resolve()
        xhr.onerror=()=>reject(new Error("Upload failed"))
        xhr.open("PUT",uploadUrl)
        xhr.setRequestHeader("Content-Type",entry.file.type)
        xhr.send(entry.file)
      })
      // Poll for video ready / duplicate (up to 90 seconds)
      // Once ready, analysis continues in background
      let pollAttempts = 0
      let finalStatus = 'done'
      while (pollAttempts < 30) {
        await new Promise(r => setTimeout(r, 3000))
        const supabase = createClient()
        const { data: statusCheck } = await supabase.from('items').select('mux_status').eq('id', itemId).single()
        if (statusCheck?.mux_status === 'duplicate') { finalStatus = 'duplicate'; break }
        if (statusCheck?.mux_status === 'ready') break
        if (statusCheck?.mux_status === 'errored') { finalStatus = 'error'; break }
        pollAttempts++
      }
      updateQueue(idx, {
        status: finalStatus,
        progress: 100,
        msg: finalStatus === 'duplicate' ? 'Duplicate blocked' :
             finalStatus === 'error' ? 'Upload failed' :
             'Video ready · AI clipping in background'
      })
      onRefresh()

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
    // Sub-view scopes the list before any user filters apply.
    // "originals" view → only originals. "clips" view → only clips.
    if(subView==="originals"&&item.type!=="original")return false
    if(subView==="clips"&&item.type!=="clip")return false
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
  if(view==="add"||subView==="upload")return<div style={{maxWidth:860,margin:"0 auto",padding:28}}>
    <button onClick={()=>{setView("grid");setSubView("clips")}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to Stash</button>
    <STitle size={22}>Add Content</STitle>
    <div style={{color:C.muted,fontSize:14,marginBottom:24}}>Upload videos manually or connect a Google Drive folder for automatic syncing.</div>

    {/* ── Google Drive Connected Source ── */}
    {showFolderPicker&&<div onClick={()=>setShowFolderPicker(false)} style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:16,padding:24,maxWidth:560,width:"100%"}}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>📁 Select a Google Drive folder</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:16}}>All videos in this folder (and subfolders) will be imported automatically.</div>
        {folderPickerPath.length>0&&<div style={{display:"flex",gap:4,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>{setFolderPickerPath([]);openFolderPicker("root")}} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,padding:0}}>My Drive</button>
          {folderPickerPath.map((p,i)=><><span key={"sep"+i} style={{color:C.muted,fontSize:12}}>/</span><button key={p.id} onClick={()=>{const newPath=folderPickerPath.slice(0,i+1);setFolderPickerPath(newPath);openFolderPicker(p.id)}} style={{background:"none",border:"none",color:i===folderPickerPath.length-1?C.text:C.accent,cursor:"pointer",fontSize:12,padding:0}}>{p.name}</button></>)}
        </div>}
        <div style={{maxHeight:320,overflowY:"auto",border:"1px solid "+C.border,borderRadius:10,marginBottom:16}}>
          {folderPickerLoading?<div style={{padding:24,textAlign:"center",color:C.muted,fontSize:13}}>Loading folders…</div>
          :folderPickerItems.length===0?<div style={{padding:24,textAlign:"center",color:C.muted,fontSize:13}}>No subfolders found</div>
          :folderPickerItems.map((folder:any)=><div key={folder.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid "+C.border,cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget.style.background=C.accentSoft)} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
            <span style={{fontSize:18}}>📁</span>
            <span style={{flex:1,fontSize:13,fontWeight:500}}>{folder.name}</span>
            <button onClick={()=>{const newPath=[...folderPickerPath,{id:folder.id,name:folder.name}];setFolderPickerPath(newPath);openFolderPicker(folder.id)}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"2px 6px"}}>Open →</button>
            <button onClick={()=>selectFolder(folder)} style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Select</button>
          </div>)}
        </div>
        {folderPickerPath.length>0&&<Btn onClick={()=>selectFolder(folderPickerPath[folderPickerPath.length-1])} style={{background:C.green,color:"#000",fontWeight:700,width:"100%",marginBottom:8}}>✓ Use "{folderPickerPath[folderPickerPath.length-1]?.name}"</Btn>}
        <Btn onClick={()=>setShowFolderPicker(false)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,width:"100%"}}>Cancel</Btn>
      </div>
    </div>}

    <Card style={{marginBottom:24}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:gdriveStatus?.folder_id?12:0}}>
        <div style={{width:36,height:36,borderRadius:8,background:"#4285F422",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🔗</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:1}}>Google Drive Sync</div>
          <div style={{fontSize:12,color:C.muted}}>
            {gdriveStatus?.folder_id?`Connected: ${gdriveStatus.folder_name||gdriveStatus.folder_id}`:"Connect a folder — new videos sync automatically"}
          </div>
        </div>
        {!gdriveStatus?.folder_id
          ?<a href="/api/integrations/gdrive/connect" style={{textDecoration:"none"}}><Btn style={{background:"#4285F4",color:"#fff",fontWeight:700,fontSize:12,padding:"7px 14px",whiteSpace:"nowrap" as const}}>Connect Drive</Btn></a>
          :<div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{openFolderPicker("root");setShowFolderPicker(true)}} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"6px 12px"}}>Change folder</Btn>
            <Btn onClick={syncNow} disabled={gdriveSyncing} style={{background:gdriveSyncing?C.border:C.green,color:gdriveSyncing?C.muted:"#000",fontWeight:700,fontSize:12,padding:"6px 12px"}}>{gdriveSyncing?"⏳ Syncing…":"🔄 Sync now"}</Btn>
            <Btn onClick={disconnectDrive} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"6px 10px"}}>Disconnect</Btn>
          </div>}
      </div>
      {gdriveStatus?.folder_id&&<div style={{display:"flex",gap:16,fontSize:12,color:C.muted,paddingTop:8,borderTop:"1px solid "+C.border,flexWrap:"wrap"}}>
        {gdriveStatus.last_synced&&<span>Last synced: {new Date(gdriveStatus.last_synced).toLocaleString()}</span>}
        {gdriveStatus.imported_ids?.length>0&&<span>{gdriveStatus.imported_ids.length} videos imported</span>}
        {gdriveStatus.sync_status==="error"&&<span style={{color:C.red}}>⚠️ {gdriveStatus.sync_error}</span>}
      </div>}
      {gdriveSyncMsg&&<div style={{marginTop:8,fontSize:12,color:gdriveSyncMsg.startsWith("✓")?C.green:C.red,fontWeight:600}}>{gdriveSyncMsg}</div>}
    </Card>

    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
      <div style={{flex:1,height:1,background:C.border}}/>
      <span style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:"0.06em"}}>or upload manually</span>
      <div style={{flex:1,height:1,background:C.border}}/>
    </div>

    {/* Drop zone */}
    <div onDrop={e=>{e.preventDefault();setDragOver(false);const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("video/"));if(files.length>0)addFiles(files)}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileRef.current?.click()} style={{border:"2px dashed "+(dragOver?C.accent:C.border),borderRadius:10,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragOver?C.accentSoft:C.surface,marginBottom:20,transition:"all 0.15s"}}>
      <input ref={fileRef} type="file" accept="video/*" multiple style={{display:"none"}} onChange={e=>{const files=Array.from(e.target.files||[]).filter(f=>f.type.startsWith("video/"));if(files.length>0)addFiles(files);e.target.value=""}}/>
      <div style={{fontSize:36,marginBottom:10}}>🎬</div>
      <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Drop videos here or click to select</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:4}}>MP4, MOV, WebM — select multiple files at once</div>
      <div style={{fontSize:12,color:C.accent}}>✨ AI will auto-transcribe and analyse each video</div>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,padding:"10px 14px",background:C.surface,borderRadius:10,border:"1.5px solid "+C.border}}>
      <div onClick={()=>setAutoClipEnabled((v:boolean)=>!v)} style={{width:36,height:20,borderRadius:99,background:autoClipEnabled?C.accent:C.border,cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:autoClipEnabled?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
      </div>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:C.text}}>Auto-clip with AI</div>
        <div style={{fontSize:11,color:C.muted}}>{autoClipEnabled?"✂️ AI will create clips from each video":"📊 Analysis only — no clips will be created"}</div>
      </div>
    </div>

     {/* Upload queue — aggregate view */}
    {uploadQueue.length>0&&<div style={{marginBottom:20}}>
      {(()=>{
        const total=uploadQueue.length
        const done=uploadQueue.filter((e:any)=>e.status==="done"||e.status==="duplicate").length
        const errored=uploadQueue.filter((e:any)=>e.status==="error").length
        const uploading=uploadQueue.filter((e:any)=>e.status==="uploading"||e.status==="processing").length
        const pending=uploadQueue.filter((e:any)=>e.status==="pending").length
        const pct=Math.round((done/total)*100)
        const avgSecsPerVideo=90 // rough estimate inc Gemini analysis
        const remaining=pending+uploading
        const secsLeft=remaining*avgSecsPerVideo
        const minsLeft=Math.ceil(secsLeft/60)
        const allDone=done+errored===total
        return<>
          <div style={{background:C.card,border:"1.5px solid "+C.border,borderRadius:10,padding:20,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:15,color:C.text}}>{allDone?"✓ Upload complete":"⏳ Uploading & analysing…"}</div>
              <div style={{fontSize:13,color:C.muted,fontWeight:600}}>{done}/{total} videos</div>
            </div>
            <div style={{height:8,background:C.border,borderRadius:99,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:pct+"%",background:allDone?C.green:C.accent,borderRadius:99,transition:"width 0.5s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted}}>
              <span>{allDone?"All videos processed — AI analysis running in background":"AI is transcribing and analysing each video"}</span>
              {!allDone&&remaining>0&&<span style={{fontWeight:600,color:C.accent}}>~{minsLeft} min{minsLeft!==1?"s":""} left</span>}
            </div>
            {errored>0&&<div style={{marginTop:8,fontSize:12,color:C.red}}>⚠️ {errored} video{errored!==1?"s":""} failed</div>}
            {uploadQueue.filter((e:any)=>e.status==="duplicate").length>0&&<div style={{marginTop:6,fontSize:12,color:C.yellow}}>⚠️ {uploadQueue.filter((e:any)=>e.status==="duplicate").length} duplicate{uploadQueue.filter((e:any)=>e.status==="duplicate").length!==1?"s":""} blocked</div>}
          </div>
          {/* Show individual errors only */}
          {uploadQueue.filter((e:any)=>e.status==="error").map((entry:any)=><div key={entry.id} style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:10,padding:"10px 14px",marginBottom:8,fontSize:12,color:C.red}}>❌ {entry.title} — {entry.msg}</div>)}
          {/* Upload pipeline for items currently processing */}
          {items.filter(it=>it.mux_status&&it.mux_status!=="ready"&&it.mux_status!=="errored"&&it.mux_status!=="duplicate").slice(0,5).map(it=><div key={it.id} style={{background:C.card,border:"1.5px solid "+C.border,borderRadius:10,padding:"6px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{it.title}</div>
              <UploadPipeline item={it} compact/>
            </div>
          </div>)}
          {uploadQueue.filter((e:any)=>e.status==="duplicate_warning").map((entry:any)=>{
            const realIdx=uploadQueue.indexOf(entry)
            return<div key={entry.id} style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200}}><div style={{fontSize:12,fontWeight:700,color:"#92400E",marginBottom:2}}>⚠️ Possible duplicate</div><div style={{fontSize:11,color:"#92400E"}}>{entry.msg}</div></div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={()=>updateQueue(realIdx,{status:"pending",progress:0,msg:""})} style={{background:C.accent,color:"#fff",fontSize:11,padding:"5px 12px"}}>Upload anyway</Btn>
                <Btn onClick={()=>updateQueue(realIdx,{status:"duplicate",progress:0,msg:"Skipped"})} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:11,padding:"5px 12px"}}>Skip</Btn>
              </div>
            </div>
          })}
          {/* Pending uploads that still need a title */}
          {uploadQueue.filter((e:any)=>e.status==="pending").map((entry:any,idx:number)=>{
            const realIdx=uploadQueue.indexOf(entry)
            return<div key={entry.id} style={{background:C.card,border:"1.5px solid "+C.border,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{flex:1,minWidth:0}}>
                <input value={entry.title} onChange={e=>updateQueue(realIdx,{title:e.target.value})} placeholder="Video title *" style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"5px 10px",color:C.text,fontSize:12,outline:"none",width:"100%",boxSizing:"border-box" as const}}/>
              </div>
              <Btn onClick={()=>uploadSingle(realIdx)} disabled={!entry.title?.trim()} style={{background:C.accent,color:"#fff",fontSize:11,padding:"5px 12px"}}>Upload</Btn>
              <Btn onClick={()=>removeFromQueue(realIdx)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:11,padding:"5px 10px"}}>✕</Btn>
            </div>
          })}
        </>
      })()}
    </div>}

    {/* Upload all button */}
    {uploadQueue.filter((e:any)=>e.status==="pending").length>1&&<Btn onClick={uploadAll} disabled={uploadQueue.some((e:any)=>e.status==="uploading")} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12,marginBottom:12}}>
      ✨ Upload All {uploadQueue.filter((e:any)=>e.status==="pending").length} Videos
    </Btn>}

    {/* While uploading — prompt for brand/product info */}
    {uploadQueue.some((e:any)=>e.status==="uploading"||e.status==="processing"||e.status==="done")&&<div style={{marginBottom:12}}>
      {(!brand?.name||!brand?.description)&&<div style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:13,color:C.yellow,marginBottom:4}}>💡 While you wait — set up your Brand Profile</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Your brand name, voice, and description help AI write better scripts and match clips more accurately.</div>
       <button onClick={onGoToBrand} style={{background:C.yellow,color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Set up Brand →</button>
      </div>}
      {brand?.name&&(!products||products.length===0)&&<div style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:13,color:"#2563EB",marginBottom:4}}>💡 Add your products while you wait</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Products let AI create targeted scripts with specific benefits, claims, and pricing.</div>
       <button onClick={()=>{onRefresh();setView("grid");}} style={{background:"#2563EB",color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Add Products →</button>
      </div>}
    </div>}
  </div>

  if(view==="detail"&&selected){
    const a=selected.analysis||{}
    const clips=selected.type==="original"&&selected.clip_ids?items.filter(i=>selected.clip_ids!.includes(i.id)):[]
    const adPotColor=a.ad_potential==="High"?C.green:a.ad_potential==="Medium"?C.yellow:C.red
    return<div style={{maxWidth:860,margin:"0 auto",padding:28}}>
      <button onClick={()=>{setSelected(null);setView("grid")}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to Stash</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,gap:16}}>
        <div><Chip label={selected.type==="clip"?"CLIP":(a.content_type||"Untagged")} color={selected.type==="clip"?typeColor("Clip"):undefined}/><div style={{fontWeight:800,fontSize:22,marginTop:8,marginBottom:4}}>{selected.title}</div><div style={{color:C.muted,fontSize:13,display:"flex",gap:12,flexWrap:"wrap"}}>{selected.duration_seconds&&<span>⏱ {fmt(selected.duration_seconds)}</span>}{selected.creator&&<span>👤 {selected.creator}{selected.creator_age?` · ${selected.creator_age}`:""}</span>}{selected.created_at&&<span>Added {new Date(selected.created_at).toLocaleDateString()}</span>}</div></div>
        <Btn onClick={async()=>{
          if(selected.type==="clip"&&selected.parent_id){
            // Remove from parent's clip_ids
            const parent=items.find(i=>i.id===selected.parent_id)
            if(parent?.clip_ids){
              await supabase.from("items").update({clip_ids:parent.clip_ids.filter((id:string)=>id!==selected.id)}).eq("id",selected.parent_id)
            }
            await supabase.from("items").delete().eq("id",selected.id)
          } else {
            await handleDelete(selected.id)
          }
          onRefresh();setSelected(null);setView("grid")
        }} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",flexShrink:0}}>Delete</Btn>
      </div>
      <MuxClipPlayer item={selected}/>
      {a.summary&&<Card style={{marginBottom:12}}><Label>Summary</Label><p style={{margin:0,lineHeight:1.7,fontSize:14}}>{a.summary}</p></Card>}
      {(a.creative_tags?.length>0||a.is_talking_head!=null||a.is_broll!=null||a.visual_style)&&<Card style={{marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>🏷️ Creative Tags</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {a.is_talking_head&&<span style={{background:"#7C3AED22",color:"#7C3AED",padding:"3px 8px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid #7C3AED33"}}>Talking Head</span>}
          {a.is_broll&&<span style={{background:"#2563EB22",color:"#2563EB",padding:"3px 8px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid #2563EB33"}}>B-Roll</span>}
          {a.visual_style&&<span style={{background:C.accentSoft,color:C.accent,padding:"3px 8px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid "+C.accent+"33"}}>{a.visual_style.replace(/_/g," ")}</span>}
          {a.has_face&&<span style={{background:"#f59e0b22",color:"#f59e0b",padding:"3px 8px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid #f59e0b33"}}>Has Face</span>}
          {a.product_visible&&<span style={{background:"#22c55e22",color:C.green,padding:"3px 8px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid #22c55e33"}}>Product Visible</span>}
        </div>
        {a.creative_tags?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{a.creative_tags.map((t:string,i:number)=><span key={i} style={{background:C.surface,color:C.muted,padding:"2px 7px",borderRadius:99,fontSize:9,fontWeight:600,border:"1px solid "+C.border}}>{t.replace(/_/g," ")}</span>)}</div>}
      </Card>}
        {selected.type==="clip"&&<Card style={{marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>🎯 Clip Role</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["hook","problem","solution","social_proof","cta","b_roll","product_demo","reaction","before_after","testimonial"].map(role=>{
            const active=(selected.clip_role||a.clip_role)===role
            return<button key={role} onClick={async()=>{
              const supabase=createClient()
              await supabase.from("items").update({clip_role:role,analysis:{...a,clip_role:role}}).eq("id",selected.id)
              setSelected({...selected,clip_role:role,analysis:{...a,clip_role:role}})
            }} style={{background:active?C.accent:C.surface,color:active?"#fff":C.muted,border:"1px solid "+(active?C.accent:C.border),borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:active?700:400,cursor:"pointer"}}>
              {role.replace(/_/g," ")}
            </button>
          })}
        </div>
        {(selected.clip_role||a.clip_role)&&<div style={{fontSize:11,color:C.green,marginTop:8}}>✓ Role set — this clip will be prioritised for {(selected.clip_role||a.clip_role)?.replace(/_/g," ")} sections</div>}
        {a.quality_score&&<div style={{fontSize:11,color:a.quality_score==="High"?C.green:a.quality_score==="Low"?"#ef4444":C.yellow,marginTop:6}}>AI Quality: {a.quality_score}</div>}
      </Card>}
      {selected.type!=="clip"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>{[{l:"Tone",v:a.tone},{l:"Ad Potential",v:a.ad_potential,c:adPotColor},{l:"Confidence",v:a.confidence}].map(s=><Card key={s.l} style={{textAlign:"center",padding:14}}><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{s.l}</div><div style={{fontWeight:700,fontSize:14,color:(s as any).c||C.text}}>{s.v||"—"}</div></Card>)}</div>}
      <Card style={{marginBottom:12}}>
  <div style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>🎯 Clip Role</div>
  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
    {["hook","problem","solution","social_proof","cta","b_roll","product_demo","testimonial"].map(role=>{
      const isActive=(selected.clip_role||selected.analysis?.clip_role)===role
      return<button key={role} onClick={async()=>{
        await supabase.from("items").update({clip_role:isActive?null:role}).eq("id",selected.id)
        onRefresh()
        setSelected({...selected,clip_role:isActive?undefined:role})
      }} style={{background:isActive?C.accent:C.surface,color:isActive?"#fff":C.muted,border:"1px solid "+(isActive?C.accent:C.border),borderRadius:99,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:isActive?700:400}}>{role.replace("_"," ")}</button>
    })}
  </div>
  <div style={{fontSize:10,color:C.muted,marginTop:6}}>Assigning a role helps AI match this clip to the right script sections</div>
</Card>
      {selected.transcript&&<Card style={{marginBottom:12}}><div style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>📝 Auto-Transcript</div><div style={{fontSize:13,lineHeight:1.7,color:C.muted,maxHeight:120,overflowY:"auto"}}>{selected.transcript}</div></Card>}
      {a.key_quotes?.length>0&&<Card style={{marginBottom:12}}><Label>Key Quotes</Label>{a.key_quotes.map((q:string,i:number)=><div key={i} style={{borderLeft:"3px solid "+C.accent,paddingLeft:12,marginBottom:8,fontSize:14,fontStyle:"italic"}}>"{q}"</div>)}</Card>}
      {a.ad_notes&&<Card style={{background:adPotColor+"18",border:"1px solid "+adPotColor+"44",marginBottom:12}}><div style={{fontWeight:700,fontSize:11,color:adPotColor,marginBottom:6}}>📢 AD USAGE</div><div style={{fontSize:14,lineHeight:1.6}}>{a.ad_notes}</div></Card>}
     {selected.type==="original"&&selected.mux_status==="ready"&&<Card style={{marginBottom:12,background:clips.length===0?"#FFFBEB":"#F0F4FF",border:"1.5px solid "+(clips.length===0?"#FCD34D":C.accent+"44")}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            {clips.length===0?<>
              <div style={{fontWeight:700,fontSize:13,color:C.yellow,marginBottom:2}}>⚠️ No clips generated</div>
              <div style={{fontSize:11,color:C.muted}}>This may have happened due to low AI credits. Re-analyse to generate clips.</div>
            </>:<>
              <div style={{fontWeight:700,fontSize:13,color:C.accent,marginBottom:2}}>🔄 Re-analyse Video</div>
              <div style={{fontSize:11,color:C.muted}}>Re-run AI analysis to benefit from improved tagging & clip detection. Existing clips will be replaced.</div>
            </>}
          </div>
          <Btn onClick={async()=>{
            await supabase.from("items").update({mux_status:"analysing"}).eq("id",selected.id)
            setSelected({...selected,mux_status:"analysing"})
            fetch("/api/items/reanalyse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:selected.id})}).then(()=>onRefresh())
          }} style={{background:clips.length===0?C.yellow:C.accent,color:"#fff",fontSize:12,padding:"7px 16px",whiteSpace:"nowrap"}}>Re-analyse</Btn>
        </div>
      </Card>}

      {/* Manual clip creation — for shots the user wants to grab themselves */}
      {selected.type==="original"&&selected.mux_status==="ready"&&<Card style={{marginBottom:12,background:"#F5FBF5",border:"1.5px solid #86EFAC"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13,color:C.green,marginBottom:2}}>✂️ Create a custom clip</div>
            <div style={{fontSize:11,color:C.muted}}>Cut your own shot from this video — pick the exact start/end, give it a title, optionally tag it. Goes straight into your Stash.</div>
          </div>
          <Btn onClick={()=>setManualClipFor(selected)} style={{background:C.green,color:"#000",fontSize:12,padding:"7px 16px",whiteSpace:"nowrap",fontWeight:700}}>Create clip</Btn>
        </div>
      </Card>}
      {selected.type==="original"&&selected.mux_status==="analysing"&&<Card style={{marginBottom:12,background:"#F0F4FF",border:"1.5px solid "+C.accent+"44"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:18,height:18,border:"2px solid "+C.accent,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
          <div style={{fontSize:13,color:C.accent,fontWeight:600}}>Re-analysing… This may take a minute.</div>
        </div>
      </Card>}
      {clips.length>0&&<div style={{marginTop:24}}><STitle>✂️ Auto-Generated Clips ({clips.length})</STitle><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}>{clips.map(c=><VideoCard key={c.id} item={c} onClick={()=>setSelected(c)} selectMode={false} isSelected={false} onToggleSelect={()=>{}}/>)}</div></div>}

      {/* Manual clip modal — opens from the green card above */}
      {manualClipFor && (
        <ManualClipModal
          original={manualClipFor}
          workspaceId={workspaceId}
          onSave={(newClip)=>{
            setManualClipFor(null)
            onRefresh()
            // If we're still on the original's detail view, refresh selected.clip_ids
            if (selected?.id === manualClipFor.id) {
              setSelected({...selected, clip_ids: [...(selected.clip_ids||[]), newClip.id]})
            }
          }}
          onClose={()=>setManualClipFor(null)}
        />
      )}
    </div>
  }

  // ── Sub-view: Clips (default) ──
  if(subView==="clips"&&view==="grid"){
    return<div style={{display:"flex",alignItems:"stretch",minHeight:"calc(100vh - 56px)"}} key={folderRefreshTick}>
      <div style={{width:240,flexShrink:0}}>
        <FolderTree
          workspaceId={workspaceId}
          kind="library"
          activeFolderId={activeFolderId}
          onSelect={setActiveFolderId}
          counts={folderCounts}
          totalCount={totalOriginals}
          unfiledCount={unfiledOriginals}
          onChange={onRefresh}
          onDropItem={(itemId,folderId)=>moveItemToFolder(itemId,folderId)}
        />
      </div>
      <div style={{flex:1,position:"relative",minWidth:0}}>
      {/* Sub-view toggle bar */}
      <div style={{padding:"16px 24px 0",display:"flex",alignItems:"center",gap:16,borderBottom:"1px solid "+C.border,background:C.card}}>
        <div style={{display:"flex",gap:4}}>
          {(["clips","originals","upload"] as const).map(sv=>{
            const labels={clips:"✂️ Clips",originals:"🎬 Originals",upload:"⬆️ Upload"}
            const active=subView===sv
            return<button key={sv} onClick={()=>{if(sv==="upload"){setView("add");setSubView("upload")}else setSubView(sv)}} style={{padding:"10px 18px",background:"none",border:"none",borderBottom:"2px solid "+(active?C.accent:"transparent"),color:active?C.text:C.muted,fontWeight:active?700:500,fontSize:14,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap",fontFamily:"inherit"}}>{labels[sv]}</button>
          })}
        </div>
        <div style={{marginLeft:"auto",fontSize:12,color:C.muted}}>
          {items.filter(i=>i.type==="clip").length} clips from {items.filter(i=>i.type==="original").length} videos
        </div>
      </div>
      {/* Recent clips */}
      {(()=>{
        const recentClips=items.filter(i=>i.type==="clip"&&i.mux_status==="ready").slice(0,6)
        if(recentClips.length===0)return null
        return<div style={{padding:"16px 24px",borderBottom:"1px solid "+C.border}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>⏱️ Recent Clips</div>
          <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
            {recentClips.map(clip=><div key={clip.id} style={{flexShrink:0,width:100}}><VideoCard item={clip} compact onClick={()=>setClipDetailItem(clip)} selectMode={false} isSelected={false} onToggleSelect={()=>{}}/></div>)}
          </div>
        </div>
      })()}
      {/* Clips view */}
      <div style={{display:"flex"}}>
        <div style={{flex:1}}><ClipsView items={items} onRefresh={onRefresh} workspaceId={workspaceId} onSelectClip={(item:Item)=>setClipDetailItem(item)}/></div>
      </div>
      {/* Fullscreen review modal — replaces small side panel */}
      {clipDetailItem&&(()=>{
        const allClips=items.filter(i=>i.type==="clip")
        const idx=Math.max(0,allClips.findIndex(c=>c.id===clipDetailItem.id))
        return <ClipReviewModal clips={allClips} startIndex={idx} onClose={()=>setClipDetailItem(null)} onRefresh={onRefresh}/>
      })()}
      </div>
    </div>
  }

  const originals=items.filter(i=>i.type==="original")
  const categoryGroups:Record<string,Item[]>={}
  CONTENT_CATEGORIES.forEach(cat=>{const g=originals.filter(i=>i.analysis?.content_type===cat);if(g.length>0)categoryGroups[cat]=g})
  const uncategorised=originals.filter(i=>!i.analysis?.content_type||!CONTENT_CATEGORIES.includes(i.analysis.content_type))
  if(uncategorised.length>0)categoryGroups["Uncategorised"]=uncategorised
  const hasActiveFilters=activeFilterCount>0||search.trim()||filter!=="All"

  return<div style={{display:"flex",alignItems:"stretch",minHeight:"calc(100vh - 56px)"}} key={folderRefreshTick}>
    <div style={{width:240,flexShrink:0}}>
      <FolderTree
        workspaceId={workspaceId}
        kind="library"
        activeFolderId={activeFolderId}
        onSelect={setActiveFolderId}
        counts={folderCounts}
        totalCount={totalOriginals}
        unfiledCount={unfiledOriginals}
        onChange={onRefresh}
        onDropItem={(itemId,folderId)=>moveItemToFolder(itemId,folderId)}
      />
    </div>
    <div style={{flex:1,padding:20,minWidth:0,overflowX:"hidden"}}>
    {/* Sub-view toggle bar for originals */}
    <div style={{display:"flex",gap:4,marginBottom:20}}>
      {(["clips","originals","upload"] as const).map(sv=>{
        const labels={clips:"✂️ Clips",originals:"🎬 Originals",upload:"⬆️ Upload"}
        const active=subView===sv
        return<button key={sv} onClick={()=>{if(sv==="upload"){setView("add");setSubView("upload")}else setSubView(sv)}} style={{padding:"8px 16px",background:active?C.accentSoft:"none",border:"1px solid "+(active?C.accent:C.border),borderRadius:99,color:active?C.accent:C.muted,fontWeight:active?700:500,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{labels[sv]}</button>
      })}
    </div>
    <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <input placeholder="Search titles, creators, tags…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180,background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none"}}/>
      <select value={sortIdx} onChange={e=>setSortIdx(Number(e.target.value))} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:13,outline:"none",cursor:"pointer"}}>{SORTS.map((s,i)=><option key={i} value={i}>{s}</option>)}</select>
      {!selectMode&&<Btn onClick={()=>setSelectMode(true)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"9px 14px"}}>Select</Btn>}
      {selectMode&&<div style={{display:"flex",gap:8,alignItems:"center"}}>
        <Btn onClick={()=>setSelectedIds(filtered.map(i=>i.id))} style={{background:"#EDE8FF",color:C.accent,border:"1px solid "+C.accent+"44",padding:"9px 14px"}}>Select All ({filtered.length})</Btn>
        <Btn onClick={bulkDelete} disabled={selectedIds.length===0||deleting} style={{background:selectedIds.length>0?"#ef444433":C.border,color:selectedIds.length>0?"#ef4444":C.muted,border:"1px solid "+(selectedIds.length>0?"#ef444466":C.border)}}>Delete ({selectedIds.length})</Btn>
        <Btn onClick={async()=>{const origIds=selectedIds.filter(id=>{const it=items.find((i:Item)=>i.id===id);return it?.type==="original"&&it?.mux_status==="ready"});if(origIds.length===0)return;for(const id of origIds){await supabase.from("items").update({mux_status:"analysing"}).eq("id",id);fetch("/api/items/reanalyse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:id})}).then(()=>onRefresh())};setSelectMode(false);setSelectedIds([]);onRefresh()}} disabled={selectedIds.length===0} style={{background:selectedIds.filter(id=>{const it=items.find((i:Item)=>i.id===id);return it?.type==="original"}).length>0?"#5B49FF22":C.border,color:selectedIds.filter(id=>{const it=items.find((i:Item)=>i.id===id);return it?.type==="original"}).length>0?C.accent:C.muted,border:"1px solid "+(C.accent+"44")}}>🔄 Re-analyse ({selectedIds.filter(id=>{const it=items.find((i:Item)=>i.id===id);return it?.type==="original"}).length})</Btn>
        <Btn onClick={()=>{setSelectMode(false);setSelectedIds([])}} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Cancel</Btn>
      </div>}
    </div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{display:"flex",gap:5}}>{["All","Originals","Clips"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?C.accent:C.surface,color:filter===f?"#fff":C.muted,border:"1px solid "+(filter===f?C.accent:C.border),borderRadius:99,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{f}</button>)}</div>
      <div style={{width:1,height:20,background:C.border,flexShrink:0}}/>
      <MultiSelect label="Content Type" options={CONTENT_CATEGORIES} selected={filterCtypes} onChange={setFilterCtypes}/>
      {allCreators.length>0&&<MultiSelect label="Creator" options={allCreators} selected={filterCreators} onChange={setFilterCreators}/>}
      <MultiSelect label="Age" options={AGE_RANGES} selected={filterAges} onChange={setFilterAges}/>
      <MultiSelect label="Gender" options={GENDERS} selected={filterGenders} onChange={setFilterGenders}/>
      <MultiSelect label="Ad Potential" options={AD_POTENTIALS} selected={filterAdPotential} onChange={setFilterAdPotential}/>
      <MultiSelect label="Duration" options={DURATION_RANGES} selected={filterDuration} onChange={setFilterDuration}/>
      {activeFilterCount>0&&<button onClick={clearFilters} style={{background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>Clear all ({activeFilterCount})</button>}
    </div>
    {!hasActiveFilters&&Object.keys(categoryGroups).length>0&&<div style={{marginBottom:32}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:16}}>📂 Browse by Category</div>
      {Object.entries(categoryGroups).map(([cat,catItems])=>{
        const isOpen=categoryOpen[cat]!==false;const tc=typeColor(cat)
        return<div key={cat} style={{marginBottom:12,border:"1px solid "+C.border,borderRadius:12,overflow:"hidden"}}>
          <div onClick={()=>setCategoryOpen(x=>({...x,[cat]:!isOpen}))} style={{background:C.card,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <span style={{background:tc.bg,color:tc.color,padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid #fff1"}}>{cat}</span>
            <span style={{fontSize:13,color:C.muted}}>{catItems.length} video{catItems.length!==1?"s":""}</span>
            <span style={{marginLeft:"auto",fontSize:11,color:C.muted}}>{isOpen?"▲":"▼"}</span>
          </div>
          {isOpen&&<div style={{padding:14,background:C.bg}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>{catItems.map(item=><VideoCard key={item.id} item={item} onClick={()=>{setSelected(item);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(item.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(item.id)?prev.filter(x=>x!==item.id):[...prev,item.id])}/>)}</div>
            {/* Embedded clips strip is suppressed on the Originals subview — pure originals view should stay pure. */}
            {subView!=="originals"&&catItems.some(i=>i.clip_ids?.length)&&<div style={{marginTop:16,borderTop:"1px solid "+C.border,paddingTop:14}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>✂️ Clips from {cat}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10}}>{catItems.flatMap(i=>i.clip_ids||[]).map(clipId=>{const clip=items.find(i=>i.id===clipId);if(!clip)return null;return<VideoCard key={clip.id} item={clip} onClick={()=>{setSelected(clip);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(clip.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(clip.id)?prev.filter(x=>x!==clip.id):[...prev,clip.id])}/>})}</div>
            </div>}
          </div>}
        </div>
      })}
      <div style={{borderTop:"1px solid "+C.border,paddingTop:20,marginTop:8}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:16}}>📋 All Content</div></div>
    </div>}
    {filtered.length===0?<div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}><div style={{fontSize:44,marginBottom:14}}>🎬</div><div style={{fontSize:17,fontWeight:600,color:C.text,marginBottom:6}}>{items.length===0?"Your Stash is empty":"No results"}</div><div style={{fontSize:13,color:C.muted,marginBottom:20}}>{items.length===0?"Upload your first video to get started.":"Try adjusting your search or filters."}</div>{items.length===0&&<Btn onClick={()=>setView("add")} style={{background:C.accent,color:"#fff"}}>+ Add First Content</Btn>}{activeFilterCount>0&&<Btn onClick={clearFilters} style={{background:C.surface,color:C.muted,border:"1px solid "+C.border}}>Clear Filters</Btn>}</div>
    :<><div style={{fontSize:12,color:C.muted,marginBottom:12,display:hasActiveFilters?"block":"none"}}>Showing {filtered.length} result{filtered.length!==1?"s":""}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14}}>{filtered.map(item=><div key={item.id} draggable onDragStart={e=>{e.dataTransfer.setData('text/x-adforge-item',item.id);e.dataTransfer.effectAllowed='move'}}><VideoCard item={item} onClick={()=>{setSelected(item);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(item.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(item.id)?prev.filter(x=>x!==item.id):[...prev,item.id])}/>{item.mux_status&&item.mux_status!=="ready"&&<UploadPipeline item={item} compact/>}</div>)}</div></>}
    </div>
  </div>
}
