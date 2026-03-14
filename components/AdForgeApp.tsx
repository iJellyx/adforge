'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import MuxPlayer from "@mux/mux-player-react"
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────
type Item = {
  id: string; type: string; parent_id?: string; title: string
  creator?: string; creator_age?: string; creator_gender?: string
  description?: string; transcript?: string
  mux_playback_id?: string; mux_status?: string
  duration_seconds?: number; start_seconds?: number; end_seconds?: number
  thumbnail_time?: number; analysis?: any; clip_ids?: string[]
  created_at?: string
}
type Script = { id: string; product_name?: string; metadata?: any; sections?: any[]; created_at?: string }
type BrandProfile = { id?: string; name: string; website: string; description: string; voice: string; target_customer: string; reviews: string; additional_info: string; customer_avatars: any[] }
type Product = { id?: string; name: string; description: string; benefits: string; target_customer: string; claims: string; ingredients: string; differentiators: string; reviews: string; notes: string; price: string; url: string }

// ── Constants ─────────────────────────────────────────────────────────────
const C = { bg:"#0a0a0f",surface:"#13131a",card:"#1a1a24",border:"#2a2a3a",accent:"#6c63ff",accentSoft:"#6c63ff22",text:"#f0f0f5",muted:"#7a7a9a",green:"#22c55e",yellow:"#f59e0b",red:"#ef4444" }
const GENDERS = ["Male","Female","Non-binary","Other"]
const AGE_RANGES = ["Under 18","18-24","25-34","35-44","45+"]
const SEC_TYPES = ["HOOK","PROBLEM","AGITATE","SOLUTION","SOCIAL PROOF","BODY","CTA"]
const STAGES = [
  {value:"unaware",label:"Unaware",desc:"Don't know they have a problem"},
  {value:"problem_aware",label:"Problem Aware",desc:"Know the problem, not the solution"},
  {value:"solution_aware",label:"Solution Aware",desc:"Know solutions exist, not your product"},
  {value:"product_aware",label:"Product Aware",desc:"Know your product, haven't bought"},
  {value:"most_aware",label:"Most Aware",desc:"Need a reason to buy now"},
]
const STAGE_COLORS: Record<string,string> = { unaware:"#7c3aed",problem_aware:"#ef4444",solution_aware:"#f59e0b",product_aware:"#3b82f6",most_aware:"#22c55e" }
const AD_LENGTHS = ["15 seconds","30 seconds","45 seconds","60 seconds","90 seconds"]
const FORM_CTYPES = ["UGC","Talking Head","Founder Story","Mashup","Testimonial","Problem/Solution","Tutorial","Before & After"]
const SORTS = ["Newest first","Oldest first","A → Z","Z → A"]
const DEFAULT_BRAND: BrandProfile = { name:"",website:"",description:"",voice:"",target_customer:"",reviews:"",additional_info:"",customer_avatars:[] }
const DEFAULT_PRODUCT: Product = { name:"",description:"",benefits:"",target_customer:"",claims:"",ingredients:"",differentiators:"",reviews:"",notes:"",price:"",url:"" }
const CONTENT_CATEGORIES = ["UGC","Testimonial","Product Demo","Tutorial","Founder Clip","Behind the Scenes","High Production","Talking Head","Other"]
const DURATION_RANGES = ["Under 5s","5–15s","15–30s","30–60s","Over 60s"]
const AD_POTENTIALS = ["High","Medium","Low"]

// ── Helpers ───────────────────────────────────────────────────────────────
function muxThumb(playbackId: string, time = 0) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=400`
}
function fmt(s?: number) {
  if (!s && s !== 0) return "0:00"
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,"0")}`
}
function typeColor(t?: string) {
  const m: Record<string,any> = {
    "UGC":{bg:"#7c3aed22",color:"#a78bfa"},
    "Founder Clip":{bg:"#0891b222",color:"#38bdf8"},
    "Tutorial":{bg:"#15803d22",color:"#4ade80"},
    "Behind the Scenes":{bg:"#92400e22",color:"#fbbf24"},
    "High Production":{bg:"#be185d22",color:"#f472b6"},
    "Testimonial":{bg:"#0369a122",color:"#7dd3fc"},
    "Product Demo":{bg:"#065f4622",color:"#34d399"},
    "Clip":{bg:"#92400e22",color:"#fb923c"},
    "Talking Head":{bg:"#7c3aed22",color:"#c4b5fd"},
  }
  return m[t||""] || {bg:"#6c63ff22",color:"#a5b4fc"}
}
function secColor(t?: string) {
  const m: Record<string,any> = {
    "HOOK":{bg:"#ef444418",color:"#f87171",bd:"#ef444430"},
    "PROBLEM":{bg:"#f59e0b18",color:"#fbbf24",bd:"#f59e0b30"},
    "AGITATE":{bg:"#f9731618",color:"#fb923c",bd:"#f9731630"},
    "SOLUTION":{bg:"#22c55e18",color:"#4ade80",bd:"#22c55e30"},
    "SOCIAL PROOF":{bg:"#3b82f618",color:"#60a5fa",bd:"#3b82f630"},
    "CTA":{bg:"#6c63ff18",color:"#a5b4fc",bd:"#6c63ff30"},
    "BODY":{bg:"#92400e18",color:"#fbbf24",bd:"#92400e30"},
  }
  return m[t||""] || {bg:"#ffffff0e",color:C.muted,bd:"#ffffff18"}
}
function getDurationRange(secs?: number): string {
  if (!secs) return ""
  if (secs < 5) return "Under 5s"
  if (secs < 15) return "5–15s"
  if (secs < 30) return "15–30s"
  if (secs < 60) return "30–60s"
  return "Over 60s"
}
async function callClaude(messages: any[], maxTokens = 1500) {
  const res = await fetch('/api/claude', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({messages,maxTokens}) })
  const d = await res.json()
  return d.text || ""
}

// ── UI Primitives ─────────────────────────────────────────────────────────
function Btn({ onClick, disabled, style, children }: any) {
  return <button onClick={onClick} disabled={disabled} style={{ border:"none",borderRadius:9,padding:"9px 18px",fontWeight:600,fontSize:13,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,...style }}>{children}</button>
}
function Label({ children }: any) {
  return <div style={{ fontSize:12,fontWeight:600,color:C.muted,marginBottom:5 }}>{children}</div>
}
function Card({ children, style, pad }: any) {
  return <div style={{ background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:pad||20,...style }}>{children}</div>
}
function STitle({ children, size, mb }: any) {
  return <div style={{ fontWeight:700,fontSize:size||17,marginBottom:mb!=null?mb:16,color:C.text }}>{children}</div>
}
function Chip({ label, color }: any) {
  const cl = color || typeColor(label)
  return <span style={{ background:cl.bg,color:cl.color,padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid #fff1",whiteSpace:"nowrap" }}>{label}</span>
}
function Input({ value, onChange, placeholder, type, textarea, rows, onKeyDown, style }: any) {
  const s = { background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box" as const,fontFamily:"inherit",...style }
  if (textarea) return <textarea value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} rows={rows||3} style={{...s,resize:"vertical" as const}}/>
  return <input value={value} onChange={onChange} placeholder={placeholder} type={type||"text"} style={s}/>
}

// ── MultiSelect Filter ────────────────────────────────────────────────────
function MultiSelect({ label, options, selected, onChange }: any) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sel: string[] = selected || []

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        background:sel.length>0?C.accentSoft:C.surface,
        border:"1px solid "+(sel.length>0?C.accent:C.border),
        borderRadius:8,padding:"6px 11px",
        color:sel.length>0?C.accent:C.muted,
        fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6,
        whiteSpace:"nowrap",fontWeight:sel.length>0?600:400
      }}>
        {label}
        {sel.length>0 && <span style={{ background:C.accent,color:"#fff",borderRadius:99,fontSize:9,padding:"1px 5px",fontWeight:700 }}>{sel.length}</span>}
        <span style={{ fontSize:8,opacity:0.5 }}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:6,zIndex:200,minWidth:170,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px #0008" }}>
          {options.map((opt: string) => {
            const active = sel.includes(opt)
            return (
              <div key={opt} onClick={() => onChange(active ? sel.filter(x=>x!==opt) : [...sel,opt])}
                style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 9px",borderRadius:7,cursor:"pointer",background:active?C.accentSoft:"transparent",color:active?C.accent:C.text,fontSize:13 }}>
                <div style={{ width:14,height:14,borderRadius:3,border:"2px solid "+(active?C.accent:C.border),background:active?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  {active && <span style={{ color:"#fff",fontSize:8,fontWeight:900 }}>✓</span>}
                </div>
                {opt}
              </div>
            )
          })}
          {sel.length>0 && (
            <div onClick={() => onChange([])} style={{ borderTop:"1px solid "+C.border,marginTop:4,padding:"6px 9px",textAlign:"center",fontSize:11,color:C.muted,cursor:"pointer" }}>
              Clear
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── VideoCard ─────────────────────────────────────────────────────────────
function VideoCard({ item, onClick, selectMode, isSelected, onToggleSelect, compact, highlight }: any) {
  const [hover, setHover] = useState(false)
  const chipLabel = item.type === "clip" ? (item.analysis?.use_case || "Clip") : (item.analysis?.content_type || "Untagged")
  const tc = item.type === "clip" ? typeColor("Clip") : typeColor(item.analysis?.content_type)
  const thumbTime = item.thumbnail_time ?? item.start_seconds ?? 0

  function handleClick(e: any) {
    if (selectMode) { e.stopPropagation(); onToggleSelect() }
    else onClick()
  }

  return (
    <div onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseOver={e => (e.currentTarget as any).style.borderColor = highlight ? C.green : C.accent}
      onMouseOut={e => (e.currentTarget as any).style.borderColor = isSelected ? C.accent : highlight ? C.green : C.border}
      style={{ background:C.card,border:"2px solid "+(isSelected?C.accent:highlight?C.green:C.border),borderRadius:compact?8:12,overflow:"hidden",cursor:"pointer",display:"flex",flexDirection:"column",position:"relative",transition:"border-color 0.15s" }}>
      {selectMode && (
        <div style={{ position:"absolute",top:6,right:6,zIndex:10,width:20,height:20,borderRadius:5,background:isSelected?C.accent:"#000a",border:"2px solid "+(isSelected?"#fff":"#fff5"),display:"flex",alignItems:"center",justifyContent:"center" }}>
          {isSelected && <span style={{ color:"#fff",fontSize:11,fontWeight:800 }}>✓</span>}
        </div>
      )}
      {highlight && <div style={{ position:"absolute",top:6,left:6,zIndex:10,background:C.green,color:"#000",fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4 }}>AUTO</div>}
      <div style={{ position:"relative",width:"100%",paddingTop:"177.78%",background:"#111",overflow:"hidden",flexShrink:0 }}>
        {item.mux_playback_id ? (
          <img
            src={muxThumb(item.mux_playback_id, thumbTime)}
            alt={item.title}
            style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block" }}
          />
        ) : (
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4 }}>
            <div style={{ fontSize:compact?18:28 }}>{item.mux_status==="pending"||item.mux_status==="analysing" ? "⏳" : "🎬"}</div>
            {!compact && <div style={{ fontSize:9,color:C.muted,textAlign:"center" }}>{item.mux_status==="analysing"?"Analysing…":item.mux_status==="pending"?"Processing…":"No preview"}</div>}
          </div>
        )}
        {item.type==="clip" && <div style={{ position:"absolute",top:compact?4:8,left:compact?4:8,background:"#f59e0bee",color:"#000",fontSize:compact?7:9,fontWeight:800,padding:"1px 5px",borderRadius:4 }}>✂️</div>}
        {item.duration_seconds && <div style={{ position:"absolute",bottom:compact?4:8,right:compact?4:8,background:"#000c",color:"#fff",fontSize:compact?8:10,fontWeight:700,padding:"1px 5px",borderRadius:4 }}>{fmt(item.duration_seconds)}</div>}
      </div>
      <div style={{ padding:compact?6:12,flex:1,display:"flex",flexDirection:"column",gap:3 }}>
        <Chip label={chipLabel} color={tc}/>
        <div style={{ fontWeight:700,fontSize:compact?10:13,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any }}>{item.title}</div>
        {item.creator && <div style={{ fontSize:compact?8:10,color:C.muted }}>👤 {item.creator}{item.creator_age?` · ${item.creator_age}`:""}</div>}
        {!compact && (item.analysis?.scene_tags||[]).slice(0,2).map((t:string,i:number) => (
          <span key={i} style={{ background:"#22c55e18",color:"#4ade80",padding:"1px 5px",borderRadius:99,fontSize:8,fontWeight:600 }}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// ── Mux Video Player ──────────────────────────────────────────────────────
function MuxClipPlayer({ item }: any) {
  if (!item?.mux_playback_id) return (
    <div style={{ background:"#111",borderRadius:12,padding:32,textAlign:"center",color:C.muted,marginBottom:16 }}>
      <div style={{ fontSize:32,marginBottom:8 }}>🎬</div>
      <div style={{ fontSize:13 }}>{item?.mux_status==="pending"||item?.mux_status==="analysing" ? "Video is still processing…" : "No video available"}</div>
    </div>
  )
  return (
    <div style={{ borderRadius:12,overflow:"hidden",marginBottom:16,background:"#000" }}>
      <MuxPlayer
        playbackId={item.mux_playback_id}
        startTime={item.start_seconds||0}
        streamType="on-demand"
        accentColor={C.accent}
        style={{ width:"100%",aspectRatio:"9/16",maxHeight:500,display:"block" }}
      />
    </div>
  )
}

// ── TagEditor ─────────────────────────────────────────────────────────────
function TagEditor({ tags, onUpdate }: { tags: string[], onUpdate: (t:string[]) => void }) {
  const [newTag, setNewTag] = useState("")
  function addTag() { const t=newTag.trim(); if(!t||tags.includes(t)){setNewTag("");return;} onUpdate([...tags,t]); setNewTag("") }
  return (
    <div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:10,minHeight:26 }}>
        {tags.length===0 && <span style={{ fontSize:12,color:C.muted,fontStyle:"italic" }}>No tags yet</span>}
        {tags.map((t,i) => (
          <span key={i} style={{ background:"#22c55e18",color:"#4ade80",padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5,border:"1px solid #22c55e33" }}>
            {t}<span onClick={() => onUpdate(tags.filter(x=>x!==t))} style={{ cursor:"pointer",fontSize:13,opacity:0.7 }}>×</span>
          </span>
        ))}
      </div>
      <div style={{ display:"flex",gap:8 }}>
        <Input value={newTag} onChange={(e:any) => setNewTag(e.target.value)} onKeyDown={(e:any) => { if(e.key==="Enter"){e.preventDefault();addTag()} }} placeholder="Type tag + Enter"/>
        <Btn onClick={addTag} style={{ background:C.accent,color:"#fff",flexShrink:0,padding:"9px 14px" }}>Add</Btn>
      </div>
    </div>
  )
}

// ── Library Tab ───────────────────────────────────────────────────────────
function LibraryTab({ items, onRefresh, view, setView }: { items: Item[], onRefresh: () => void, view: string, setView: (v:string) => void }) {
  const supabase = createClient()
  const [selected, setSelected] = useState<Item|null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("All")
  const [sortIdx, setSortIdx] = useState(0)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [categoryOpen, setCategoryOpen] = useState<Record<string,boolean>>({})

  // Filter states
  const [filterCtypes, setFilterCtypes] = useState<string[]>([])
  const [filterCreators, setFilterCreators] = useState<string[]>([])
  const [filterAges, setFilterAges] = useState<string[]>([])
  const [filterGenders, setFilterGenders] = useState<string[]>([])
  const [filterAdPotential, setFilterAdPotential] = useState<string[]>([])
  const [filterDuration, setFilterDuration] = useState<string[]>([])

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadMsg, setUploadMsg] = useState("")
  const [uploadForm, setUploadForm] = useState({ title:"",creator:"",creatorAge:"",creatorGender:"",description:"",transcript:"" })
  const [uploadFile, setUploadFile] = useState<File|null>(null)
  const [dragOver, setDragOver] = useState(false)

  function setUF(k: string, v: string) { setUploadForm(x => ({...x,[k]:v})) }

  const allCreators = [...new Set(items.map(i=>i.creator).filter(Boolean))] as string[]
  const activeFilterCount = filterCtypes.length+filterCreators.length+filterAges.length+filterGenders.length+filterAdPotential.length+filterDuration.length

  function clearFilters() {
    setFilterCtypes([]); setFilterCreators([]); setFilterAges([])
    setFilterGenders([]); setFilterAdPotential([]); setFilterDuration([])
  }

  function handleFile(file: File|null) {
    if (!file || !file.type.startsWith("video/")) return
    setUploadFile(file)
    const name = file.name.replace(/\.[^/.]+$/,"").replace(/[_-]+/g," ")
    if (!uploadForm.title) setUF("title", name)
  }

  async function handleUpload() {
    if (!uploadFile || !uploadForm.title.trim()) return
    setUploading(true); setUploadProgress(5); setUploadMsg("Creating record…")
    try {
      const res = await fetch("/api/upload", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ filename: uploadFile.name, contentType: uploadFile.type, metadata: uploadForm })
      })
      const { itemId, uploadUrl, error } = await res.json()
      if (error) throw new Error(error)

      setUploadProgress(10); setUploadMsg("Uploading video…")
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadProgress(10 + Math.round((e.loaded/e.total)*70)) }
        xhr.onload = () => resolve()
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.open("PUT", uploadUrl)
        xhr.setRequestHeader("Content-Type", uploadFile.type)
        xhr.send(uploadFile)
      })

      setUploadProgress(85); setUploadMsg("Processing + AI analysis… (1–3 mins)")
      let attempts = 0
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 5000))
        const sr = await fetch(`/api/items/${itemId}/status`)
        const status = await sr.json()
        if (status.mux_status === "ready") { setUploadProgress(100); setUploadMsg("Done! ✓"); break }
        if (status.mux_status === "errored") throw new Error("Video processing failed")
        attempts++
      }
      onRefresh()
      setView("grid")
      setUploadFile(null)
      setUploadForm({ title:"",creator:"",creatorAge:"",creatorGender:"",description:"",transcript:"" })
    } catch(e: any) { alert("Upload failed: " + e.message) }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    const item = items.find(i => i.id === id)
    const idsToDelete = [id, ...(item?.clip_ids || [])]
    await supabase.from("items").delete().in("id", idsToDelete)
    onRefresh(); setSelected(null); setView("grid")
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.length} item(s)? This cannot be undone.`)) return
    setDeleting(true)
    const gone = new Set(selectedIds)
    selectedIds.forEach(id => { const item = items.find(i => i.id === id); (item?.clip_ids||[]).forEach(cid => gone.add(cid)) })
    await supabase.from("items").delete().in("id", Array.from(gone))
    onRefresh(); setSelectMode(false); setSelectedIds([]); setDeleting(false)
  }

  async function updateTags(id: string, tags: string[]) {
    const item = items.find(i => i.id === id)
    const newAnalysis = { ...(item?.analysis||{}), scene_tags: tags }
    await supabase.from("items").update({ analysis: newAnalysis }).eq("id", id)
    onRefresh()
    if (selected?.id === id) setSelected({ ...selected, analysis: newAnalysis })
  }

  function sortItems(arr: Item[]) {
    const c = [...arr]
    if (sortIdx===0) return c.sort((a,b) => new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())
    if (sortIdx===1) return c.sort((a,b) => new Date(a.created_at||0).getTime()-new Date(b.created_at||0).getTime())
    if (sortIdx===2) return c.sort((a,b) => a.title.localeCompare(b.title))
    return c.sort((a,b) => b.title.localeCompare(a.title))
  }

  const filtered = sortItems(items.filter(item => {
    if (filter==="Originals" && item.type!=="original") return false
    if (filter==="Clips" && item.type!=="clip") return false
    if (filterCtypes.length>0) {
      const ct = item.analysis?.content_type
      const isClip = item.type==="clip"
      if (!filterCtypes.some(f => f===ct || (f==="Clip"&&isClip))) return false
    }
    if (filterCreators.length>0 && !filterCreators.includes(item.creator||"")) return false
    if (filterAges.length>0 && !filterAges.includes(item.creator_age||"")) return false
    if (filterGenders.length>0 && !filterGenders.includes(item.creator_gender||"")) return false
    if (filterAdPotential.length>0 && !filterAdPotential.includes(item.analysis?.ad_potential||"")) return false
    if (filterDuration.length>0 && !filterDuration.includes(getDurationRange(item.duration_seconds))) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const a = item.analysis||{}
    return [item.title,item.creator,a.summary,a.tone,...(a.scene_tags||[]),...(a.topics||[])].some(f => f&&String(f).toLowerCase().includes(q))
  }))

  // ── Add view ──
  if (view === "add") return (
    <div style={{ maxWidth:660,margin:"0 auto",padding:28 }}>
      <button onClick={() => setView("grid")} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14 }}>← Back to Library</button>
      <STitle size={22}>Add New Content</STitle>
      <div style={{ color:C.muted,fontSize:14,marginBottom:20 }}>Upload a video — Claude will analyse, tag, and create clips automatically.</div>

      <div
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => { if (!uploadFile) fileRef.current?.click() }}
        style={{ border:"2px dashed "+(dragOver?C.accent:C.border),borderRadius:14,padding:"28px 20px",textAlign:"center",cursor:uploadFile?"default":"pointer",background:dragOver?C.accentSoft:C.surface,marginBottom:20,transition:"all 0.2s" }}>
        <input ref={fileRef} type="file" accept="video/*" style={{ display:"none" }} onChange={e => { handleFile(e.target.files?.[0]||null); e.target.value="" }}/>
        {uploadFile ? (
          <div>
            <div style={{ fontSize:32,marginBottom:8 }}>🎬</div>
            <div style={{ fontWeight:600,color:C.green,marginBottom:4 }}>✓ {uploadFile.name}</div>
            <div style={{ fontSize:12,color:C.muted,marginBottom:8 }}>{(uploadFile.size/1024/1024).toFixed(1)} MB</div>
            <button onClick={e => { e.stopPropagation(); setUploadFile(null) }} style={{ background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"3px 11px",cursor:"pointer",fontSize:12 }}>Remove</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize:34,marginBottom:8 }}>🎬</div>
            <div style={{ fontWeight:600,marginBottom:4 }}>Drop video or click to upload</div>
            <div style={{ fontSize:12,color:C.muted }}>MP4, MOV, WebM supported</div>
          </div>
        )}
      </div>

      <div style={{ marginBottom:14 }}><Label>Title *</Label><Input value={uploadForm.title} onChange={(e:any) => setUF("title",e.target.value)} placeholder="e.g. Sarah UGC Serum Review"/></div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14 }}>
        <div><Label>Creator</Label><Input value={uploadForm.creator} onChange={(e:any) => setUF("creator",e.target.value)} placeholder="e.g. Sarah"/></div>
        <div><Label>Age Range</Label>
          <select value={uploadForm.creatorAge} onChange={e => setUF("creatorAge",e.target.value)} style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer" }}>
            <option value="">Unknown</option>{AGE_RANGES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div><Label>Gender</Label>
          <select value={uploadForm.creatorGender} onChange={e => setUF("creatorGender",e.target.value)} style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer" }}>
            <option value="">Unknown</option>{GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:14 }}><Label>Description (optional)</Label><Input textarea value={uploadForm.description} onChange={(e:any) => setUF("description",e.target.value)} placeholder="What's on screen?" rows={2}/></div>
      <div style={{ marginBottom:8 }}><Label>Transcript (optional — greatly improves analysis & clipping)</Label><Input textarea value={uploadForm.transcript} onChange={(e:any) => setUF("transcript",e.target.value)} placeholder="Paste what the creator says…" rows={4}/></div>
      <div style={{ background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"8px 12px",fontSize:11,color:C.accent,marginBottom:20 }}>💡 Adding a transcript significantly improves AI tagging and clip quality</div>

      {uploading && (
        <div style={{ marginBottom:16 }}>
          <div style={{ height:6,background:C.border,borderRadius:4,marginBottom:8,overflow:"hidden" }}>
            <div style={{ height:"100%",width:uploadProgress+"%",background:C.accent,borderRadius:4,transition:"width 0.3s" }}/>
          </div>
          <div style={{ fontSize:12,color:C.muted }}>{uploadMsg}</div>
        </div>
      )}

      <Btn onClick={handleUpload} disabled={uploading||!uploadFile||!uploadForm.title.trim()} style={{ background:uploading||!uploadFile||!uploadForm.title.trim()?C.border:C.accent,color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12 }}>
        {uploading ? `⏳ ${uploadMsg}` : "✨ Upload & Analyse"}
      </Btn>
    </div>
  )

  // ── Detail view ──
  if (view === "detail" && selected) {
    const a = selected.analysis || {}
    const clips = selected.type==="original" && selected.clip_ids ? items.filter(i => selected.clip_ids!.includes(i.id)) : []
    const adPotColor = a.ad_potential==="High"?C.green:a.ad_potential==="Medium"?C.yellow:C.red
    return (
      <div style={{ maxWidth:860,margin:"0 auto",padding:28 }}>
        <button onClick={() => { setSelected(null); setView("grid") }} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14,display:"flex",alignItems:"center",gap:6 }}>← Back to Library</button>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,gap:16 }}>
          <div>
            <Chip label={selected.type==="clip"?"CLIP":(a.content_type||"Untagged")} color={selected.type==="clip"?typeColor("Clip"):undefined}/>
            <div style={{ fontWeight:800,fontSize:22,marginTop:8,marginBottom:4 }}>{selected.title}</div>
            <div style={{ color:C.muted,fontSize:13,display:"flex",gap:12,flexWrap:"wrap" }}>
              {selected.duration_seconds && <span>⏱ {fmt(selected.duration_seconds)}</span>}
              {selected.creator && <span>👤 {selected.creator}{selected.creator_age?` · ${selected.creator_age}`:""}{selected.creator_gender?` · ${selected.creator_gender}`:""}</span>}
              {selected.created_at && <span>Added {new Date(selected.created_at).toLocaleDateString()}</span>}
            </div>
          </div>
          <Btn onClick={() => handleDelete(selected.id)} style={{ background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",flexShrink:0 }}>Delete</Btn>
        </div>

        <MuxClipPlayer item={selected}/>

        {a.summary && <Card style={{ marginBottom:12 }}><Label>Summary</Label><p style={{ margin:0,lineHeight:1.7,fontSize:14 }}>{a.summary}</p></Card>}
        {a.missing_info && <div style={{ background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#fbbf24" }}>💡 <strong>Improve tagging:</strong> {a.missing_info}</div>}

        {selected.type!=="clip" && (
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12 }}>
            {[{l:"Tone",v:a.tone},{l:"Ad Potential",v:a.ad_potential,c:adPotColor},{l:"Confidence",v:a.confidence}].map(s => (
              <Card key={s.l} style={{ textAlign:"center",padding:14 }}>
                <div style={{ fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:4 }}>{s.l}</div>
                <div style={{ fontWeight:700,fontSize:14,color:(s as any).c||C.text }}>{s.v||"—"}</div>
              </Card>
            ))}
          </div>
        )}

        <Card style={{ marginBottom:12 }}>
          <div style={{ fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:12 }}>Scene Tags</div>
          <TagEditor tags={a.scene_tags||[]} onUpdate={t => updateTags(selected.id, t)}/>
        </Card>

        {a.key_quotes?.length > 0 && <Card style={{ marginBottom:12 }}><Label>Key Quotes</Label>{a.key_quotes.map((q:string,i:number) => <div key={i} style={{ borderLeft:"3px solid "+C.accent,paddingLeft:12,marginBottom:8,fontSize:14,fontStyle:"italic" }}>"{q}"</div>)}</Card>}
        {a.ad_notes && <Card style={{ background:adPotColor+"18",border:"1px solid "+adPotColor+"44",marginBottom:12 }}><div style={{ fontWeight:700,fontSize:11,color:adPotColor,marginBottom:6 }}>📢 AD USAGE</div><div style={{ fontSize:14,lineHeight:1.6 }}>{a.ad_notes}</div></Card>}

        {clips.length > 0 && (
          <div style={{ marginTop:24 }}>
            <STitle>✂️ Auto-Generated Clips ({clips.length})</STitle>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12 }}>
              {clips.map(c => <VideoCard key={c.id} item={c} onClick={() => setSelected(c)} selectMode={false} isSelected={false} onToggleSelect={() => {}}/>)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Grid view ──

  // Group originals by content type for category sections
  const originals = items.filter(i => i.type==="original")
  const categoryGroups: Record<string,Item[]> = {}
  CONTENT_CATEGORIES.forEach(cat => {
    const group = originals.filter(i => i.analysis?.content_type===cat)
    if (group.length > 0) categoryGroups[cat] = group
  })
  const uncategorised = originals.filter(i => !i.analysis?.content_type || !CONTENT_CATEGORIES.includes(i.analysis.content_type))
  if (uncategorised.length > 0) categoryGroups["Uncategorised"] = uncategorised

  const hasActiveFilters = activeFilterCount > 0 || search.trim() || filter !== "All"

  return (
    <div style={{ padding:20 }}>
      {/* Search + sort + actions row */}
      <div style={{ display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center" }}>
        <input placeholder="Search titles, creators, tags…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:1,minWidth:180,background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none" }}/>
        <select value={sortIdx} onChange={e => setSortIdx(Number(e.target.value))}
          style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:13,outline:"none",cursor:"pointer" }}>
          {SORTS.map((s,i) => <option key={i} value={i}>{s}</option>)}
        </select>
        {!selectMode && <Btn onClick={() => setSelectMode(true)} style={{ background:"none",border:"1px solid "+C.border,color:C.muted,padding:"9px 14px" }}>Select</Btn>}
        {selectMode && (
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            <Btn onClick={() => setSelectedIds(filtered.map(i=>i.id))} style={{ background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",padding:"9px 14px" }}>
              Select All ({filtered.length})
            </Btn>
            <Btn onClick={bulkDelete} disabled={selectedIds.length===0||deleting}
              style={{ background:selectedIds.length>0?"#ef444433":C.border,color:selectedIds.length>0?"#ef4444":C.muted,border:"1px solid "+(selectedIds.length>0?"#ef444466":C.border) }}>
              Delete ({selectedIds.length})
            </Btn>
            <Btn onClick={() => { setSelectMode(false); setSelectedIds([]) }} style={{ background:"none",border:"1px solid "+C.border,color:C.muted }}>Cancel</Btn>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center" }}>
        <div style={{ display:"flex",gap:5 }}>
          {["All","Originals","Clips"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background:filter===f?C.accent:C.surface,color:filter===f?"#fff":C.muted,border:"1px solid "+(filter===f?C.accent:C.border),borderRadius:99,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer" }}>{f}</button>
          ))}
        </div>
        <div style={{ width:1,height:20,background:C.border,flexShrink:0 }}/>
        <MultiSelect label="Content Type" options={CONTENT_CATEGORIES} selected={filterCtypes} onChange={setFilterCtypes}/>
        {allCreators.length>0 && <MultiSelect label="Creator" options={allCreators} selected={filterCreators} onChange={setFilterCreators}/>}
        <MultiSelect label="Age" options={AGE_RANGES} selected={filterAges} onChange={setFilterAges}/>
        <MultiSelect label="Gender" options={GENDERS} selected={filterGenders} onChange={setFilterGenders}/>
        <MultiSelect label="Ad Potential" options={AD_POTENTIALS} selected={filterAdPotential} onChange={setFilterAdPotential}/>
        <MultiSelect label="Duration" options={DURATION_RANGES} selected={filterDuration} onChange={setFilterDuration}/>
        {activeFilterCount>0 && (
          <button onClick={clearFilters} style={{ background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",textDecoration:"underline" }}>
            Clear all filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Category sections — only show when not filtering */}
      {!hasActiveFilters && Object.keys(categoryGroups).length > 0 && (
        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:16 }}>📂 Browse by Category</div>
          {Object.entries(categoryGroups).map(([cat, catItems]) => {
            const isOpen = categoryOpen[cat] !== false // default open
            const tc = typeColor(cat)
            return (
              <div key={cat} style={{ marginBottom:12,border:"1px solid "+C.border,borderRadius:12,overflow:"hidden" }}>
                <div
                  onClick={() => setCategoryOpen(x => ({...x,[cat]:!isOpen}))}
                  style={{ background:C.card,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}
                >
                  <span style={{ background:tc.bg,color:tc.color,padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700,border:"1px solid #fff1" }}>{cat}</span>
                  <span style={{ fontSize:13,color:C.muted }}>{catItems.length} video{catItems.length!==1?"s":""}</span>
                  <span style={{ marginLeft:"auto",fontSize:11,color:C.muted }}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen && (
                  <div style={{ padding:14,background:C.bg }}>
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12 }}>
                      {catItems.map(item => (
                        <VideoCard key={item.id} item={item}
                          onClick={() => { setSelected(item); setView("detail") }}
                          selectMode={selectMode}
                          isSelected={selectedIds.includes(item.id)}
                          onToggleSelect={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(x=>x!==item.id) : [...prev,item.id])}/>
                      ))}
                    </div>
                    {/* Nested clips for this category */}
                    {catItems.some(i => i.clip_ids?.length) && (
                      <div style={{ marginTop:16,borderTop:"1px solid "+C.border,paddingTop:14 }}>
                        <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>✂️ Clips from {cat}</div>
                        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10 }}>
                          {catItems.flatMap(i => i.clip_ids||[]).map(clipId => {
                            const clip = items.find(i=>i.id===clipId)
                            if (!clip) return null
                            return <VideoCard key={clip.id} item={clip}
                              onClick={() => { setSelected(clip); setView("detail") }}
                              selectMode={selectMode}
                              isSelected={selectedIds.includes(clip.id)}
                              onToggleSelect={() => setSelectedIds(prev => prev.includes(clip.id) ? prev.filter(x=>x!==clip.id) : [...prev,clip.id])}/>
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ borderTop:"1px solid "+C.border,paddingTop:20,marginTop:8 }}>
            <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:16 }}>📋 All Content</div>
          </div>
        </div>
      )}

      {/* Main grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:"center",padding:"60px 20px",color:C.muted }}>
          <div style={{ fontSize:44,marginBottom:14 }}>🎬</div>
          <div style={{ fontSize:17,fontWeight:600,color:C.text,marginBottom:6 }}>{items.length===0?"Your library is empty":"No results"}</div>
          <div style={{ fontSize:13,color:C.muted,marginBottom:20 }}>{items.length===0?"Upload your first video to get started.":"Try adjusting your search or filters."}</div>
          {items.length===0 && <Btn onClick={() => setView("add")} style={{ background:C.accent,color:"#fff" }}>+ Add First Content</Btn>}
          {activeFilterCount>0 && <Btn onClick={clearFilters} style={{ background:C.surface,color:C.muted,border:"1px solid "+C.border }}>Clear Filters</Btn>}
        </div>
      ) : (
        <>
          {hasActiveFilters && (
            <div style={{ fontSize:12,color:C.muted,marginBottom:12 }}>
              Showing {filtered.length} result{filtered.length!==1?"s":""}
              {selectMode && filtered.length>0 && <button onClick={() => setSelectedIds(filtered.map(i=>i.id))} style={{ background:"none",border:"none",color:C.accent,fontSize:12,cursor:"pointer",marginLeft:8,textDecoration:"underline" }}>Select all {filtered.length}</button>}
            </div>
          )}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14 }}>
            {filtered.map(item => (
              <VideoCard key={item.id} item={item}
                onClick={() => { setSelected(item); setView("detail") }}
                selectMode={selectMode}
                isSelected={selectedIds.includes(item.id)}
                onToggleSelect={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(x=>x!==item.id) : [...prev,item.id])}/>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Script Table ──────────────────────────────────────────────────────────
function ScriptTable({ sections, onChange, libraryItems, readOnly, brandName, productName }: any) {
  const [pickerIdx, setPickerIdx] = useState<number|null>(null)
  const [fillingIdx, setFillingIdx] = useState<number|null>(null)
  function upd(idx: number, key: string, val: any) { onChange(sections.map((s:any,i:number) => i===idx?{...s,[key]:val}:s)) }
  function updM(idx: number, obj: any) { onChange(sections.map((s:any,i:number) => i===idx?{...s,...obj}:s)) }
  function addRow() { onChange([...sections,{id:Date.now(),type:"BODY",spokenWords:"",visualDirection:"",matchedClipIds:[],selectedClipId:null,autoSelected:false}]) }
  function removeRow(idx: number) { onChange(sections.filter((_:any,i:number) => i!==idx)) }
  function move(idx: number, dir: number) { const a=[...sections],t=idx+dir; if(t<0||t>=a.length)return; [a[idx],a[t]]=[a[t],a[idx]]; onChange(a) }
  async function autofillRow(idx: number) {
    const row = sections[idx]; setFillingIdx(idx)
    try {
      const ctx = sections.map((s:any,i:number) => `[${i===idx?"→ THIS":"  "}] ${s.type}: ${(s.spokenWords||"(empty)").substring(0,60)}`).join("\n")
      const prompt = `Write a ${row.type} section for a direct response video ad.\nBrand: ${brandName||"Unknown"}\nProduct: ${productName||"Unknown"}\n\nScript context:\n${ctx}\n\nReturn ONLY JSON: {"spokenWords":"exact words","visualDirection":"what is on screen"}`
      const raw = await callClaude([{role:"user",content:prompt}],400)
      const data = JSON.parse(raw.replace(/```json|```/g,"").trim())
      updM(idx,{spokenWords:data.spokenWords||row.spokenWords,visualDirection:data.visualDirection||row.visualDirection})
    } catch(e) { console.error(e) }
    setFillingIdx(null)
  }
  return (
    <div>
      {pickerIdx!==null && (
        <ClipPickerModal
          currentId={sections[pickerIdx]?.selectedClipId}
          matchedIds={sections[pickerIdx]?.matchedClipIds||[]}
          libraryItems={libraryItems}
          sectionLabel={sections[pickerIdx]?.type||""}
          onSelect={(id: string) => updM(pickerIdx,{selectedClipId:id,autoSelected:false})}
          onClose={() => setPickerIdx(null)}/>
      )}
      <table style={{ width:"100%",borderCollapse:"collapse",tableLayout:"fixed" }}>
        <thead><tr style={{ background:C.surface,borderBottom:"2px solid "+C.border }}>
          <th style={{ width:"11%",padding:"10px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1 }}>Section</th>
          <th style={{ width:"33%",padding:"10px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1 }}>🎤 Spoken Words</th>
          <th style={{ width:"28%",padding:"10px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1 }}>🎬 Visual Direction</th>
          <th style={{ width:"24%",padding:"10px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1 }}>📎 Clip</th>
          {!readOnly && <th style={{ width:"4%" }}/>}
        </tr></thead>
        <tbody>
          {sections.map((row:any, idx:number) => {
            const sc = secColor(row.type)
            const selectedClip = row.selectedClipId ? libraryItems.find((i:Item) => i.id===row.selectedClipId) : null
            const isFilling = fillingIdx===idx
            return (
              <tr key={row.id||idx} style={{ borderBottom:"1px solid "+C.border,verticalAlign:"top" }}>
                <td style={{ padding:10,background:C.card }}>
                  {readOnly
                    ? <div style={{ background:sc.bg,color:sc.color,border:"1px solid "+sc.bd,padding:"5px 8px",borderRadius:7,fontSize:10,fontWeight:800,textAlign:"center" }}>{row.type}</div>
                    : <select value={row.type} onChange={e => upd(idx,"type",e.target.value)} style={{ background:sc.bg,color:sc.color,border:"1px solid "+sc.bd,borderRadius:7,padding:"5px 6px",fontSize:10,fontWeight:800,outline:"none",cursor:"pointer",width:"100%" }}>{SEC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>}
                  {row.durationEstimate && <div style={{ fontSize:9,color:C.muted,marginTop:4,textAlign:"center" }}>{row.durationEstimate}</div>}
                  {!readOnly && (
                    <div style={{ display:"flex",gap:3,marginTop:6,justifyContent:"center" }}>
                      <button onClick={() => move(idx,-1)} style={{ background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:10 }}>↑</button>
                      <button onClick={() => move(idx,1)} style={{ background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:10 }}>↓</button>
                      <button onClick={() => autofillRow(idx)} disabled={!!isFilling} style={{ background:isFilling?C.border:C.accentSoft,border:"1px solid "+(isFilling?C.border:C.accent+"44"),color:isFilling?C.muted:C.accent,borderRadius:4,padding:"2px 5px",cursor:isFilling?"not-allowed":"pointer",fontSize:10,fontWeight:700 }}>{isFilling?"⏳":"✨"}</button>
                    </div>
                  )}
                </td>
                <td style={{ padding:12,background:C.bg,borderLeft:"1px solid "+C.border }}>
                  {isFilling ? <div style={{ color:C.muted,fontSize:13,fontStyle:"italic",padding:8 }}>AI writing…</div>
                  : readOnly ? <div style={{ fontSize:14,lineHeight:1.8,whiteSpace:"pre-wrap" }}>{row.spokenWords}</div>
                  : <textarea value={row.spokenWords||""} onChange={e=>upd(idx,"spokenWords",e.target.value)} placeholder="What the creator says on camera..." style={{ width:"100%",background:"transparent",border:"none",resize:"none",color:C.text,fontSize:14,lineHeight:1.8,outline:"none",fontFamily:"inherit",minHeight:100,boxSizing:"border-box" }}/>}
                </td>
                <td style={{ padding:12,background:C.surface,borderLeft:"1px solid "+C.border }}>
                  {isFilling ? <div style={{ color:C.muted,fontSize:13,fontStyle:"italic",padding:8 }}>AI writing…</div>
                  : readOnly ? <div style={{ fontSize:13,lineHeight:1.65,color:C.muted,whiteSpace:"pre-wrap" }}>{row.visualDirection}</div>
                  : <textarea value={row.visualDirection||""} onChange={e=>upd(idx,"visualDirection",e.target.value)} placeholder="What's on screen..." style={{ width:"100%",background:"transparent",border:"none",resize:"none",color:C.muted,fontSize:13,lineHeight:1.65,outline:"none",fontFamily:"inherit",minHeight:100,boxSizing:"border-box" }}/>}
                </td>
                <td style={{ padding:10,background:C.card,borderLeft:"1px solid "+C.border,verticalAlign:"top" }}>
                  {selectedClip ? (
                    <div>
                      {row.autoSelected && <div style={{ background:"#22c55e15",border:"1px solid #22c55e33",borderRadius:6,padding:"3px 8px",fontSize:9,color:C.green,fontWeight:700,marginBottom:6 }}>✦ AI Pick</div>}
                      {selectedClip.mux_playback_id
                        ? <img src={muxThumb(selectedClip.mux_playback_id, selectedClip.thumbnail_time||selectedClip.start_seconds||0)} alt="" style={{ width:"100%",aspectRatio:"9/16",objectFit:"cover",borderRadius:8,marginBottom:6,display:"block" }}/>
                        : <div style={{ width:"100%",paddingTop:"56%",background:"#111",borderRadius:8,position:"relative",marginBottom:6 }}><div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>🎬</div></div>}
                      <div style={{ fontSize:10,color:C.text,fontWeight:600,lineHeight:1.3,marginBottom:6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any }}>{selectedClip.title}</div>
                      {!readOnly && <button onClick={() => setPickerIdx(idx)} style={{ width:"100%",background:C.accentSoft,border:"1px solid "+C.accent+"44",color:C.accent,borderRadius:7,padding:"6px",cursor:"pointer",fontSize:11,fontWeight:600 }}>⇄ Change</button>}
                    </div>
                  ) : (
                    <div style={{ textAlign:"center",padding:"16px 8px" }}>
                      <div style={{ color:C.muted,fontSize:11,marginBottom:8 }}>{(row.matchedClipIds||[]).length>0?"Clips matched":"No clip"}</div>
                      {!readOnly && <button onClick={() => setPickerIdx(idx)} style={{ background:(row.matchedClipIds||[]).length>0?C.yellow+"22":C.surface,border:"1px solid "+((row.matchedClipIds||[]).length>0?C.yellow+"44":C.border),color:(row.matchedClipIds||[]).length>0?C.yellow:C.muted,borderRadius:7,padding:"7px 10px",cursor:"pointer",fontSize:11,fontWeight:600,width:"100%" }}>+ Pick Clip</button>}
                    </div>
                  )}
                </td>
                {!readOnly && <td style={{ padding:6,background:C.card,textAlign:"center",verticalAlign:"top",borderLeft:"1px solid "+C.border }}><button onClick={() => removeRow(idx)} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"4px 6px" }}>×</button></td>}
              </tr>
            )
          })}
        </tbody>
      </table>
      {!readOnly && (
        <div style={{ borderTop:"1px solid "+C.border,padding:"8px 16px",background:C.surface,borderRadius:"0 0 12px 12px",display:"flex",alignItems:"center",gap:8 }}>
          <button onClick={addRow} style={{ background:"none",border:"1px dashed "+C.border,color:C.muted,padding:"7px 16px",cursor:"pointer",fontSize:13,borderRadius:8 }}>+ Add Row</button>
          <span style={{ fontSize:11,color:C.muted,fontStyle:"italic" }}>Use ✨ to AI-fill any row</span>
        </div>
      )}
    </div>
  )
}

// ── Clip Picker Modal ─────────────────────────────────────────────────────
function ClipPickerModal({ currentId, matchedIds, libraryItems, sectionLabel, onSelect, onClose }: any) {
  const [search, setSearch] = useState("")
  const matched = libraryItems.filter((i:Item) => matchedIds.includes(i.id))
  const others = libraryItems.filter((i:Item) => !matchedIds.includes(i.id))
  const fl = (arr:Item[]) => !search.trim() ? arr : arr.filter((i:Item) => [i.title,i.creator,...(i.analysis?.scene_tags||[])].some((f:any) => f&&String(f).toLowerCase().includes(search.toLowerCase())))
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"#000000dd",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:16,padding:24,maxWidth:760,width:"100%",marginTop:40 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <div><div style={{ fontWeight:700,fontSize:17 }}>Change Clip</div><div style={{ fontSize:13,color:C.muted }}>for <strong style={{ color:C.text }}>{sectionLabel}</strong></div></div>
          <Btn onClick={onClose} style={{ background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px",fontSize:12 }}>✕ Close</Btn>
        </div>
        <Input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Search…" style={{ marginBottom:20 }}/>
        {fl(matched).length>0 && <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1,marginBottom:12 }}>🎯 AI-Matched ({fl(matched).length})</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10 }}>
            {fl(matched).map((item:Item) => <div key={item.id} style={{ cursor:"pointer" }} onClick={() => { onSelect(item.id); onClose() }}><VideoCard item={item} compact={false} highlight={item.id!==currentId} isSelected={item.id===currentId} onClick={() => {}} selectMode={false} onToggleSelect={() => {}}/></div>)}
          </div>
        </div>}
        {fl(others).length>0 && <div>
          <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:12 }}>All Library ({fl(others).length})</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10 }}>
            {fl(others).map((item:Item) => <div key={item.id} style={{ cursor:"pointer" }} onClick={() => { onSelect(item.id); onClose() }}><VideoCard item={item} compact={false} isSelected={item.id===currentId} onClick={() => {}} selectMode={false} onToggleSelect={() => {}}/></div>)}
          </div>
        </div>}
        {fl(matched).length===0&&fl(others).length===0 && <div style={{ textAlign:"center",padding:40,color:C.muted }}>No clips found.</div>}
      </div>
    </div>
  )
}

// ── Scripts Tab ───────────────────────────────────────────────────────────
function ScriptsTab({ scripts, items, brand, products, onSaveScripts }: any) {
  const [view, setView] = useState("list")
  const [selected, setSelected] = useState<Script|null>(null)
  const [sections, setSections] = useState<any[]>([])
  const [genMeta, setGenMeta] = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [matching, setMatching] = useState(false)
  const [form, setForm] = useState({ productId:"",awarenessStage:"problem_aware",contentType:"UGC",adLength:"30 seconds",customerAvatar:"",painPoints:"",desires:"",objections:"",request:"" })
  function setF(k:string,v:string){setForm(x=>({...x,[k]:v}))}

  async function handleGen() {
    setGenerating(true)
    try {
      const prod = products.find((x:Product) => String(x.id)===String(form.productId)) || null
      const stage = STAGES.find(s=>s.value===form.awarenessStage)||STAGES[0]
      let ctx = `BRAND:\nName: ${brand.name||"Unknown"}\nDesc: ${brand.description||""}\nVoice: ${brand.voice||""}\nCustomer: ${brand.target_customer||""}\nReviews: ${brand.reviews||""}\n\n`
      if (prod) ctx += `PRODUCT:\nName: ${prod.name}\nDesc: ${prod.description||""}\nBenefits: ${prod.benefits||""}\nClaims: ${prod.claims||""}\n\n`
      const prompt = ctx+`SCRIPT REQ:\nContent type: ${form.contentType}\nLength: ${form.adLength}\nStage: ${stage.label} — ${stage.desc}\nCustomer: ${form.customerAvatar||brand.target_customer||""}\nPains: ${form.painPoints||""}\nDesires: ${form.desires||""}\nObjections: ${form.objections||""}\nRequest: ${form.request||""}\n\nWrite a direct response video ad script. Return ONLY valid JSON:\n{"sections":[{"id":1,"type":"HOOK","spokenWords":"exact words","visualDirection":"what is on screen","durationEstimate":"0-3s"}]}\nSection types: HOOK, PROBLEM, AGITATE, SOLUTION, SOCIAL PROOF, CTA. Distribute time across ${form.adLength}.`
      const raw = await callClaude([{role:"user",content:prompt}],2000)
      const data = JSON.parse(raw.replace(/```json|```/g,"").trim())
      let secs = (data.sections||[]).map((s:any,i:number) => ({...s,id:Date.now()+i,matchedClipIds:[],selectedClipId:null,autoSelected:false}))
      if (items.length>0) secs = await matchClips(secs, items)
      setSections(secs); setGenMeta({form,productName:prod?.name||"General"}); setView("review")
    } catch(e) { alert("Error generating script."); console.error(e) }
    setGenerating(false)
  }

  async function matchClips(secs: any[], libItems: Item[]) {
    const libSummary = libItems.map(item => `ID:${item.id}|title:${item.title}|creator:${item.creator||""}|tags:${(item.analysis?.scene_tags||[]).join(",")}|use:${item.analysis?.use_case||""}`).join("\n")
    const scriptDesc = secs.map((s:any,i:number) => `Section ${i} [${s.type}]: spoken="${(s.spokenWords||"").substring(0,80)}"`).join("\n")
    const prompt = `Match script sections to video clips. Return ONLY valid JSON array:\n\nSCRIPT:\n${scriptDesc}\n\nLIBRARY:\n${libSummary}\n\nReturn: [{"section":0,"clip_ids":["uuid1"],"best_id":"uuid1"},…]`
    try {
      const raw = await callClaude([{role:"user",content:prompt}],700)
      const matches = JSON.parse(raw.replace(/```json|```/g,"").trim())
      const validIds = new Set(libItems.map(i=>i.id))
      return secs.map((s:any,i:number) => {
        const m = matches.find((x:any)=>x.section===i)
        const bestId = m?.best_id && validIds.has(m.best_id) ? m.best_id : null
        const matchedIds = (m?.clip_ids||[]).filter((id:string)=>validIds.has(id))
        return {...s,matchedClipIds:matchedIds.length>0?matchedIds:(s.matchedClipIds||[]),selectedClipId:bestId||(s.selectedClipId||null),autoSelected:!!bestId}
      })
    } catch(e) { return secs }
  }

  async function handleSave() {
    const supabase = createClient()
    const script: Omit<Script,"id"> = { product_name:genMeta?.productName||"General",metadata:genMeta?.form||{},sections,created_at:new Date().toISOString() }
    const { data } = await supabase.from("scripts").insert(script).select().single()
    const next = [...scripts, data]
    onSaveScripts(next)
    setSelected(data); setSections(sections); setView("detail")
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from("scripts").delete().eq("id",id)
    onSaveScripts(scripts.filter((s:Script)=>s.id!==id))
    setView("list")
  }

  if (view==="list") return (
    <div style={{ maxWidth:820,margin:"0 auto",padding:28 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
        <div><STitle size={22} mb={4}>Script Generator</STitle><div style={{ color:C.muted,fontSize:14 }}>AI direct response scripts powered by your brand data</div></div>
        <Btn onClick={() => { setView("generate"); setSections([]); setGenMeta(null) }} style={{ background:C.accent,color:"#fff" }}>+ New Script</Btn>
      </div>
      {scripts.length===0
        ? <Card style={{ textAlign:"center",padding:60 }}><div style={{ fontSize:40,marginBottom:12 }}>✍️</div><STitle mb={6}>No scripts yet</STitle><Btn onClick={() => setView("generate")} style={{ background:C.accent,color:"#fff",marginTop:8 }}>Generate First Script</Btn></Card>
        : <div style={{ display:"grid",gap:12 }}>
            {[...scripts].reverse().map((script:Script) => {
              const m=script.metadata||{}, stage=STAGES.find(s=>s.value===m.awarenessStage), sc2=STAGE_COLORS[m.awarenessStage]||C.accent
              const hook=(script.sections||[]).find((s:any)=>s.type==="HOOK")||(script.sections||[])[0]
              const assigned=(script.sections||[]).filter((s:any)=>!!s.selectedClipId).length
              return (
                <Card key={script.id} style={{ cursor:"pointer" }} onClick={() => { setSelected(script); setSections(script.sections||[]); setGenMeta({form:script.metadata,productName:script.product_name}); setView("detail") }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
                    <div style={{ display:"flex",gap:7,flexWrap:"wrap" }}>
                      {script.product_name && <Chip label={script.product_name} color={{ bg:"#6c63ff22",color:"#a5b4fc" }}/>}
                      {m.contentType && <Chip label={m.contentType} color={{ bg:"#0891b222",color:"#38bdf8" }}/>}
                      {stage && <Chip label={stage.label} color={{ bg:sc2+"22",color:sc2 }}/>}
                      {m.adLength && <Chip label={m.adLength} color={{ bg:"#92400e22",color:"#fbbf24" }}/>}
                      {script.sections && <Chip label={`${assigned}/${script.sections.length} clips`} color={{ bg:assigned===script.sections.length?"#22c55e22":"#f59e0b22",color:assigned===script.sections.length?C.green:C.yellow }}/>}
                    </div>
                    <span style={{ fontSize:11,color:C.muted }}>{script.created_at?new Date(script.created_at).toLocaleDateString():""}</span>
                  </div>
                  {hook && <div style={{ fontSize:13,color:C.muted,fontStyle:"italic",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any }}>"{(hook.spokenWords||"").substring(0,200)}"</div>}
                </Card>
              )
            })}
          </div>}
    </div>
  )

  if (view==="generate") return (
    <div style={{ maxWidth:740,margin:"0 auto",padding:28 }}>
      <button onClick={() => setView("list")} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14 }}>← Back</button>
      <STitle size={22}>New Script</STitle>
      <Card style={{ marginBottom:14 }}><STitle size={14} mb={10}>Quick Request (optional)</STitle><Input textarea value={form.request} onChange={(e:any)=>setF("request",e.target.value)} placeholder={'"30s UGC ad for our serum targeting women with dry skin"'} rows={2}/></Card>
      <Card style={{ marginBottom:14 }}>
        <STitle size={14} mb={14}>Parameters</STitle>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:16 }}>
          <div><Label>Product</Label>
            <select value={form.productId} onChange={e=>setF("productId",e.target.value)} style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer" }}>
              <option value="">General</option>{products.map((x:Product)=><option key={(x as any).id} value={(x as any).id}>{x.name}</option>)}
            </select>
          </div>
          <div><Label>Content Type</Label>
            <select value={form.contentType} onChange={e=>setF("contentType",e.target.value)} style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer" }}>
              {FORM_CTYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><Label>Ad Length</Label>
            <select value={form.adLength} onChange={e=>setF("adLength",e.target.value)} style={{ background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer" }}>
              {AD_LENGTHS.map(l=><option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <Label>Market Awareness Stage</Label>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
          {STAGES.map(s => { const active=form.awarenessStage===s.value,sc2=STAGE_COLORS[s.value]||C.accent; return (
            <div key={s.value} onClick={()=>setF("awarenessStage",s.value)} style={{ background:active?sc2+"22":C.surface,border:"2px solid "+(active?sc2:C.border),borderRadius:10,padding:"10px 12px",cursor:"pointer" }}>
              <div style={{ fontWeight:700,fontSize:13,color:active?sc2:C.text,marginBottom:2 }}>{s.label}</div>
              <div style={{ fontSize:11,color:C.muted }}>{s.desc}</div>
            </div>
          )})}
        </div>
      </Card>
      <Card style={{ marginBottom:20 }}>
        <STitle size={14} mb={6}>Customer Avatar</STitle>
        <div style={{ marginBottom:12 }}><Label>Who is this customer?</Label><Input textarea value={form.customerAvatar} onChange={(e:any)=>setF("customerAvatar",e.target.value)} placeholder="e.g. Sarah, 34, busy mum, tried every moisturiser" rows={2}/></div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:12 }}>
          <div><Label>Pain Points</Label><Input textarea value={form.painPoints} onChange={(e:any)=>setF("painPoints",e.target.value)} rows={3}/></div>
          <div><Label>Desires</Label><Input textarea value={form.desires} onChange={(e:any)=>setF("desires",e.target.value)} rows={3}/></div>
        </div>
        <Label>Objections</Label><Input textarea value={form.objections} onChange={(e:any)=>setF("objections",e.target.value)} rows={2}/>
      </Card>
      <Btn onClick={handleGen} disabled={generating} style={{ background:generating?C.border:C.accent,color:"#fff",width:"100%",padding:14,fontSize:16,borderRadius:12 }}>{generating?"⏳ Writing script & matching clips…":"✨ Generate Script"}</Btn>
    </div>
  )

  if (view==="review") {
    const autoCount = sections.filter(s=>s.autoSelected).length
    return (
      <div style={{ padding:28 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10 }}>
          <button onClick={()=>setView("generate")} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14 }}>← Edit Parameters</button>
          <div style={{ display:"flex",gap:10 }}>
            <Btn onClick={async()=>{setMatching(true);const u=await (async()=>{try{return await matchClips(sections,items)}catch{return sections}})();setSections(u);setMatching(false)}} disabled={matching||items.length===0} style={{ background:matching?C.border:C.accentSoft,color:matching?C.muted:C.accent,border:"1px solid "+C.accent+"44" }}>{matching?"🔍 Matching…":"🔄 Re-match Clips"}</Btn>
            <Btn onClick={handleSave} style={{ background:C.yellow,color:"#000",fontWeight:700 }}>💾 Save Script</Btn>
          </div>
        </div>
        {autoCount>0 && <div style={{ background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#4ade80" }}>✦ AI auto-selected {autoCount} clip{autoCount!==1?"s":""} — click "Change" to swap any.</div>}
        <Card style={{ padding:0,overflow:"hidden" }}>
          <ScriptTable sections={sections} onChange={setSections} libraryItems={items} readOnly={false} brandName={brand.name} productName={genMeta?.productName}/>
        </Card>
      </div>
    )
  }

  if (view==="detail" && selected) {
    const m=selected.metadata||{},stg=STAGES.find(s=>s.value===m.awarenessStage),stgC=STAGE_COLORS[m.awarenessStage]||C.accent
    const disp = sections.length>0?sections:(selected.sections||[])
    const assigned = disp.filter((s:any)=>!!s.selectedClipId).length
    return (
      <div style={{ padding:28 }}>
        <button onClick={()=>setView("list")} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14 }}>← Back to Scripts</button>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12 }}>
          <div>
            <div style={{ display:"flex",gap:7,flexWrap:"wrap",marginBottom:8 }}>
              {selected.product_name && <Chip label={selected.product_name} color={{ bg:"#6c63ff22",color:"#a5b4fc" }}/>}
              {m.contentType && <Chip label={m.contentType} color={{ bg:"#0891b222",color:"#38bdf8" }}/>}
              {stg && <Chip label={stg.label} color={{ bg:stgC+"22",color:stgC }}/>}
              <Chip label={`${assigned}/${disp.length} clips`} color={{ bg:assigned===disp.length?"#22c55e22":"#f59e0b22",color:assigned===disp.length?C.green:C.yellow }}/>
            </div>
            <div style={{ fontSize:13,color:C.muted }}>Saved {selected.created_at?new Date(selected.created_at).toLocaleDateString():""}</div>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <Btn onClick={()=>{setSections(disp);setView("review")}} style={{ background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44" }}>Edit Script</Btn>
            <Btn onClick={()=>handleDelete(selected.id!)} style={{ background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433" }}>Delete</Btn>
          </div>
        </div>
        <Card style={{ padding:0,overflow:"hidden" }}>
          <ScriptTable sections={disp} onChange={setSections} libraryItems={items} readOnly={false} brandName={brand.name} productName={selected.product_name}/>
        </Card>
      </div>
    )
  }
  return null
}

// ── Brand Tab ─────────────────────────────────────────────────────────────
function BrandTab({ brand, setBrand, products, setProducts }: any) {
  const supabase = createClient()
  const [section, setSection] = useState("brand")
  const [saving, setSaving] = useState(false)
  const [editingProd, setEditingProd] = useState<Product|null>(null)

  async function saveBrand() {
    setSaving(true)
    if (brand.id) { await supabase.from("brand_profile").update(brand).eq("id",brand.id) }
    else { const {data} = await supabase.from("brand_profile").insert(brand).select().single(); setBrand(data) }
    setSaving(false)
  }
  async function saveProd(prod: Product) {
    if ((prod as any).id) {
      await supabase.from("products").update(prod).eq("id",(prod as any).id)
      setProducts(products.map((p:any) => p.id===(prod as any).id?prod:p))
    } else {
      const {data} = await supabase.from("products").insert(prod).select().single()
      setProducts([...products,data])
    }
    setEditingProd(null)
  }
  async function deleteProd(id: string) {
    await supabase.from("products").delete().eq("id",id)
    setProducts(products.filter((p:any)=>p.id!==id))
  }

  const navBtn = (id: string, label: string) => (
    <button style={{ padding:"8px 18px",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",border:"none",background:section===id?C.accent:"transparent",color:section===id?"#fff":C.muted }} onClick={()=>setSection(id)}>{label}</button>
  )

  return (
    <div style={{ maxWidth:820,margin:"0 auto",padding:28 }}>
      <STitle size={22}>Brand & Products</STitle>
      <div style={{ display:"flex",gap:8,marginBottom:24 }}>{navBtn("brand","Brand Profile")}{navBtn("products",`Products (${products.length})`)}</div>

      {section==="brand" && (
        <Card>
          {[{k:"name",l:"Brand Name"},{k:"website",l:"Website URL"},{k:"description",l:"Brand Description",ta:true,r:3},{k:"voice",l:"Brand Voice & Tone",ta:true,r:3},{k:"target_customer",l:"Target Customer",ta:true,r:3},{k:"reviews",l:"Reviews / Social Proof",ta:true,r:4},{k:"additional_info",l:"Additional Info",ta:true,r:3}].map((f,i,arr) => (
            <div key={f.k} style={{ marginBottom:i===arr.length-1?20:16 }}>
              <Label>{f.l}</Label>
              <Input value={brand[f.k]||""} onChange={(e:any)=>setBrand({...brand,[f.k]:e.target.value})} textarea={!!(f as any).ta} rows={(f as any).r}/>
            </div>
          ))}
          <Btn onClick={saveBrand} disabled={saving} style={{ background:C.accent,color:"#fff" }}>{saving?"Saving…":"Save Brand Profile"}</Btn>
        </Card>
      )}

      {section==="products" && !editingProd && (
        <div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
            <div style={{ color:C.muted,fontSize:14 }}>Products power script targeting</div>
            <Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{ background:C.accent,color:"#fff" }}>+ New Product</Btn>
          </div>
          {products.length===0
            ? <Card style={{ textAlign:"center",padding:60 }}><div style={{ fontSize:40,marginBottom:12 }}>📦</div><STitle mb={6}>No products yet</STitle><Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{ background:C.accent,color:"#fff",marginTop:8 }}>Add First Product</Btn></Card>
            : <div style={{ display:"grid",gap:12 }}>
                {products.map((prod:any) => (
                  <Card key={prod.id}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                      <div><div style={{ fontWeight:700,fontSize:16,marginBottom:4 }}>{prod.name}</div><div style={{ fontSize:13,color:C.muted }}>{(prod.description||"").substring(0,130)}</div></div>
                      <div style={{ display:"flex",gap:8,marginLeft:16 }}>
                        <Btn onClick={()=>setEditingProd(prod)} style={{ background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:12,padding:"6px 12px" }}>Edit</Btn>
                        <Btn onClick={()=>deleteProd(prod.id)} style={{ background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",fontSize:12,padding:"6px 12px" }}>Delete</Btn>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>}
        </div>
      )}

      {section==="products" && editingProd && (
        <Card>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
            <STitle size={16} mb={0}>{(editingProd as any).id?"Edit Product":"New Product"}</STitle>
            <Btn onClick={()=>setEditingProd(null)} style={{ background:"none",border:"1px solid "+C.border,color:C.muted }}>Cancel</Btn>
          </div>
          {[{k:"name",l:"Product Name *"},{k:"price",l:"Price",ph:"49.99"},{k:"url",l:"Product URL",ph:"https://"},{k:"description",l:"Description",ta:true,r:3},{k:"benefits",l:"Key Benefits",ta:true,r:3},{k:"claims",l:"Claims & Results",ta:true,r:2},{k:"ingredients",l:"Key Ingredients",ta:true,r:2},{k:"differentiators",l:"What makes this different?",ta:true,r:2},{k:"reviews",l:"Product Reviews",ta:true,r:3},{k:"notes",l:"Script Notes",ta:true,r:2}].map(f => (
            <div key={f.k} style={{ marginBottom:13 }}>
              <Label>{f.l}</Label>
              <Input value={(editingProd as any)[f.k]||""} onChange={(e:any)=>setEditingProd({...editingProd,[f.k]:e.target.value} as Product)} placeholder={(f as any).ph||""} textarea={!!(f as any).ta} rows={(f as any).r}/>
            </div>
          ))}
          <Btn onClick={()=>saveProd(editingProd)} disabled={!editingProd.name?.trim()} style={{ background:C.accent,color:"#fff",width:"100%",padding:13,fontSize:15,borderRadius:12,marginTop:4 }}>{(editingProd as any).id?"Save Changes":"Add Product"}</Btn>
        </Card>
      )}
    </div>
  )
}

// ── Root App ──────────────────────────────────────────────────────────────
export default function AdForgeApp() {
  const supabase = createClient()
  const [tab, setTab] = useState("library")
  const [libView, setLibView] = useState("grid")
  const [items, setItems] = useState<Item[]>([])
  const [scripts, setScripts] = useState<Script[]>([])
  const [brand, setBrand] = useState<BrandProfile>({...DEFAULT_BRAND})
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [itemsRes, scriptsRes, brandRes, productsRes] = await Promise.all([
      supabase.from("items").select("*").order("created_at",{ascending:false}),
      supabase.from("scripts").select("*").order("created_at",{ascending:false}),
      supabase.from("brand_profile").select("*").limit(1).single(),
      supabase.from("products").select("*").order("created_at",{ascending:false}),
    ])
    if (itemsRes.data) setItems(itemsRes.data)
    if (scriptsRes.data) setScripts(scriptsRes.data)
    if (brandRes.data) setBrand(brandRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const channel = supabase.channel("items-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"items" }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const tabBtn = (id: string, label: string) => {
    const active = tab === id
    return <button style={{ padding:"10px 20px",background:"none",border:"none",borderBottom:"2px solid "+(active?C.accent:"transparent"),color:active?C.text:C.muted,fontWeight:active?700:500,fontSize:14,cursor:"pointer",transition:"all 0.15s" }} onClick={()=>{setTab(id);if(id==="library")setLibView("grid")}}>{label}</button>
  }

  if (loading) return <div style={{ background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"system-ui" }}>Loading…</div>

  return (
    <div style={{ background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text }}>
      <div style={{ background:C.surface,borderBottom:"1px solid "+C.border,position:"sticky",top:0,zIndex:50 }}>
        <div style={{ padding:"0 20px",display:"flex",alignItems:"center" }}>
          <div style={{ fontWeight:800,fontSize:16,color:C.accent,marginRight:24,padding:"14px 0",letterSpacing:"-0.5px" }}>AdForge</div>
          {tabBtn("library","📦 Library")}
          {tabBtn("scripts","✍️ Scripts")}
          {tabBtn("brand","🏷️ Brand")}
          <div style={{ flex:1 }}/>
          {tab==="library" && libView!=="add" && (
            <Btn onClick={()=>setLibView("add")} style={{ background:C.accent,color:"#fff",margin:"8px 0",fontSize:12,padding:"7px 14px" }}>+ Add Content</Btn>
          )}
          <button onClick={handleSignOut} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,marginLeft:16 }}>Sign out</button>
        </div>
      </div>

      {tab==="library" && <LibraryTab items={items} onRefresh={loadData} view={libView} setView={setLibView}/>}
      {tab==="scripts" && <ScriptsTab scripts={scripts} items={items} brand={brand} products={products} onSaveScripts={setScripts}/>}
      {tab==="brand" && <BrandTab brand={brand} setBrand={setBrand} products={products} setProducts={setProducts}/>}
    </div>
  )
}
