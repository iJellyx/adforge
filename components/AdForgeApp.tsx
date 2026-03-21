'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import MuxPlayer from "@mux/mux-player-react"
import { createClient } from '@/lib/supabase/client'

type Item = {
  id: string; type: string; parent_id?: string; title: string
  creator?: string; creator_age?: string; creator_gender?: string
  description?: string; transcript?: string
  mux_playback_id?: string; mux_status?: string
  duration_seconds?: number; start_seconds?: number; end_seconds?: number
  thumbnail_time?: number; analysis?: any; clip_ids?: string[]
  clip_role?: string; created_at?: string
}
type Script = { id: string; product_name?: string; metadata?: any; sections?: any[]; created_at?: string }
type BrandProfile = { id?: string; name: string; website: string; description: string; voice: string; target_customer: string; reviews: string; additional_info: string; customer_avatars: CustomerAvatar[] }
type CustomerAvatar = { id: string; name: string; age: string; gender: string; description: string; pains: string; desires: string; objections: string }
type Product = { id?: string; name: string; description: string; benefits: string; target_customer: string; claims: string; ingredients: string; differentiators: string; reviews: string; notes: string; price: string; url: string }
type ForgedAd = { id: string; title: string; status: 'draft'|'complete'; mode?: 'script'|'broll'; script_id?: string; sections?: any[]; voiceover_url?: string; voiceover_voice?: string; music_url?: string; music_name?: string; render_id?: string; render_url?: string; render_status?: string; notes?: string; star_rating?: number; metadata?: any; created_at?: string; updated_at?: string }


const C = { bg:"#F4F2FF",surface:"#ffffff",card:"#ffffff",border:"rgba(91,73,255,0.12)",accent:"#5B49FF",accentSoft:"#EDE8FF",text:"#0F1133",muted:"#6B6894",green:"#16A34A",yellow:"#D97706",red:"#DC2626" }
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
const STAGE_COLORS: Record<string,string> = { unaware:"#7C3AED",problem_aware:"#DC2626",solution_aware:"#D97706",product_aware:"#2563EB",most_aware:"#16A34A" }
const AD_LENGTHS = ["15 seconds","30 seconds","45 seconds","60 seconds","90 seconds"]
const FORM_CTYPES = ["UGC","Talking Head","Founder Story","Mashup","Testimonial","Problem-Solution","Tutorial","Before & After"]
const SORTS = ["Newest first","Oldest first","A → Z","Z → A"]
const DEFAULT_BRAND: BrandProfile = { name:"",website:"",description:"",voice:"",target_customer:"",reviews:"",additional_info:"",customer_avatars:[] }
const DEFAULT_PRODUCT: Product = { name:"",description:"",benefits:"",target_customer:"",claims:"",ingredients:"",differentiators:"",reviews:"",notes:"",price:"",url:"" }
const CONTENT_CATEGORIES = ["UGC","Testimonial","Product Demo","Tutorial","Founder Clip","Behind the Scenes","High Production","Talking Head","Other"]
const DURATION_RANGES = ["Under 5s","5–15s","15–30s","30–60s","Over 60s"]
const AD_POTENTIALS = ["High","Medium","Low"]
const MUSIC_MOODS = ["Uplifting","Energetic","Relaxing","Inspiring","Emotional","Fun","Dramatic","Corporate","Acoustic"]

const FALLBACK_TRACKS = [
  { id:"f1", name:"Upbeat Corporate", tags:"upbeat, corporate", duration:120, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", artist:"SoundHelix" },
  { id:"f2", name:"Inspiring Piano", tags:"piano, inspiring", duration:180, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", artist:"SoundHelix" },
  { id:"f3", name:"Energetic Beat", tags:"energetic, fast", duration:90, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", artist:"SoundHelix" },
  { id:"f4", name:"Calm Acoustic", tags:"calm, relaxing", duration:150, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", artist:"SoundHelix" },
  { id:"f5", name:"Fun & Playful", tags:"fun, light", duration:110, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", artist:"SoundHelix" },
]

function muxThumb(playbackId: string, time = 0) { return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=400` }
function muxMp4(playbackId: string) { return `https://stream.mux.com/${playbackId}/high.mp4` }
function fmt(s?: number) { if(!s&&s!==0)return"0:00"; return`${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,"0")}` }
function typeColor(t?: string) {
  const m: Record<string,any> = { "UGC":{bg:"#EDE8FF",color:"#5B49FF"},"Founder Clip":{bg:"#EFF6FF",color:"#2563EB"},"Tutorial":{bg:"#F0FDF4",color:"#16A34A"},"Behind the Scenes":{bg:"#FFFBEB",color:"#D97706"},"High Production":{bg:"#FDF2F8",color:"#9D174D"},"Testimonial":{bg:"#EFF6FF",color:"#1D4ED8"},"Product Demo":{bg:"#ECFDF5",color:"#059669"},"Clip":{bg:"#FFF7ED",color:"#C2410C"},"Talking Head":{bg:"#F5F3FF",color:"#7C3AED"} }
  return m[t||""]||{bg:"#EDE8FF",color:"#5B49FF"}
}
function secColor(t?: string) {
  const m: Record<string,any> = { "HOOK":{bg:"#FEF2F2",color:"#DC2626",bd:"#FECACA"},"PROBLEM":{bg:"#FFFBEB",color:"#D97706",bd:"#FCD34D"},"AGITATE":{bg:"#FFF7ED",color:"#C2410C",bd:"#FED7AA"},"SOLUTION":{bg:"#F0FDF4",color:"#16A34A",bd:"#86EFAC"},"SOCIAL PROOF":{bg:"#EFF6FF",color:"#2563EB",bd:"#BFDBFE"},"CTA":{bg:"#EDE8FF",color:"#5B49FF",bd:"#C4B5FD"},"BODY":{bg:"#F9FAFB",color:"#6B7280",bd:"#E5E7EB"} }
  return m[t||""]||{bg:"#F4F2FF",color:C.muted,bd:C.border}
}
function getDurationRange(secs?: number){if(!secs)return"";if(secs<5)return"Under 5s";if(secs<15)return"5–15s";if(secs<30)return"15–30s";if(secs<60)return"30–60s";return"Over 60s"}
async function callClaude(messages: any[], maxTokens = 1500) {
  const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,maxTokens})})
  const d=await res.json()
  if(!res.ok){
    const msg=d?.error?.message||d?.error||`API error ${res.status}`
    if(typeof msg==="string"&&msg.toLowerCase().includes("credit"))throw new Error("Anthropic API credits are empty — go to console.anthropic.com → Billing to top up.")
    if(typeof msg==="string"&&msg.toLowerCase().includes("invalid x-api-key"))throw new Error("Invalid API key — check ANTHROPIC_API_KEY in Vercel settings.")
    throw new Error(typeof msg==="string"?msg:`API error ${res.status}`)
  }
  if(!d.text)throw new Error("Claude returned an empty response — please try again.")
  return d.text
}

// ── UI Primitives ─────────────────────────────────────────────────────────
function Btn({onClick,disabled,style,children}:any){return<button onClick={onClick} disabled={disabled} style={{border:"none",borderRadius:50,padding:"9px 20px",fontWeight:700,fontSize:13,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,fontFamily:"inherit",transition:"opacity 0.15s",...style}}>{children}</button>}
function Label({children}:any){return<div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:6,letterSpacing:"0.02em"}}>{children}</div>}
function Card({children,style,pad}:any){return<div style={{background:C.card,border:"1.5px solid "+C.border,borderRadius:16,padding:pad||20,boxShadow:"0 2px 12px rgba(91,73,255,0.06)",...style}}>{children}</div>}
function STitle({children,size,mb}:any){return<div style={{fontWeight:800,fontSize:size||17,marginBottom:mb!=null?mb:16,color:C.text,letterSpacing:"-0.02em"}}>{children}</div>}
function Chip({label,color}:any){const cl=color||typeColor(label);return<span style={{background:cl.bg,color:cl.color,padding:"3px 10px",borderRadius:50,fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>}
function Input({value,onChange,placeholder,type,textarea,rows,onKeyDown,style}:any){
  const s={background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box" as const,fontFamily:"inherit",...style}
  if(textarea)return<textarea value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} rows={rows||3} style={{...s,resize:"vertical" as const}}/>
  return<input value={value} onChange={onChange} placeholder={placeholder} type={type||"text"} style={s}/>
}
function MultiSelect({label,options,selected,onChange}:any){
  const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);const sel:string[]=selected||[]
  useEffect(()=>{function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[])
  return<div ref={ref} style={{position:"relative"}}>
    <button onClick={()=>setOpen(!open)} style={{background:sel.length>0?C.accentSoft:C.surface,border:"1px solid "+(sel.length>0?C.accent:C.border),borderRadius:8,padding:"6px 11px",color:sel.length>0?C.accent:C.muted,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",fontWeight:sel.length>0?600:400}}>
      {label}{sel.length>0&&<span style={{background:C.accent,color:"#fff",borderRadius:99,fontSize:9,padding:"1px 5px",fontWeight:700}}>{sel.length}</span>}<span style={{fontSize:8,opacity:0.5}}>{open?"▲":"▼"}</span>
    </button>
    {open&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:6,zIndex:200,minWidth:170,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px #0008"}}>
      {options.map((opt:string)=>{const active=sel.includes(opt);return<div key={opt} onClick={()=>onChange(active?sel.filter((x:string)=>x!==opt):[...sel,opt])} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",borderRadius:7,cursor:"pointer",background:active?C.accentSoft:"transparent",color:active?C.accent:C.text,fontSize:13}}><div style={{width:14,height:14,borderRadius:3,border:"2px solid "+(active?C.accent:C.border),background:active?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{active&&<span style={{color:"#fff",fontSize:8,fontWeight:900}}>✓</span>}</div>{opt}</div>})}
      {sel.length>0&&<div onClick={()=>onChange([])} style={{borderTop:"1px solid "+C.border,marginTop:4,padding:"6px 9px",textAlign:"center",fontSize:11,color:C.muted,cursor:"pointer"}}>Clear</div>}
    </div>}
  </div>
}

// ── VideoCard ─────────────────────────────────────────────────────────────
function VideoCard({item,onClick,selectMode,isSelected,onToggleSelect,compact,highlight}:any){
  const chipLabel=item.type==="clip"?(item.analysis?.use_case||"Clip"):(item.analysis?.content_type||"Untagged")
  const tc=item.type==="clip"?typeColor("Clip"):typeColor(item.analysis?.content_type)
  const thumbTime=item.thumbnail_time??item.start_seconds??0
  function handleClick(e:any){if(selectMode){e.stopPropagation();onToggleSelect()}else onClick()}
  return<div onClick={handleClick} onMouseOver={e=>(e.currentTarget as any).style.borderColor=highlight?C.green:C.accent} onMouseOut={e=>(e.currentTarget as any).style.borderColor=isSelected?C.accent:highlight?C.green:C.border} style={{background:C.card,border:"2px solid "+(isSelected?C.accent:highlight?C.green:C.border),borderRadius:compact?8:12,overflow:"hidden",cursor:"pointer",display:"flex",flexDirection:"column",position:"relative",transition:"border-color 0.15s"}}>
    {selectMode&&<div style={{position:"absolute",top:6,right:6,zIndex:10,width:20,height:20,borderRadius:5,background:isSelected?C.accent:"#000a",border:"2px solid "+(isSelected?"#fff":"#fff5"),display:"flex",alignItems:"center",justifyContent:"center"}}>{isSelected&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}</div>}
    {highlight&&<div style={{position:"absolute",top:6,left:6,zIndex:10,background:C.green,color:"#000",fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4}}>AUTO</div>}
    <div style={{position:"relative",width:"100%",paddingTop:"177.78%",background:"#111",overflow:"hidden",flexShrink:0}}>
      {item.mux_playback_id?<img src={muxThumb(item.mux_playback_id,thumbTime)} alt={item.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><div style={{fontSize:compact?18:28}}>{item.mux_status==="pending"||item.mux_status==="analysing"?"⏳":"🎬"}</div>{!compact&&<div style={{fontSize:9,color:C.muted,textAlign:"center"}}>{item.mux_status==="analysing"?"Analysing…":item.mux_status==="pending"?"Processing…":"No preview"}</div>}</div>}
      {item.type==="clip"&&<div style={{position:"absolute",top:compact?4:8,left:compact?4:8,background:"#f59e0bee",color:"#000",fontSize:compact?7:9,fontWeight:800,padding:"1px 5px",borderRadius:4}}>✂️</div>}
      {item.duration_seconds&&<div style={{position:"absolute",bottom:compact?4:8,right:compact?4:8,background:"#000c",color:"#fff",fontSize:compact?8:10,fontWeight:700,padding:"1px 5px",borderRadius:4}}>{fmt(item.duration_seconds)}</div>}
    </div>
    <div style={{padding:compact?6:12,flex:1,display:"flex",flexDirection:"column",gap:3}}>
      <Chip label={chipLabel} color={tc}/>
      <div style={{fontWeight:700,fontSize:compact?10:13,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>{item.title}</div>
      {item.creator&&<div style={{fontSize:compact?8:10,color:C.muted}}>👤 {item.creator}{item.creator_age?` · ${item.creator_age}`:""}</div>}
      {!compact&&(item.analysis?.scene_tags||[]).slice(0,2).map((t:string,i:number)=><span key={i} style={{background:"#22c55e18",color:"#4ade80",padding:"1px 5px",borderRadius:99,fontSize:8,fontWeight:600}}>{t}</span>)}
    </div>
  </div>
}

function MuxClipPlayer({item}:any){
  if(!item?.mux_playback_id)return<div style={{background:"#111",borderRadius:12,padding:32,textAlign:"center",color:C.muted,marginBottom:16}}><div style={{fontSize:32,marginBottom:8}}>🎬</div><div style={{fontSize:13}}>{item?.mux_status==="pending"||item?.mux_status==="analysing"?"Video is still processing…":"No video available"}</div></div>
  if(item.type==="clip"&&item.start_seconds!=null){
    return<div style={{borderRadius:12,overflow:"hidden",marginBottom:16,background:"#000",aspectRatio:"9/16",maxHeight:500,position:"relative"}}>
      <ClipSegmentPlayer playbackId={item.mux_playback_id} start={item.start_seconds||0} end={item.end_seconds} muted={false}/>
    </div>
  }
  return<div style={{borderRadius:12,overflow:"hidden",marginBottom:16,background:"#000"}}><MuxPlayer playbackId={item.mux_playback_id} startTime={item.start_seconds||0} streamType="on-demand" accentColor={C.accent} style={{width:"100%",aspectRatio:"9/16",maxHeight:500,display:"block"}}/></div>
}

function TagEditor({tags,onUpdate}:{tags:string[],onUpdate:(t:string[])=>void}){
  const [newTag,setNewTag]=useState("")
  function addTag(){const t=newTag.trim();if(!t||tags.includes(t)){setNewTag("");return;}onUpdate([...tags,t]);setNewTag("")}
  return<div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10,minHeight:26}}>{tags.length===0&&<span style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>No tags yet</span>}{tags.map((t,i)=><span key={i} style={{background:"#22c55e18",color:"#4ade80",padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5,border:"1px solid #22c55e33"}}>{t}<span onClick={()=>onUpdate(tags.filter(x=>x!==t))} style={{cursor:"pointer",fontSize:13,opacity:0.7}}>×</span></span>)}</div>
    <div style={{display:"flex",gap:8}}><Input value={newTag} onChange={(e:any)=>setNewTag(e.target.value)} onKeyDown={(e:any)=>{if(e.key==="Enter"){e.preventDefault();addTag()}}} placeholder="Type tag + Enter"/><Btn onClick={addTag} style={{background:C.accent,color:"#fff",flexShrink:0,padding:"9px 14px"}}>Add</Btn></div>
  </div>
}

// ── FFmpeg MP4 Exporter ───────────────────────────────────────────────────
function ExportVideo({sections,libraryItems,voiceoverUrl,musicUrl,onSave}:any){
  const [exporting,setExporting]=useState(false)
  const [progress,setProgress]=useState(0)
  const [msg,setMsg]=useState("")
  const [done,setDone]=useState(false)

  const clips=(sections||[]).map((s:any)=>{
    const item=s.selectedClipId?libraryItems.find((i:Item)=>i.id===s.selectedClipId):null
    if(!item?.mux_playback_id)return null
    return{item,label:s.type||s.label||"",selectedClipId:s.selectedClipId}
  }).filter(Boolean)

  async function doExport(){
  if(!clips.length){setMsg("No clips assigned — add clips to each section before exporting.");return}
  setExporting(true);setDone(false);setProgress(10);setMsg("Submitting to Shotstack…")
  try{
    const itemIds=clips.map((c:any)=>c.item.id)
    // Save to Forged Ads first if not already saved
    let savedAdId:string|null=null
    if(onSave){
      setMsg("Saving ad…")
      savedAdId=await onSave()
    }
    const res=await fetch("/api/export",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        sections:sections.filter((s:any)=>s.selectedClipId),
        itemIds,
        voiceoverUrl:voiceoverUrl||null,
        musicUrl:musicUrl||null,
      })
    })
    const rawText=await res.text()
    let data:any
    try{data=JSON.parse(rawText)}catch{throw new Error(rawText.substring(0,200))}
    if(!res.ok)throw new Error(data.error||`Server error: ${res.status}`)

    if(data.url){
      setProgress(95);setMsg("Downloading MP4…")
      const dlRes=await fetch(`/api/export/status?id=${data.renderId}&download=true`)
      const blob=await dlRes.blob()
      const blobUrl=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=blobUrl
      a.download=`adforge-ad-${Date.now()}.mp4`
      a.click()
      setTimeout(()=>URL.revokeObjectURL(blobUrl),15000)
      setProgress(100);setMsg("✓ MP4 ready!");setDone(true)
    } else if(data.renderId){
      // Still rendering — poll from client
      setProgress(50);setMsg("Rendering video… (this takes 1–2 mins)")
      const renderId=data.renderId
      const apiKey=process.env.NEXT_PUBLIC_SHOTSTACK_API_KEY||""
      let attempts=0
      while(attempts<40){
        await new Promise(r=>setTimeout(r,4000))
        const statusRes=await fetch(`/api/export/status?id=${renderId}`)
        const statusData=await statusRes.json()
        if(statusData.url){
         setProgress(95);setMsg("Downloading MP4…")
         const dlRes=await fetch(`/api/export/status?id=${renderId}&download=true`)
         const blob=await dlRes.blob()
         const blobUrl=URL.createObjectURL(blob)
         const a=document.createElement("a")
         a.href=blobUrl
         a.download=`adforge-ad-${Date.now()}.mp4`
         a.click()
  setTimeout(()=>URL.revokeObjectURL(blobUrl),15000)
          setProgress(100);setMsg("✓ MP4 ready!");setDone(true)
          break
        }
        if(statusData.failed)throw new Error("Render failed on Shotstack")
        attempts++
        setProgress(50+Math.round(attempts/40*40));setMsg(`Rendering… ${Math.round((attempts/40)*100)}%`)
      }
    }
  }catch(e:any){
    setMsg("Export failed: "+e.message)
    console.error(e)
  }
  setExporting(false)
}

  const assignedCount=clips.length
  const total=(sections||[]).length

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:20,marginTop:16}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>⬇️ Export Final Ad as MP4</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Stitches all clips{voiceoverUrl?" + voiceover":""}{musicUrl?" + music":""} into a single MP4 file on the server.</div>
    <div style={{background:"#ffffff08",border:"1px solid "+C.border,borderRadius:8,padding:"8px 12px",fontSize:11,color:C.muted,marginBottom:12}}>⚠️ Requires Mux paid plan for MP4 access. Max ~60s of total ad length on Vercel's free plan.</div>
    <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
      <div style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"7px 12px",fontSize:12}}>🎬 {assignedCount}/{total} clips assigned</div>
      {voiceoverUrl&&<div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:8,padding:"7px 12px",fontSize:12,color:C.green}}>🎙️ Voiceover ready</div>}
      {musicUrl&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"7px 12px",fontSize:12,color:C.accent}}>🎵 Music selected</div>}
    </div>
    {exporting&&<div style={{marginBottom:14}}>
      <div style={{height:6,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",width:progress+"%",background:C.green,borderRadius:4,transition:"width 0.5s"}}/></div>
      <div style={{fontSize:12,color:C.muted}}>{msg}</div>
    </div>}
    {!exporting&&msg&&<div style={{fontSize:13,color:done?C.green:C.red,marginBottom:12,fontWeight:600}}>{msg}</div>}
    <Btn onClick={doExport} disabled={exporting||assignedCount===0} style={{background:exporting?C.border:C.green,color:exporting?"#aaa":"#000",fontWeight:700,width:"100%",padding:14,fontSize:15,borderRadius:12}}>
      {exporting?`⏳ ${msg}`:"⬇️ Download MP4"}
    </Btn>
  </div>
}

// ── Voiceover Generator ───────────────────────────────────────────────────
function VoiceoverGenerator({sections,allHookSections,onSave,onSkip}:any){
  const [voices,setVoices]=useState<any[]>([])
  const [selectedVoice,setSelectedVoice]=useState("")
  const [loading,setLoading]=useState(false)
  const [generating,setGenerating]=useState(false)
  const [progress,setProgress]=useState(0)
  const [error,setError]=useState("")
  const [voiceSearch,setVoiceSearch]=useState("")
  const [sectionAudios,setSectionAudios]=useState<Record<number,string>>({})
  const [allHookResults,setAllHookResults]=useState<any[][]|null>(null)

  useEffect(()=>{
    setLoading(true)
    fetch("/api/elevenlabs/voices").then(r=>r.json()).then(d=>{
      if(d.voices&&d.voices.length>0){setVoices(d.voices);setSelectedVoice(d.voices[0].id)}
      else setError(d.error||"Check your ELEVENLABS_API_KEY in Vercel Settings")
    }).catch(()=>setError("Could not connect to ElevenLabs")).finally(()=>setLoading(false))
  },[])

  const sectionsWithWords=(sections||[]).filter((s:any)=>s.spokenWords?.trim())
  const selectedVoiceObj=voices.find(v=>v.id===selectedVoice)
  const allGenerated=sectionsWithWords.length>0&&sectionsWithWords.every((_:any,i:number)=>sectionAudios[i])

  async function generateAll(){
    if(!selectedVoice||!sectionsWithWords.length)return
    setGenerating(true);setError("");setProgress(0)

    async function generateAndUpload(text:string,idx:number,total:number):Promise<string>{
      setProgress(Math.round((idx/total)*90))
      const res=await fetch("/api/elevenlabs/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,voiceId:selectedVoice})})
      if(!res.ok)throw new Error(`ElevenLabs error: ${res.status}`)
      const blob=await res.blob()
      const file=new File([blob],`vo_${idx}_${Date.now()}.mp3`,{type:"audio/mpeg"})
      const fd=new FormData();fd.append("file",file)
      const upRes=await fetch("/api/voiceover/upload",{method:"POST",body:fd})
      const upData=await upRes.json()
      return upData.url||URL.createObjectURL(blob)
    }

    try{
      if(allHookSections&&allHookSections.length>1){
        // Generate voiceovers for all hook variations
        // Body sections are shared — generate once
        const bodySections=sectionsWithWords.filter((s:any)=>s.type!=="HOOK")
        const bodyAudios:Record<number,string>={}
        for(let i=0;i<bodySections.length;i++){
          const sec=bodySections[i]
          const bodyIdx=sectionsWithWords.findIndex((s:any)=>s===sec)
          bodyAudios[bodyIdx]=await generateAndUpload(sec.spokenWords,i,bodySections.length+allHookSections.length)
        }

        // Generate hook voiceover for each variation separately
        const allUpdatedHooks:any[][]=[]
        for(let hi=0;hi<allHookSections.length;hi++){
          const hookVariationSecs=allHookSections[hi]
          const hookSec=hookVariationSecs.find((s:any)=>s.type==="HOOK")
          const hookAudio=hookSec?await generateAndUpload(hookSec.spokenWords,bodySections.length+hi,bodySections.length+allHookSections.length):null

          // Build updated sections for this hook variation
          const updatedSecs=hookVariationSecs.map((s:any,si:number)=>{
            if(s.type==="HOOK")return{...s,voiceover_url:hookAudio}
            const bodyIdx=sectionsWithWords.findIndex((bs:any)=>bs.spokenWords===s.spokenWords)
            return{...s,voiceover_url:bodyAudios[bodyIdx]||null}
          })
          allUpdatedHooks.push(updatedSecs)
        }

        const newAudios:Record<number,string>={}
        allUpdatedHooks[0].forEach((s:any,i:number)=>{if(s.voiceover_url)newAudios[i]=s.voiceover_url})
        setSectionAudios(newAudios)
        setProgress(100)
        const combinedUrl=allUpdatedHooks[0].find((s:any)=>s.voiceover_url)?.voiceover_url||""
        setAllHookResults(allUpdatedHooks)
        setGenerating(false)
        return
      }

      // Single hook — original flow
      const newAudios:Record<number,string>={}
      for(let i=0;i<sectionsWithWords.length;i++){
        newAudios[i]=await generateAndUpload(sectionsWithWords[i].spokenWords,i,sectionsWithWords.length)
      }
      setSectionAudios(newAudios)
      setProgress(100)
    }catch(e:any){setError(e.message)}
    setGenerating(false)
  }
  const filteredVoices=voices.filter(v=>!voiceSearch||v.name.toLowerCase().includes(voiceSearch.toLowerCase())||(v.gender||"").toLowerCase().includes(voiceSearch.toLowerCase())||(v.accent||"").toLowerCase().includes(voiceSearch.toLowerCase()))

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:20}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>🎙️ AI Voiceover — Per Section</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Generates a separate voiceover for each script section — perfectly synced to each clip.</div>
    {loading&&<div style={{color:C.muted,fontSize:13,padding:"20px 0",textAlign:"center"}}>Loading voices…</div>}
    {!loading&&error&&voices.length===0&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#ef4444",marginBottom:12}}>{error}</div>}
    {!loading&&voices.length>0&&<>
      <div style={{marginBottom:12}}>
        <Label>Select Voice</Label>
        <input value={voiceSearch} onChange={e=>setVoiceSearch(e.target.value)} placeholder="Filter by name, gender, accent…" style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const,marginBottom:8}}/>
        <div style={{maxHeight:160,overflowY:"auto",border:"1px solid "+C.border,borderRadius:10}}>
          {filteredVoices.map((v:any)=><div key={v.id} onClick={()=>setSelectedVoice(v.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",cursor:"pointer",background:selectedVoice===v.id?C.accentSoft:"transparent",borderBottom:"1px solid "+C.border}}>
            <div style={{width:16,height:16,borderRadius:"50%",border:"2px solid "+(selectedVoice===v.id?C.accent:C.border),background:selectedVoice===v.id?C.accent:"transparent",flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13,color:selectedVoice===v.id?C.accent:C.text}}>{v.name}</div><div style={{fontSize:10,color:C.muted}}>{[v.gender,v.age,v.accent].filter(Boolean).join(" · ")}</div></div>
            {v.preview_url&&<button onClick={e=>{e.stopPropagation();new Audio(v.preview_url).play()}} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11}}>▶</button>}
          </div>)}
        </div>
      </div>

      {/* Section preview */}
      <div style={{marginBottom:14}}>
        {allHookSections&&allHookSections.length>1
          ?<>
            <Label>Voiceovers to generate across {allHookSections.length} hook variations</Label>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {allHookSections.map((hookSecs:any[],hi:number)=>{
                const hookSec=hookSecs.find((s:any)=>s.type==="HOOK")
                const isFirst=hi===0
                const bodySections=hookSecs.filter((s:any)=>s.type!=="HOOK")
                return<div key={hi} style={{background:C.surface,borderRadius:10,border:"1px solid "+C.border,overflow:"hidden"}}>
                  <div style={{padding:"8px 12px",background:isFirst?"#ffffff08":C.accentSoft,borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:isFirst?C.text:C.accent}}>{isFirst?"Original Hook":"Hook "+(hi+1)+" — AI Variation"}</span>
                    {allHookResults&&<span style={{color:C.green,fontSize:12,marginLeft:"auto"}}>✓ Generated</span>}
                  </div>
                  <div style={{padding:"8px 12px"}}>
                    <div style={{fontSize:12,color:C.text,marginBottom:6,fontStyle:"italic"}}>"{hookSec?.spokenWords?.substring(0,80)}…"</div>
                    {hi===0&&<div style={{fontSize:10,color:C.muted}}>+ {bodySections.length} body sections shared across all variations</div>}
                    {hi>0&&<div style={{fontSize:10,color:C.muted}}>Hook audio unique · Body audio shared from Hook 1</div>}
                  </div>
                </div>
              })}
            </div>
          </>
          :<>
            <Label>Script Sections ({sectionsWithWords.length} sections to voice)</Label>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto"}}>
              {sectionsWithWords.map((s:any,i:number)=>{
                const sc=secColor(s.type)
                const hasAudio=!!sectionAudios[i]
                return<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:C.surface,borderRadius:8,border:"1px solid "+(hasAudio?C.green:C.border)}}>
                  <span style={{background:sc.bg,color:sc.color,fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:4,flexShrink:0}}>{s.type}</span>
                  <div style={{flex:1,fontSize:11,color:C.muted,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{s.spokenWords}</div>
                  {hasAudio?<audio src={sectionAudios[i]} controls style={{height:24,width:120}}/>:<span style={{fontSize:10,color:C.muted}}>Not generated</span>}
                  {hasAudio&&<span style={{color:C.green,fontSize:12}}>✓</span>}
                </div>
              })}
            </div>
          </>}
      </div>

      {generating&&<div style={{marginBottom:12}}>
        <div style={{height:5,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:6}}><div style={{height:"100%",width:progress+"%",background:C.accent,borderRadius:4,transition:"width 0.3s"}}/></div>
        <div style={{fontSize:11,color:C.muted}}>Generating section {Math.ceil(progress/100*sectionsWithWords.length)+1} of {sectionsWithWords.length}…</div>
      </div>}
      {error&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#ef4444",marginBottom:12}}>{error}</div>}

      <div style={{display:"flex",gap:10}}>
        <Btn onClick={generateAll} disabled={generating||!sectionsWithWords.length||!selectedVoice} style={{background:generating?C.border:C.accent,color:"#fff",flex:1}}>{generating?"⏳ Generating…":allGenerated?"🔄 Regenerate All":"🎙️ Generate Voiceovers"}</Btn>
        {(allGenerated||allHookResults)&&<Btn onClick={()=>{
          if(allHookResults){
            const combinedUrl=allHookResults[0].find((s:any)=>s.voiceover_url)?.voiceover_url||""
            onSave(allHookResults[0],selectedVoiceObj?.name||selectedVoice,combinedUrl,allHookResults)
          } else {
            const updatedSections=sectionsWithWords.map((s:any,i:number)=>sectionAudios[i]?{...s,voiceover_url:sectionAudios[i]}:s)
            const combinedUrl=Object.values(sectionAudios)[0] as string
            onSave(updatedSections,selectedVoiceObj?.name||selectedVoice,combinedUrl,null)
          }
        }} style={{background:C.green,color:"#000",fontWeight:700}}>✓ Use These</Btn>}
      </div>
    </>}
    <div style={{textAlign:"center",marginTop:12}}><button onClick={onSkip} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Skip — my video already has audio</button></div>
  </div>
}

// ── Music Picker ──────────────────────────────────────────────────────────
function MusicPicker({suggestedMood,onSave}:any){
  const [mood,setMood]=useState(suggestedMood||"Uplifting")
  const [tracks,setTracks]=useState<any[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")
  const [selectedTrack,setSelectedTrack]=useState<any>(null)
  const [playingId,setPlayingId]=useState<string|null>(null)
  const audioRefs=useRef<Record<string,HTMLAudioElement>>({})

  async function search(searchMood?:string){
    const q=searchMood||mood
    setLoading(true);setError("")
    try{const res=await fetch(`/api/pixabay/music?q=${encodeURIComponent(q)}`);const d=await res.json();if(d.tracks&&d.tracks.length>0){setTracks(d.tracks)}else{setError(d.error||"No tracks found");setTracks(FALLBACK_TRACKS)}}catch{setError("Using sample tracks");setTracks(FALLBACK_TRACKS)}
    setLoading(false)
  }
  useEffect(()=>{search()},[])

    useEffect(()=>{
      return()=>{
        Object.values(audioRefs.current).forEach(a=>{a.pause();a.currentTime=0})
      }
    },[])

  function togglePlay(track:any){
    if(playingId===track.id){audioRefs.current[track.id]?.pause();setPlayingId(null)}
    else{Object.values(audioRefs.current).forEach(a=>a.pause());if(!audioRefs.current[track.id]){const a=new Audio(track.preview_url);audioRefs.current[track.id]=a;a.onended=()=>setPlayingId(null)}audioRefs.current[track.id].play().catch(()=>{});setPlayingId(track.id)}
  }

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:20}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>🎵 Background Music</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Optional — choose a royalty-free track.</div>
    {suggestedMood&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.accent,marginBottom:12}}>✨ AI suggested: <strong>{suggestedMood}</strong></div>}
    {error&&<div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#fbbf24",marginBottom:10}}>⚠️ {error}</div>}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
      {MUSIC_MOODS.map(m=><button key={m} onClick={()=>{setMood(m);search(m)}} style={{background:mood===m?C.accent:C.surface,color:mood===m?"#fff":C.muted,border:"1px solid "+(mood===m?C.accent:C.border),borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{m}</button>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:240,overflowY:"auto"}}>
      {tracks.map((track:any)=><div key={track.id} onClick={()=>setSelectedTrack(selectedTrack?.id===track.id?null:track)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:"2px solid "+(selectedTrack?.id===track.id?C.accent:C.border),background:selectedTrack?.id===track.id?C.accentSoft:C.surface,cursor:"pointer"}}>
        <button onClick={e=>{e.stopPropagation();togglePlay(track)}} style={{width:30,height:30,borderRadius:"50%",background:playingId===track.id?C.accent:C.border,border:"none",color:"#fff",cursor:"pointer",fontSize:11,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{playingId===track.id?"⏸":"▶"}</button>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{track.name}</div><div style={{fontSize:11,color:C.muted}}>by {track.artist} · {fmt(track.duration)}</div></div>
        {selectedTrack?.id===track.id&&<span style={{color:C.accent,fontSize:12,fontWeight:700,flexShrink:0}}>✓</span>}
      </div>)}
    </div>
    <div style={{display:"flex",gap:10,marginTop:12}}>
      {selectedTrack&&<Btn onClick={()=>onSave(selectedTrack.url,selectedTrack.name)} style={{background:C.green,color:"#000",fontWeight:700,flex:1}}>✓ Use "{selectedTrack.name}"</Btn>}
      <Btn onClick={()=>onSave(null,null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Skip Music</Btn>
    </div>
  </div>
}

// ── Stitched Preview ──────────────────────────────────────────────────────
function StitchedPreview({sections,libraryItems,voiceoverUrl,musicUrl}:any){
 const [clipIdx,setClipIdx]=useState(0)
  const [playing,setPlaying]=useState(false)
  const vidRef=useRef<HTMLVideoElement>(null)
  const voiceRef=useRef<HTMLAudioElement>(null)
  const musicRef=useRef<HTMLAudioElement>(null)
  const clipStartTimesRef=useRef<number[]>([])

    const clips=(sections||[]).flatMap((s:any,sectionIdx:number)=>{
    const segments=s.clipSegments&&s.clipSegments.length>0?s.clipSegments:[{clipId:s.selectedClipId}]
    const validSegs=segments.filter((seg:any)=>seg.clipId&&libraryItems.find((i:Item)=>i.id===seg.clipId))
    const segCount=validSegs.length
    // Calculate natural durations for proportional time distribution
    const naturalDurs=validSegs.map((seg:any)=>{
      const item=libraryItems.find((i:Item)=>i.id===seg.clipId)
      const start=seg.trimStart??item?.start_seconds??0
      const end=seg.trimEnd??item?.end_seconds??(start+(item?.duration_seconds||5))
      return Math.max(0.5,end-start)
    })
    const totalNatural=naturalDurs.reduce((a:number,b:number)=>a+b,0)||1
    return validSegs.map((seg:any,segIdx:number)=>{
      const item=libraryItems.find((i:Item)=>i.id===seg.clipId)
      if(!item?.mux_playback_id)return null
      const trimStart=seg.trimStart??item.start_seconds??0
      const trimEnd=seg.trimEnd??item.end_seconds??(trimStart+(item.duration_seconds||5))
      const naturalDur=naturalDurs[segIdx]
      const naturalFraction=naturalDur/totalNatural
      return{
        item,
        start:trimStart,
        end:trimEnd,
        naturalDur,
        naturalFraction,
        sectionIdx,
        label:s.type,
        spoken:segIdx===0?s.spokenWords||"":"",
        muted:s.muted||false,
        voiceover_url:s.voiceover_url||null,
        sectionVoUrl:s.voiceover_url||null,
        isFirstInSection:segIdx===0,
        isLastInSection:segIdx===segCount-1,
        segCount,
        segIdx,
      }
    }).filter(Boolean)
  }).filter(Boolean)

  const cur=clips[clipIdx]

   useEffect(()=>{
    // Use clip segment duration (end - start), not full video duration
    let elapsed=0
    const times=clips.map((c:any)=>{
      const t=elapsed
      const segDur=(c.end!=null&&c.start!=null&&c.end>c.start)?(c.end-c.start):3
      elapsed+=segDur
      return t
    })
    clipStartTimesRef.current=times
    console.log("Clip voice times:",times)
  },[clips.length])

  useEffect(()=>{
    const v=vidRef.current;if(!v||!cur)return
    v.src=`https://stream.mux.com/${cur.item.mux_playback_id}/capped-1080p.mp4`
    function seek(){if(v)v.currentTime=cur!.start}
    if(v.readyState>=1)seek();else v.addEventListener("loadedmetadata",seek,{once:true})
    if(playing)v.play().catch(()=>{})
  },[clipIdx])

  function getClipPlayDuration(idx:number):number{
    const clip=clips[idx]
    if(!clip)return 3
    const voiceDur=voiceRef.current?.duration||0
    if(voiceDur>0&&clip.sectionVoUrl){
      return Math.max(1,voiceDur*clip.naturalFraction)
    }
    return Math.max(1,clip.naturalDur||3)
  }

  function onTimeUpdate(){
    const v=vidRef.current;if(!v||!cur)return
    const clipDur=getClipPlayDuration(clipIdx)
    const elapsed=v.currentTime-cur.start
    if(elapsed>=clipDur){
      if(clipIdx<clips.length-1){
        const next=clips[clipIdx+1]
        // Only pause voiceover when moving to a NEW section
        if(next?.sectionIdx!==cur.sectionIdx){
          voiceRef.current?.pause()
        }
        setClipIdx(i=>i+1)
      } else {
        v.pause();setPlaying(false);setClipIdx(0)
        voiceRef.current?.pause();musicRef.current?.pause()
      }
    }
  }
    function getVoiceTime(idx:number){
    const fraction=clipStartTimesRef.current[idx]||0
    const voiceDur=voiceRef.current?.duration||0
    return fraction*voiceDur
  }

  function toggle(){
    const v=vidRef.current;if(!v)return
    if(playing){
      v.pause();voiceRef.current?.pause();musicRef.current?.pause();setPlaying(false)
    } else {
      v.play().catch(()=>{})
      if(voiceRef.current){voiceRef.current.currentTime=0;voiceRef.current.play().catch(()=>{})}
      if(musicRef.current){musicRef.current.currentTime=0;musicRef.current.volume=0.2;musicRef.current.play().catch(()=>{})}
      setPlaying(true)
    }
  }

  useEffect(()=>{
    if(playing&&cur?.isFirstInSection&&voiceRef.current){
      // Only restart voiceover at start of a new section
      voiceRef.current.currentTime=0
      voiceRef.current.play().catch(()=>{})
    }
    // For secondary clips in same section, voiceover keeps playing — no action needed
  },[clipIdx])

  if(clips.length===0)return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:32,textAlign:"center",color:C.muted}}><div style={{fontSize:28,marginBottom:8}}>🎬</div><div style={{fontSize:13}}>Assign clips to sections to preview the full ad</div></div>

  const sc=secColor(cur?.label)

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,overflow:"hidden"}}>
    {/* Hidden audio elements — per section voiceover */}
    {cur?.sectionVoUrl&&<audio ref={voiceRef} key={cur.sectionVoUrl} src={cur.sectionVoUrl} style={{display:"none"}}/>}
    {voiceoverUrl&&!cur?.sectionVoUrl&&<audio ref={voiceRef} key={voiceoverUrl} src={voiceoverUrl} style={{display:"none"}}/>}
    {musicUrl&&<audio ref={musicRef} src={musicUrl} style={{display:"none"}} loop/>}

    <div style={{padding:"12px 16px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:10}}>
      <div style={{fontWeight:700,fontSize:14}}>🎬 Full Ad Preview</div>
      <span style={{fontSize:12,color:C.muted}}>{clips.length} clips · section {clipIdx+1}</span>
      {(voiceoverUrl||musicUrl)&&<div style={{display:"flex",gap:6}}>
        {voiceoverUrl&&<span style={{fontSize:10,color:C.green,background:"#22c55e11",padding:"2px 7px",borderRadius:99,border:"1px solid #22c55e33"}}>🎙️ Voiceover</span>}
        {musicUrl&&<span style={{fontSize:10,color:C.accent,background:C.accentSoft,padding:"2px 7px",borderRadius:99,border:"1px solid "+C.accent+"33"}}>🎵 Music</span>}
      </div>}
      <div style={{flex:1}}/>
      <span style={{background:sc?.bg,color:sc?.color,border:"1px solid "+sc?.bd,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5}}>{cur?.label}</span>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 260px"}}>
      <div style={{position:"relative",background:"#000",display:"flex",alignItems:"center",justifyContent:"center",minHeight:320}}>
        <video ref={vidRef} playsInline preload="metadata" muted={cur?.muted||false} style={{maxHeight:480,maxWidth:"100%",display:"block",cursor:"pointer"}} onTimeUpdate={onTimeUpdate} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onClick={toggle}/>
        {!playing&&<div onClick={toggle} style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:"#000a",border:"2px solid #fff4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>▶</div>
          {(voiceoverUrl||musicUrl)&&<div style={{position:"absolute",bottom:16,fontSize:11,color:"#fff",background:"#000a",padding:"3px 10px",borderRadius:99}}>{[voiceoverUrl?"🎙️ Voiceover":"",musicUrl?"🎵 Music":""].filter(Boolean).join(" + ")} will play</div>}
        </div>}
      </div>
      <div style={{borderLeft:"1px solid "+C.border,overflowY:"auto",maxHeight:480}}>
        <div style={{padding:"8px 10px",borderBottom:"1px solid "+C.border,fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>Timeline</div>
        {clips.map((clip:any,i:number)=>{const sc2=secColor(clip.label);const active=i===clipIdx;return<div key={i} onClick={()=>{
          setClipIdx(i);setPlaying(false);
          if(voiceRef.current){voiceRef.current.pause();voiceRef.current.currentTime=getVoiceTime(i)}
          if(musicRef.current){musicRef.current.pause()}
        }} style={{display:"flex",gap:8,padding:"8px 10px",borderBottom:"1px solid "+C.border,cursor:"pointer",background:active?C.accentSoft:"transparent"}}>
          <div style={{width:34,position:"relative",paddingTop:"60px",flexShrink:0,borderRadius:5,overflow:"hidden",background:"#111",border:"1px solid "+(active?C.accent:C.border)}}>{clip.item.mux_playback_id&&<img src={muxThumb(clip.item.mux_playback_id,clip.item.thumbnail_time||0)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{background:sc2.bg,color:sc2.color,fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:3,display:"inline-block",marginBottom:3}}>{clip.label}</div>
            {clip.muted&&<span style={{fontSize:8,color:"#ef4444",marginLeft:4}}>🔇</span>}
            <div style={{fontSize:10,color:active?C.text:C.muted,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>{clip.spoken||clip.item.title}</div>
          </div>
        </div>})}
      </div>
    </div>

    <div style={{padding:"10px 16px",borderTop:"1px solid "+C.border}}>
      {/* Timeline scrubber */}
      <div style={{display:"flex",gap:2,marginBottom:10}}>
        {clips.map((clip:any,i:number)=>{
          const sc2=secColor(clip.label)
          const active=i===clipIdx
          return<div key={i} onClick={()=>{
            setClipIdx(i);setPlaying(false);
            if(voiceRef.current){voiceRef.current.pause();voiceRef.current.currentTime=getVoiceTime(i)}
            if(musicRef.current){musicRef.current.pause()}
          }} title={clip.label} style={{flex:1,height:6,borderRadius:3,background:active?sc2.color:sc2.bg,cursor:"pointer",border:active?"1px solid "+sc2.color:"1px solid transparent",transition:"all 0.15s"}}/>
        })}
      </div>
      {/* Section labels */}
      <div style={{display:"flex",gap:2,marginBottom:10}}>
        {clips.map((clip:any,i:number)=>{
          const sc2=secColor(clip.label)
          const active=i===clipIdx
          return<div key={i} onClick={()=>{
            setClipIdx(i);setPlaying(false);
            if(voiceRef.current){voiceRef.current.pause();voiceRef.current.currentTime=getVoiceTime(i)}
            if(musicRef.current){musicRef.current.pause()}
          }} style={{flex:1,textAlign:"center",fontSize:7,fontWeight:800,color:active?sc2.color:C.muted,cursor:"pointer",overflow:"hidden",whiteSpace:"nowrap"}}>{clip.label?.substring(0,4)}</div>
        })}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>{setClipIdx(i=>Math.max(0,i-1));setPlaying(false)}} disabled={clipIdx===0} style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12}}>‹</button>
        <button onClick={toggle} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",cursor:"pointer",fontSize:13,fontWeight:600}}>{playing?"⏸ Pause":"▶ Play Full Ad"}</button>
        <button onClick={()=>{setClipIdx(i=>Math.min(clips.length-1,i+1));setPlaying(false)}} disabled={clipIdx===clips.length-1} style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12}}>›</button>
        <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>{clipIdx+1} / {clips.length}</span>
      </div>
    </div>
  </div>
}

// ── Auto-Mash Mode ────────────────────────────────────────────────────────
function AutoMashMode({libraryItems,brand,products,onSaveForgedAd,onGoToForged,onBack}:any){
  const [step,setStep]=useState<"config"|"preview">("config")
  const [generating,setGenerating]=useState(false)
  const [genError,setGenError]=useState("")
  const [sections,setSections]=useState<any[]>([])
  const [adTitle,setAdTitle]=useState("")
  const [musicUrl,setMusicUrl]=useState<string|null>(null)
  const [musicName,setMusicName]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({awarenessStage:"problem_aware",adLength:"30 seconds",productId:"",style:"mashup"})
  function setF(k:string,v:string){setForm(x=>({...x,[k]:v}))}

  // Only use clips that have transcripts and are ready
  const usableClips=libraryItems.filter((i:Item)=>
    i.mux_playback_id&&
    i.mux_status==="ready"&&
    (i.transcript||(i.analysis?.scene_tags?.length>0))
  )

  async function generateMash(){
    if(usableClips.length<3){setGenError("Need at least 3 ready clips with transcripts in your library to Auto-Mash.");return}
    setGenerating(true)
    try{
      const clipSummary=usableClips.map((item:Item)=>{
        const a=item.analysis||{}
        return `ID:${item.id}
  type:${item.type}|role:${a.clip_role||item.clip_role||a.label||""}
  transcript:"${(item.transcript||"").substring(0,150)}"
  summary:${(a.summary||"").substring(0,100)}
  tags:${(a.scene_tags||[]).join(", ")}
  key_quotes:${(a.key_quotes||[]).slice(0,2).join(" | ")}
  duration:${item.duration_seconds||5}s
  creator:${item.creator||"unknown"}`
      }).join("\n\n")

      const stage=STAGES.find(s=>s.value===form.awarenessStage)||STAGES[0]
      const prod=products.find((x:any)=>String(x.id)===String(form.productId))||null

      const prompt=`You are an expert direct response video editor. Assemble a complete ${form.adLength} mashup ad from these existing creator clips.

BRAND: ${brand.name||"Unknown"}
PRODUCT: ${prod?.name||"General"}
AWARENESS STAGE: ${stage.label} — ${stage.desc}
STYLE: ${form.style}

AVAILABLE CLIPS:
${clipSummary}

RULES:
1. Select 6-12 clips that together tell a complete direct response story
2. Structure: HOOK → PROBLEM → AGITATE → SOLUTION → SOCIAL PROOF → CTA
3. Each selected clip must use its ORIGINAL AUDIO — no voiceover will be added
4. Choose clips whose spoken words FLOW LOGICALLY when cut together
5. The transcript of consecutive clips should make narrative sense
6. Prefer clips with complete sentences — avoid clips that end mid-thought
7. Each clip should be 2-6 seconds of the original video
8. Mix creators for variety where it makes sense
9. The total should be approximately ${form.adLength}

Return ONLY valid JSON:
{
  "sections": [
    {
      "type": "HOOK|PROBLEM|AGITATE|SOLUTION|SOCIAL PROOF|CTA",
      "selectedClipId": "clip_uuid",
      "clipSegments": [{"id":"seg-0-0","clipId":"clip_uuid","trimStart":null,"trimEnd":null}],
      "spokenWords": "exact transcript words from this clip",
      "visualDirection": "what is shown on screen",
      "muted": false,
      "reasoning": "why this clip works here"
    }
  ],
  "suggested_title": "short descriptive title",
  "narrative_flow": "brief description of the story being told"
}`

      const raw=await callClaude([{role:"user",content:prompt}],2000)
      const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
      const validIds=new Set(libraryItems.map((i:Item)=>i.id))
      const validSections=(data.sections||[]).filter((s:any)=>s.selectedClipId&&validIds.has(s.selectedClipId))
      setSections(validSections.map((s:any,i:number)=>({
        ...s,
        id:Date.now()+i,
        matchedClipIds:[s.selectedClipId],
        autoSelected:true,
        clipSegments:s.clipSegments||[{id:"seg-"+i+"-0",clipId:s.selectedClipId,trimStart:null,trimEnd:null}],
      })))
      if(data.suggested_title)setAdTitle(data.suggested_title)
      setStep("preview")
    }catch(e:any){setGenError(e.message||"Failed to generate mash — try again")}
    setGenerating(false)
  }

  async function saveMash(){
    setSaving(true)
    const supabaseCheck=createClient()
    const baseTitle=adTitle.trim()||"AutoMash_"+new Date().toLocaleDateString()
    const{data:existing}=await supabaseCheck.from("forged_ads").select("title").ilike("title",baseTitle+"%")
    let version=1
    if(existing&&existing.length>0){const versions=existing.map((a:any)=>{const m=a.title.match(/_v(\d+)$/);return m?parseInt(m[1]):1});version=Math.max(...versions)+1}
    const title=baseTitle.includes("_v")?"":baseTitle+"_v"+version
    const savedAd=await onSaveForgedAd({
      title:title||baseTitle,
      status:"complete",
      mode:"script",
      sections,
      voiceover_url:null,
      voiceover_voice:null,
      music_url:musicUrl,
      music_name:musicName,
      metadata:{awarenessStage:form.awarenessStage,contentType:"Mashup",adLength:form.adLength,autoMash:true}
    })
    if(savedAd?.id){
      fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:savedAd.id})}).catch(console.error)
    }
    setSaving(false)
    onGoToForged()
  }

  if(step==="config")return<div style={{maxWidth:700,margin:"0 auto",padding:40}}>
    <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:24,fontSize:14}}>← Back</button>
    <STitle size={24} mb={6}>⚡ Auto-Mash from Library</STitle>
    <div style={{color:C.muted,fontSize:14,marginBottom:32,lineHeight:1.6}}>AI analyses your clip library and assembles a complete direct response ad using your creators' real voices — no scripting needed.</div>

    {usableClips.length<3&&<div style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:12,padding:"12px 16px",fontSize:13,color:C.yellow,marginBottom:20}}>⚠️ You need at least 3 clips with transcripts. Upload more content first, or wait for AI analysis to complete.</div>}

    <Card style={{marginBottom:16}}>
      <STitle size={14} mb={14}>Ad Parameters</STitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div>
          <Label>Ad Length</Label>
          <select value={form.adLength} onChange={e=>setF("adLength",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}>
            {AD_LENGTHS.map(l=><option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <Label>Product</Label>
          <select value={form.productId} onChange={e=>setF("productId",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}>
            <option value="">General</option>
            {products.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      </div>
      <Label>Awareness Stage</Label>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {STAGES.map(s=>{const active=form.awarenessStage===s.value,sc=STAGE_COLORS[s.value]||C.accent;return<div key={s.value} onClick={()=>setF("awarenessStage",s.value)} style={{background:active?sc+"22":C.surface,border:"2px solid "+(active?sc:C.border),borderRadius:10,padding:"10px 12px",cursor:"pointer"}}><div style={{fontWeight:700,fontSize:13,color:active?sc:C.text,marginBottom:2}}>{s.label}</div><div style={{fontSize:11,color:C.muted}}>{s.desc}</div></div>})}
      </div>
      <Label>Style</Label>
      <div style={{display:"flex",gap:8}}>
        {["mashup","ugc-only","testimonial-wall"].map(s=><button key={s} onClick={()=>setF("style",s)} style={{flex:1,background:form.style===s?C.accent:C.surface,color:form.style===s?"#fff":C.muted,border:"1.5px solid "+(form.style===s?C.accent:C.border),borderRadius:50,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>{s==="mashup"?"🎬 Mashup":s==="ugc-only"?"📱 UGC Only":"⭐ Testimonials"}</button>)}
      </div>
    </Card>

    <div style={{background:C.accentSoft,border:"1.5px solid "+C.accent,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.accent,marginBottom:20}}>
      ✦ {usableClips.length} clips ready in your library — AI will pick the best combination
    </div>

    {genError&&<div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#DC2626",marginBottom:16}}>⚠️ {genError}</div>}
    <Btn onClick={()=>{setGenError("");generateMash()}} disabled={generating||usableClips.length<3} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12}}>
      {generating?"⏳ AI is assembling your ad…":"⚡ Generate Auto-Mash"}
    </Btn>
  </div>

  return<div style={{maxWidth:900,margin:"0 auto",padding:28}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
      <div>
        <button onClick={()=>setStep("config")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:8,fontSize:14,display:"block"}}>← Regenerate</button>
        <STitle size={20} mb={4}>⚡ Your Auto-Mash</STitle>
        <div style={{fontSize:13,color:C.muted}}>{sections.length} clips assembled · original audio</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={generateMash} disabled={generating} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44"}}>{generating?"⏳ Regenerating…":"🔄 Regenerate"}</Btn>
        <Btn onClick={saveMash} disabled={saving} style={{background:C.green,color:"#fff",fontWeight:700}}>{saving?"💾 Saving…":"✓ Save & Render"}</Btn>
      </div>
    </div>

    <div style={{marginBottom:16}}>
      <Label>Ad Title</Label>
      <input value={adTitle} onChange={e=>setAdTitle(e.target.value)} placeholder="Auto-Mash title…" style={{background:C.surface,border:"1.5px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box" as const}}/>
    </div>

    <div style={{marginBottom:20}}>
      <MusicPicker suggestedMood="Uplifting" onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
    </div>

    <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
      <ScriptTable sections={sections} onChange={setSections} libraryItems={libraryItems} readOnly={false} brandName={brand.name} productName={""} voiceoverUrl={null}/>
    </Card>

    <StitchedPreview sections={sections} libraryItems={libraryItems} voiceoverUrl={null} musicUrl={musicUrl}/>
  </div>
}


// ── B-Roll Mode ───────────────────────────────────────────────────────────
function BRollMode({libraryItems,onSaveForgedAd,onBack}:any){
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
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:uploadFile.name,contentType:uploadFile.type,metadata:{title:uploadTitle}})})
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
    }catch(e:any){alert("Upload failed: "+e.message)}
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
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:16,padding:24,maxWidth:700,width:"100%",marginTop:40}}>
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

// ── Clip Segment Player ───────────────────────────────────────────────────
function ClipSegmentPlayer({playbackId,start,end,muted}:{playbackId:string,start:number,end?:number,muted:boolean}){
  const vidRef=useRef<HTMLVideoElement>(null)
  const [playing,setPlaying]=useState(false)
  const src=`https://stream.mux.com/${playbackId}/capped-1080p.mp4`

  useEffect(()=>{
    const v=vidRef.current;if(!v)return
    function seek(){if(v)v.currentTime=start}
    if(v.readyState>=1)seek();else v.addEventListener("loadedmetadata",seek,{once:true})
  },[src,start])

  function onTimeUpdate(){
    const v=vidRef.current;if(!v)return
    if(end&&v.currentTime>=end){v.pause();v.currentTime=start;setPlaying(false)}
  }

  function toggle(){
    const v=vidRef.current;if(!v)return
    if(playing){v.pause();setPlaying(false)}else{v.play().catch(()=>{});setPlaying(true)}
  }

  return(
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <video ref={vidRef} src={src} playsInline preload="metadata" muted={muted}
        style={{width:"100%",height:"100%",objectFit:"cover"}}
        onTimeUpdate={onTimeUpdate}
        onPlay={()=>setPlaying(true)}
        onPause={()=>setPlaying(false)}/>
      <div onClick={toggle} style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
        {!playing&&<div style={{width:36,height:36,borderRadius:"50%",background:"#000a",border:"2px solid #fff6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>▶</div>}
      </div>
    </div>
  )
}

// ── Trim Slider ───────────────────────────────────────────────────────────
function TrimSlider({item,trimStart,trimEnd,onUpdate}:any){
  const dur=item.duration_seconds||30
  const start=trimStart??item.start_seconds??0
  const end=trimEnd??item.end_seconds??dur
  const vidRef=useRef<HTMLVideoElement>(null)
  const [scrub,setScrub]=useState(start)

  function preview(t:number){
    const v=vidRef.current;if(!v)return
    v.currentTime=t;setScrub(t)
  }

  return<div style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:10,padding:10,marginBottom:6}}>
    <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Trim clip</div>
    <div style={{position:"relative",paddingTop:"56.25%",background:"#111",borderRadius:7,overflow:"hidden",marginBottom:8}}>
      <video ref={vidRef} src={`https://stream.mux.com/${item.mux_playback_id}/capped-1080p.mp4`} playsInline preload="metadata" muted style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
    </div>
    <div style={{marginBottom:6}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginBottom:3}}>
        <span>In: {start.toFixed(1)}s</span>
        <span>Out: {end.toFixed(1)}s</span>
        <span>Dur: {(end-start).toFixed(1)}s</span>
      </div>
      <input type="range" min={0} max={dur} step={0.1} value={start} onChange={e=>{const v=parseFloat(e.target.value);preview(v);onUpdate({trimStart:v,trimEnd:Math.max(v+0.5,end)})}} style={{width:"100%",accentColor:C.accent,marginBottom:4}}/>
      <input type="range" min={0} max={dur} step={0.1} value={end} onChange={e=>{const v=parseFloat(e.target.value);preview(v);onUpdate({trimStart:Math.min(start,v-0.5),trimEnd:v})}} style={{width:"100%",accentColor:"#DC2626"}}/>
    </div>
    <div style={{display:"flex",gap:4}}>
      <button onClick={()=>onUpdate({trimStart:item.start_seconds??0,trimEnd:item.end_seconds??dur})} style={{flex:1,background:C.accentSoft,color:C.accent,border:"none",borderRadius:6,padding:"4px",cursor:"pointer",fontSize:9,fontWeight:700}}>Reset</button>
      <button onClick={()=>preview(start)} style={{flex:1,background:C.surface,color:C.muted,border:"1.5px solid "+C.border,borderRadius:6,padding:"4px",cursor:"pointer",fontSize:9}}>Preview In</button>
      <button onClick={()=>preview(end-0.5)} style={{flex:1,background:C.surface,color:C.muted,border:"1.5px solid "+C.border,borderRadius:6,padding:"4px",cursor:"pointer",fontSize:9}}>Preview Out</button>
    </div>
  </div>
}

// ── Trim Editor Modal ─────────────────────────────────────────────────────
function TrimEditorModal({item,trimStart,trimEnd,originalDuration,onSave,onClose}:any){
  const fullDur=originalDuration||item.duration_seconds||30
  // If clip is a sub-clip, the playback ID belongs to the original — use it
  const playbackId=item.mux_playback_id
  const [inPt,setInPt]=useState(trimStart??item.start_seconds??0)
  const [outPt,setOutPt]=useState(trimEnd??item.end_seconds??(item.start_seconds||0)+(item.duration_seconds||5))
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
        <div style={{background:C.accentSoft,border:"1px solid "+C.border,borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,color:C.accent}}>{selDur.toFixed(1)}s selected</div>
        <button onClick={onClose} style={{background:"none",border:"1px solid "+C.border,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,color:C.muted,fontFamily:"inherit"}}>Cancel</button>
        <button onClick={()=>onSave({trimStart:inPt,trimEnd:outPt})} style={{background:C.accent,color:"#fff",border:"none",borderRadius:50,padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>Save Trim</button>
      </div>
      <div style={{background:"#000",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",maxHeight:340,overflow:"hidden"}}>
        <video ref={vidRef} playsInline preload="auto" muted style={{maxHeight:340,width:"100%",objectFit:"contain",display:"block",cursor:"pointer"}} onClick={togglePlay}/>
        {!playing&&<div onClick={togglePlay} style={{position:"absolute",width:56,height:56,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"2px solid rgba(255,255,255,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#fff",cursor:"pointer"}}>▶</div>}
        <div style={{position:"absolute",bottom:10,right:12,background:"rgba(0,0,0,0.7)",color:"#fff",fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:5}}>{curTime.toFixed(1)}s / {fullDur.toFixed(1)}s</div>
      </div>
      <div style={{padding:"16px 20px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:6}}>
          <span style={{color:C.green,fontWeight:700}}>In: {inPt.toFixed(2)}s</span>
          <span style={{color:C.accent,fontWeight:700}}>Duration: {selDur.toFixed(2)}s</span>
          <span style={{color:"#DC2626",fontWeight:700}}>Out: {outPt.toFixed(2)}s</span>
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
          {Array.from({length:6},(_,ti)=><span key={ti}>{((ti/5)*fullDur).toFixed(0)}s</span>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>seekTo(inPt)} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>⏮ In</button>
          <button onClick={togglePlay} style={{background:C.accent,color:"#fff",border:"none",borderRadius:50,padding:"9px 0",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",flex:1}}>{playing?"⏸ Pause":"▶ Play Selection"}</button>
          <button onClick={()=>seekTo(outPt-0.1)} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Out ⏭</button>
          <button onClick={()=>{setInPt(item.start_seconds??0);setOutPt(item.end_seconds??(item.start_seconds||0)+(item.duration_seconds||fullDur))}} style={{background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Reset</button>
        </div>
      </div>
    </div>
  </div>
}

// ── Script Table (Horizontal) ─────────────────────────────────────────────
function ScriptTable({sections,onChange,libraryItems,readOnly,brandName,productName,brandVoice,voiceoverUrl}:any){
  const [pickerIdx,setPickerIdx]=useState<number|null>(null)
  const [fillingIdx,setFillingIdx]=useState<number|null>(null)
  const [trimModalData,setTrimModalData]=useState<any>(null)
  const [trimModal,setTrimModal]=useState<any>(null)
  const [mutedClips,setMutedClips]=useState<Record<number,boolean>>(()=>{
    if(!voiceoverUrl)return{}
    const m:Record<number,boolean>={}
    ;(sections||[]).forEach((_:any,i:number)=>{m[i]=true})
    return m
  })
const [allMuted,setAllMuted]=useState(!!voiceoverUrl)
  // Bake initial mute state into sections when voiceover is present
  useEffect(()=>{
    if(voiceoverUrl&&sections.length>0&&!sections[0].hasOwnProperty('muted')){
      onChange(sections.map((s:any)=>({...s,muted:true})))
    }
  },[voiceoverUrl])
  function updM(idx:number,obj:any){onChange(sections.map((s:any,i:number)=>i===idx?{...s,...obj}:s))}
  function upd(idx:number,key:string,val:any){onChange(sections.map((s:any,i:number)=>i===idx?{...s,[key]:val}:s))}
  function addRow(){onChange([...sections,{id:Date.now(),type:"BODY",spokenWords:"",visualDirection:"",matchedClipIds:[],selectedClipId:null,autoSelected:false}])}
  function removeRow(idx:number){onChange(sections.filter((_:any,i:number)=>i!==idx))}
  function move(idx:number,dir:number){const a=[...sections],t=idx+dir;if(t<0||t>=a.length)return;[a[idx],a[t]]=[a[t],a[idx]];onChange(a)}
  function toggleMuteAll(){
  const next=!allMuted;setAllMuted(next)
  const m:Record<number,boolean>={}
  sections.forEach((_:any,i:number)=>{m[i]=next})
  setMutedClips(m)
  onChange(sections.map((s:any,i:number)=>({...s,muted:next})))
}
function toggleMuteClip(idx:number){
  const next=!mutedClips[idx]
  setMutedClips(prev=>({...prev,[idx]:next}))
  updM(idx,{muted:next})
}

  async function autofillRow(idx:number){
    const row=sections[idx];setFillingIdx(idx)
    try{
      const ctx=sections.map((s:any,i:number)=>`[${i===idx?"→ THIS":"  "}] ${s.type}: ${(s.spokenWords||"(empty)").substring(0,60)}`).join("\n")
      const raw=await callClaude([{role:"user",content:`Write a ${row.type} section for a direct response video ad.\nBrand: ${brandName||"Unknown"}\nProduct: ${productName||"Unknown"}\nBrand voice & tone: ${brandVoice||"persuasive, direct, conversational"}\n\nScript context:\n${ctx}\n\nIMPORTANT: Match the brand voice exactly. Keep copy punchy and direct-response focused.\nReturn ONLY JSON: {"spokenWords":"exact words to be spoken","visualDirection":"what is shown on screen"}`}],500)
      const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
      updM(idx,{spokenWords:data.spokenWords||row.spokenWords,visualDirection:data.visualDirection||row.visualDirection})
    }catch(e){console.error(e)}
    setFillingIdx(null)
  }

  return<div>
    {trimModalData&&<TrimEditorModal
    item={trimModalData.segClip}
    trimStart={trimModalData.seg.trimStart}
    trimEnd={trimModalData.seg.trimEnd}
    originalDuration={libraryItems.find((i:Item)=>i.id===trimModalData.segClip.parent_id)?.duration_seconds||trimModalData.segClip.duration_seconds||30}
    onSave={(updates:any)=>{
      const {idx,segIdx}=trimModalData
      const currentSegs=sections[idx]?.clipSegments&&sections[idx].clipSegments.length>0?sections[idx].clipSegments:[{id:"seg-"+idx+"-0",clipId:sections[idx]?.selectedClipId}]
      const newSegs=currentSegs.map((s:any,si:number)=>si===segIdx?{...s,...updates}:s)
      onChange(sections.map((s:any,i:number)=>i===idx?{...s,clipSegments:newSegs}:s))
      setTrimModalData(null)
    }}
    onClose={()=>setTrimModalData(null)}
  />}
   {pickerIdx!==null&&<ClipPickerModal 
    currentId={pickerIdx>=1000?sections[Math.floor(pickerIdx/1000)]?.clipSegments?.[pickerIdx%1000]?.clipId:sections[pickerIdx]?.selectedClipId} 
    matchedIds={sections[Math.floor(pickerIdx>=1000?pickerIdx/1000:pickerIdx)]?.matchedClipIds||[]}
    matchReason={sections[Math.floor(pickerIdx>=1000?pickerIdx/1000:pickerIdx)]?.matchReason||""}
    libraryItems={libraryItems} 
    sectionLabel={sections[Math.floor(pickerIdx>=1000?pickerIdx/1000:pickerIdx)]?.type||""} 
    onSelect={(id:string)=>{
      const secIdx=pickerIdx>=1000?Math.floor(pickerIdx/1000):pickerIdx
      const segIdx=pickerIdx>=1000?pickerIdx%1000:0
      const currentSegs=sections[secIdx]?.clipSegments&&sections[secIdx].clipSegments.length>0?sections[secIdx].clipSegments:[{id:`seg-${secIdx}-0`,clipId:sections[secIdx]?.selectedClipId||null}]
      const newSegs=currentSegs.map((seg:any,si:number)=>si===segIdx?{...seg,clipId:id}:seg)
      onChange(sections.map((s:any,i:number)=>i===secIdx?{...s,clipSegments:newSegs,selectedClipId:newSegs[0]?.clipId||id,autoSelected:false}:s))
    }} 
    onClose={()=>setPickerIdx(null)}/>}
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",background:C.surface,borderBottom:"1px solid "+C.border}}>
      <span style={{fontSize:12,color:C.muted,fontWeight:600}}>{sections.length} sections</span>
      {(()=>{const total=sections.reduce((acc:number,s:any)=>{const m=(s.durationEstimate||"").match(/(\d+)/);return acc+(m?parseInt(m[1]):0)},0);return total>0?<span style={{fontSize:12,color:C.accent,fontWeight:600,background:C.accentSoft,padding:"2px 8px",borderRadius:99}}>~{total}s</span>:null})()}
      {voiceoverUrl&&<div style={{fontSize:11,color:C.green}}>🎙️ Voiceover active</div>}
      <div style={{flex:1}}/>
      <button onClick={toggleMuteAll} style={{background:allMuted?"#ef444422":C.accentSoft,border:"1px solid "+(allMuted?"#ef444466":C.accent+"44"),color:allMuted?"#ef4444":C.accent,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>{allMuted?"🔇 All Muted":"🔊 Mute All"}</button>
    </div>
    <div style={{overflowX:"auto",paddingBottom:8}}>
      <div style={{display:"flex",gap:0,minWidth:"max-content"}}>
        {sections.map((row:any,idx:number)=>{
          const sc=secColor(row.type)
          const selectedClip=row.selectedClipId?libraryItems.find((i:Item)=>i.id===row.selectedClipId):null
          const alternatives=(row.matchedClipIds||[]).filter((id:string)=>id!==row.selectedClipId).slice(0,3).map((id:string)=>libraryItems.find((i:Item)=>i.id===id)).filter(Boolean)
          const isMuted=mutedClips[idx]||false
          const isFilling=fillingIdx===idx
          return<div key={row.id||idx} style={{display:"flex",flexDirection:"column",width:240,flexShrink:0,borderRight:"1px solid "+C.border}}>
            <div style={{background:sc.bg,borderBottom:"1px solid "+sc.bd,padding:"8px 12px",display:"flex",alignItems:"center",gap:6}}>
              {readOnly?<span style={{background:sc.bg,color:sc.color,fontSize:10,fontWeight:800,border:"1px solid "+sc.bd,padding:"2px 8px",borderRadius:5}}>{row.type}</span>:<select value={row.type} onChange={e=>upd(idx,"type",e.target.value)} style={{background:"transparent",color:sc.color,border:"none",fontSize:10,fontWeight:800,outline:"none",cursor:"pointer"}}>{SEC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>}
              {row.durationEstimate&&<span style={{fontSize:9,color:C.muted,marginLeft:"auto"}}>{row.durationEstimate}</span>}
              {!readOnly&&<div style={{display:"flex",gap:3,marginLeft:"auto"}}>
                <button onClick={()=>move(idx,-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"1px 3px"}}>←</button>
                <button onClick={()=>move(idx,1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"1px 3px"}}>→</button>
                <button onClick={()=>autofillRow(idx)} disabled={!!isFilling} style={{background:"none",border:"none",color:isFilling?C.muted:C.accent,cursor:"pointer",fontSize:11,padding:"1px 3px"}}>{isFilling?"⏳":"✨"}</button>
                <button onClick={()=>removeRow(idx)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:"1px 3px"}}>×</button>
              </div>}
            </div>
            <div style={{background:C.bg,padding:10}}>
              {/* Multi-clip segments */}
              {(row.clipSegments||[{id:`seg-${idx}-0`,clipId:row.selectedClipId||null}]).map((seg:any,segIdx:number)=>{
                const segClip=seg.clipId?libraryItems.find((i:Item)=>i.id===seg.clipId):null
                return<div key={seg.id||segIdx} style={{marginBottom:8,border:"1px solid "+C.border,borderRadius:8,overflow:"hidden",background:C.bg}}>
                  <div style={{position:"relative",width:"100%",paddingTop:"100%",background:"#E8E6FF",overflow:"hidden"}}>
                    {segClip?.mux_playback_id?<div style={{position:"absolute",inset:0}}><ClipSegmentPlayer playbackId={segClip.mux_playback_id} start={segClip.start_seconds||0} end={segClip.end_seconds} muted={isMuted}/></div>:<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><div style={{fontSize:18}}>🎬</div><div style={{fontSize:9,color:C.muted,textAlign:"center",padding:"0 4px"}}>No clip</div></div>}
                    {segClip&&row.autoSelected&&segIdx===0&&<div style={{position:"absolute",top:4,left:4,background:C.green,color:"#fff",fontSize:7,fontWeight:800,padding:"1px 4px",borderRadius:3}}>AI</div>}
                    {segClip&&<button onClick={()=>toggleMuteClip(idx)} style={{position:"absolute",bottom:4,left:4,background:"rgba(0,0,0,0.5)",border:"none",color:"#fff",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9}}>{isMuted?"🔇":"🔊"}</button>}
                    {!readOnly&&<button onClick={()=>setPickerIdx(idx*1000+segIdx)} style={{position:"absolute",bottom:4,right:4,background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9,fontWeight:700}}>⇄</button>}
                    {segClip&&!readOnly&&<button onClick={e=>{e.stopPropagation();setTrimModalData({segClip,idx,segIdx,seg})}} style={{position:"absolute",top:4,left:4,background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,fontWeight:700}}>✂️</button>}
                    {!readOnly&&segIdx>0&&<button onClick={()=>{const segs=(row.clipSegments||[]).filter((_:any,si:number)=>si!==segIdx);updM(idx,{clipSegments:segs,selectedClipId:segs[0]?.clipId||null})}} style={{position:"absolute",top:4,right:4,background:"rgba(220,38,38,0.8)",color:"#fff",border:"none",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9}}>✕</button>}
                  </div>
                  {segClip&&<div style={{padding:"4px 6px",fontSize:9,color:C.text,fontWeight:600,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:1,WebkitBoxOrient:"vertical" as any}}>{segClip.title}</div>}
                </div>
              })}
              {/* Add clip button */}
              {!readOnly&&<button onClick={()=>{
                const currentSegs=row.clipSegments&&row.clipSegments.length>0?row.clipSegments:[{id:`seg-${idx}-0`,clipId:row.selectedClipId||null}]
                const newSeg={id:`seg-${idx}-${Date.now()}`,clipId:null}
                updM(idx,{clipSegments:[...currentSegs,newSeg]})
                setPickerIdx(idx*1000+currentSegs.length)
              }} style={{width:"100%",background:C.accentSoft,border:"1.5px dashed "+C.accent,color:C.accent,borderRadius:7,padding:"5px",cursor:"pointer",fontSize:10,fontWeight:700,marginBottom:8}}>+ Add clip to section</button>}
              {!readOnly&&!(row.clipSegments?.length>0||row.selectedClipId)&&(row.matchedClipIds||[]).length>0&&<button onClick={()=>setPickerIdx(idx*1000)} style={{width:"100%",background:"#FFFBEB",border:"1px solid #FCD34D",color:C.yellow,borderRadius:7,padding:"5px",cursor:"pointer",fontSize:11,fontWeight:600,marginBottom:8}}>+ Pick ({row.matchedClipIds.length} matched)</button>}
              {alternatives.length>0&&<div><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Alternatives</div><div style={{display:"flex",gap:5}}>{alternatives.map((alt:Item)=><div key={alt.id} title={alt.title} onClick={()=>!readOnly&&updM(idx,{selectedClipId:alt.id,autoSelected:false})} style={{flex:1,position:"relative",paddingTop:"177.78%",background:"#111",borderRadius:6,overflow:"hidden",cursor:readOnly?"default":"pointer",border:"2px solid "+(alt.id===row.selectedClipId?C.accent:C.border)}}>{alt.mux_playback_id?<img src={muxThumb(alt.mux_playback_id,alt.thumbnail_time||alt.start_seconds||0)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🎬</div>}</div>)}</div></div>}
            </div>
            <div style={{padding:"10px 12px",background:C.surface,borderTop:"1px solid "+C.border,flex:1}}>
              {isFilling?<div style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>AI writing…</div>
              :readOnly?<><div style={{fontSize:13,lineHeight:1.7,marginBottom:6,whiteSpace:"pre-wrap"}}>{row.spokenWords}</div>{row.visualDirection&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic",lineHeight:1.5}}>{row.visualDirection}</div>}</>
              :<><textarea value={row.spokenWords||""} onChange={e=>upd(idx,"spokenWords",e.target.value)} placeholder="Spoken words…" style={{width:"100%",background:"transparent",border:"none",resize:"none",color:C.text,fontSize:12,lineHeight:1.7,outline:"none",fontFamily:"inherit",minHeight:70,boxSizing:"border-box",marginBottom:4}}/><textarea value={row.visualDirection||""} onChange={e=>upd(idx,"visualDirection",e.target.value)} placeholder="Visual direction…" style={{width:"100%",background:"transparent",border:"none",resize:"none",color:C.muted,fontSize:11,lineHeight:1.5,outline:"none",fontFamily:"inherit",minHeight:40,boxSizing:"border-box"}}/></>}
            </div>
          </div>
        })}
        {!readOnly&&<div style={{width:60,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}><button onClick={addRow} style={{background:"none",border:"2px dashed "+C.border,color:C.muted,borderRadius:10,width:44,height:44,cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button></div>}
      </div>
    </div>
  </div>
}

// ── Clip Picker Modal ─────────────────────────────────────────────────────
function ClipPickerModal({currentId,matchedIds,matchReason,libraryItems,sectionLabel,onSelect,onClose}:any){
  const [search,setSearch]=useState("")
  const matched=libraryItems.filter((i:Item)=>matchedIds.includes(i.id))
  const others=libraryItems.filter((i:Item)=>!matchedIds.includes(i.id))
  const fl=(arr:Item[])=>!search.trim()?arr:arr.filter((i:Item)=>[i.title,i.creator,...(i.analysis?.scene_tags||[])].some((f:any)=>f&&String(f).toLowerCase().includes(search.toLowerCase())))
  return<div onClick={onClose} style={{position:"fixed",inset:0,background:"#000000dd",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:16,padding:24,maxWidth:760,width:"100%",marginTop:40}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><div style={{fontWeight:700,fontSize:17}}>Change Clip</div><div style={{fontSize:13,color:C.muted}}>for <strong style={{color:C.text}}>{sectionLabel}</strong></div></div><Btn onClick={onClose} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px",fontSize:12}}>✕</Btn></div>
      {matchReason&&<div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#15803D",marginBottom:14}}>🎯 AI matched on: {matchReason}</div>}
      <Input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Search…" style={{marginBottom:20}}/>
      {fl(matched).length>0&&<div style={{marginBottom:24}}><div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>🎯 AI-Matched ({fl(matched).length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>{fl(matched).map((item:Item)=><div key={item.id} style={{cursor:"pointer"}} onClick={()=>{onSelect(item.id);onClose()}}><VideoCard item={item} compact={false} highlight={item.id!==currentId} isSelected={item.id===currentId} onClick={()=>{}} selectMode={false} onToggleSelect={()=>{}}/></div>)}</div></div>}
      {fl(others).length>0&&<div><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>All Library ({fl(others).length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>{fl(others).map((item:Item)=><div key={item.id} style={{cursor:"pointer"}} onClick={()=>{onSelect(item.id);onClose()}}><VideoCard item={item} compact={false} isSelected={item.id===currentId} onClick={()=>{}} selectMode={false} onToggleSelect={()=>{}}/></div>)}</div></div>}
      {fl(matched).length===0&&fl(others).length===0&&<div style={{textAlign:"center",padding:40,color:C.muted}}>No clips found.</div>}
    </div>
  </div>
}

// ── Bulk Tag Editor ───────────────────────────────────────────────────────
function BulkTagEditor({selectedIds,items,supabase,onRefresh}:any){
  const [open,setOpen]=useState(false)
  const [tag,setTag]=useState("")
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[])
  async function applyTag(){
    const t=tag.trim();if(!t)return
    for(const id of selectedIds){
      const item=items.find((i:Item)=>i.id===id);if(!item)continue
      const existing=(item.analysis?.scene_tags||[])
      if(existing.includes(t))continue
      const newAnalysis={...(item.analysis||{}),scene_tags:[...existing,t]}
      await supabase.from("items").update({analysis:newAnalysis}).eq("id",id)
    }
    setTag("");setOpen(false);onRefresh()
  }
  return<div ref={ref} style={{position:"relative"}}>
    <Btn onClick={()=>setOpen(!open)} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",padding:"9px 14px"}}>🏷 Tag ({selectedIds.length})</Btn>
    {open&&<div style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:C.surface,border:"1.5px solid "+C.border,borderRadius:12,padding:14,zIndex:200,minWidth:240,boxShadow:"0 8px 24px rgba(0,0,0,0.12)"}}>
      <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>Apply tag to {selectedIds.length} selected</div>
      <div style={{display:"flex",gap:8}}>
        <input value={tag} onChange={e=>setTag(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();applyTag()}}} placeholder="Type tag + Enter" style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,padding:"7px 10px",color:C.text,fontSize:13,outline:"none"}}/>
        <Btn onClick={applyTag} style={{background:C.accent,color:"#fff",padding:"7px 12px"}}>Add</Btn>
      </div>
    </div>}
  </div>
}

// ── Library Tab ───────────────────────────────────────────────────────────
function LibraryTab({items,onRefresh,view,setView,brand,products,forgedAds,onGoToBrand}:{items:Item[],onRefresh:()=>void,view:string,setView:(v:string)=>void,brand:BrandProfile,products:Product[],forgedAds:ForgedAd[],onGoToBrand:()=>void}){
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

  function addFiles(files:File[]){
    const newEntries=files.map(file=>({
      id:Date.now()+Math.random(),
      file,
      title:file.name.replace(/\.[^/.]+$/,"").replace(/[_-]+/g," "),
      creator:"",
      creatorAge:"",
      creatorGender:"",
      autoClip:autoClipEnabled,
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
          const proceed=window.confirm(`"${entry.title}" appears to be a duplicate of "${dupeTitle}" (same duration: ${videoDuration.toFixed(1)}s). Upload anyway?`)
          if(!proceed){updateQueue(idx,{status:"pending",progress:0,msg:""});return}
        }
      }
    }catch(e){/* continue with upload if check fails */}

    updateQueue(idx,{status:"uploading",progress:5,msg:"Creating record…"})

    try{
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:entry.file.name,contentType:entry.file.type,metadata:{title:entry.title,creator:entry.creator,creatorAge:entry.creatorAge,creatorGender:entry.creatorGender,autoClip:entry.autoClip!==false}})})
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
      // Poll briefly to catch duplicate detection
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
      updateQueue(idx, {status: finalStatus, progress: 100, msg: finalStatus === 'duplicate' ? 'Duplicate blocked' : 'Done! ✓'})
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
  async function bulkDelete(){setDeleting(true);const gone=new Set(selectedIds);selectedIds.forEach(id=>{const item=items.find(i=>i.id===id);(item?.clip_ids||[]).forEach(cid=>gone.add(cid))});await supabase.from("items").delete().in("id",Array.from(gone));onRefresh();setSelectMode(false);setSelectedIds([]);setDeleting(false)}
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

  if(view==="add")return<div style={{maxWidth:860,margin:"0 auto",padding:28}}>
    <button onClick={()=>setView("grid")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to Library</button>
    <STitle size={22}>Add Content</STitle>
    <div style={{color:C.muted,fontSize:14,marginBottom:24}}>Upload one or more videos. AI will automatically transcribe, analyse, and create clips from each one.</div>

    {/* Drop zone */}
    <div onDrop={e=>{e.preventDefault();setDragOver(false);const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("video/"));if(files.length>0)addFiles(files)}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileRef.current?.click()} style={{border:"2px dashed "+(dragOver?C.accent:C.border),borderRadius:14,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragOver?C.accentSoft:C.surface,marginBottom:20,transition:"all 0.15s"}}>
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
          <div style={{background:C.card,border:"1.5px solid "+C.border,borderRadius:14,padding:20,marginBottom:12}}>
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
          {uploadQueue.filter((e:any)=>e.status==="error").map((entry:any,idx:number)=><div key={entry.id} style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:10,padding:"10px 14px",marginBottom:8,fontSize:12,color:C.red}}>❌ {entry.title} — {entry.msg}</div>)}
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
       <button onClick={onGoToBrand} style={{background:C.yellow,color:"#fff",border:"none",borderRadius:50,padding:"7px 16px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Set up Brand →</button>
      </div>}
      {brand?.name&&(!products||products.length===0)&&<div style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:13,color:"#2563EB",marginBottom:4}}>💡 Add your products while you wait</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Products let AI create targeted scripts with specific benefits, claims, and pricing.</div>
       <button onClick={()=>{onRefresh();setView("grid");}} style={{background:"#2563EB",color:"#fff",border:"none",borderRadius:50,padding:"7px 16px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Add Products →</button>
      </div>}
    </div>}
  </div>

  if(view==="detail"&&selected){
    const a=selected.analysis||{}
    const clips=selected.type==="original"&&selected.clip_ids?items.filter(i=>selected.clip_ids!.includes(i.id)):[]
    const adPotColor=a.ad_potential==="High"?C.green:a.ad_potential==="Medium"?C.yellow:C.red
    return<div style={{maxWidth:860,margin:"0 auto",padding:28}}>
      <button onClick={()=>{setSelected(null);setView("grid")}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to Library</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,gap:16}}>
        <div><Chip label={selected.type==="clip"?"CLIP":(a.content_type||"Untagged")} color={selected.type==="clip"?typeColor("Clip"):undefined}/><div style={{fontWeight:800,fontSize:22,marginTop:8,marginBottom:4}}>{selected.title}</div><div style={{color:C.muted,fontSize:13,display:"flex",gap:12,flexWrap:"wrap"}}>{selected.duration_seconds&&<span>⏱ {fmt(selected.duration_seconds)}</span>}{selected.creator&&<span>👤 {selected.creator}{selected.creator_age?` · ${selected.creator_age}`:""}</span>}{selected.created_at&&<span>Added {new Date(selected.created_at).toLocaleDateString()}</span>}</div></div>
        <Btn onClick={async()=>{
          if(!window.confirm("Delete this "+(selected.type==="clip"?"clip":"video and all its clips")+"?"))return
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
      {selected.transcript&&<Card style={{marginBottom:12}}><div style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>📝 Auto-Transcript</div><div style={{fontSize:13,lineHeight:1.7,color:C.muted,maxHeight:120,overflowY:"auto"}}>{selected.transcript}</div></Card>}
      {a.key_quotes?.length>0&&<Card style={{marginBottom:12}}><Label>Key Quotes</Label>{a.key_quotes.map((q:string,i:number)=><div key={i} style={{borderLeft:"3px solid "+C.accent,paddingLeft:12,marginBottom:8,fontSize:14,fontStyle:"italic"}}>"{q}"</div>)}</Card>}
      {a.ad_notes&&<Card style={{background:adPotColor+"18",border:"1px solid "+adPotColor+"44",marginBottom:12}}><div style={{fontWeight:700,fontSize:11,color:adPotColor,marginBottom:6}}>📢 AD USAGE</div><div style={{fontSize:14,lineHeight:1.6}}>{a.ad_notes}</div></Card>}
     {selected.type==="original"&&clips.length===0&&selected.mux_status==="ready"&&<Card style={{marginBottom:12,background:"#FFFBEB",border:"1.5px solid #FCD34D"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:C.yellow,marginBottom:2}}>⚠️ No clips generated</div>
            <div style={{fontSize:11,color:C.muted}}>This may have happened due to low AI credits. Re-analyse to generate clips.</div>
          </div>
          <Btn onClick={async()=>{
            await supabase.from("items").update({mux_status:"analysing"}).eq("id",selected.id)
            await fetch("/api/items/reanalyse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:selected.id})})
            onRefresh()
          }} style={{background:C.yellow,color:"#fff",fontSize:12,padding:"7px 16px"}}>Re-analyse</Btn>
        </div>
      </Card>}
      {clips.length>0&&<div style={{marginTop:24}}><STitle>✂️ Auto-Generated Clips ({clips.length})</STitle><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}>{clips.map(c=>{const usedCount=(forgedAds||[]).filter((ad:ForgedAd)=>(ad.sections||[]).some((s:any)=>s.selectedClipId===c.id||(s.clipSegments||[]).some((seg:any)=>seg.clipId===c.id))).length;return<div key={c.id}><VideoCard item={c} onClick={()=>setSelected(c)} selectMode={false} isSelected={false} onToggleSelect={()=>{}}/>{usedCount>0&&<div style={{fontSize:10,color:C.accent,fontWeight:600,marginTop:4,textAlign:"center"}}>Used in {usedCount} ad{usedCount!==1?"s":""}</div>}</div>})}</div></div>}
    </div>
  }

  const originals=items.filter(i=>i.type==="original")
  const categoryGroups:Record<string,Item[]>={}
  CONTENT_CATEGORIES.forEach(cat=>{const g=originals.filter(i=>i.analysis?.content_type===cat);if(g.length>0)categoryGroups[cat]=g})
  const uncategorised=originals.filter(i=>!i.analysis?.content_type||!CONTENT_CATEGORIES.includes(i.analysis.content_type))
  if(uncategorised.length>0)categoryGroups["Uncategorised"]=uncategorised
  const hasActiveFilters=activeFilterCount>0||search.trim()||filter!=="All"

  return<div style={{padding:20}}>
    <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <input placeholder="Search titles, creators, tags…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180,background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none"}}/>
      <div style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{items.filter(i=>i.type==="original").length} videos · {items.filter(i=>i.type==="clip").length} clips</div>
      <select value={sortIdx} onChange={e=>setSortIdx(Number(e.target.value))} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:13,outline:"none",cursor:"pointer"}}>{SORTS.map((s,i)=><option key={i} value={i}>{s}</option>)}</select>
      {!selectMode&&<Btn onClick={()=>setSelectMode(true)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"9px 14px"}}>Select</Btn>}
      {selectMode&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <Btn onClick={()=>setSelectedIds(filtered.map(i=>i.id))} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",padding:"9px 14px"}}>Select All ({filtered.length})</Btn>
        {selectedIds.length>0&&<BulkTagEditor selectedIds={selectedIds} items={items} supabase={supabase} onRefresh={onRefresh}/>}
        <Btn onClick={bulkDelete} disabled={selectedIds.length===0||deleting} style={{background:selectedIds.length>0?"#ef444433":C.border,color:selectedIds.length>0?"#ef4444":C.muted,border:"1px solid "+(selectedIds.length>0?"#ef444466":C.border)}}>Delete ({selectedIds.length})</Btn>
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
            {catItems.some(i=>i.clip_ids?.length)&&<div style={{marginTop:16,borderTop:"1px solid "+C.border,paddingTop:14}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>✂️ Clips from {cat}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10}}>{catItems.flatMap(i=>i.clip_ids||[]).map(clipId=>{const clip=items.find(i=>i.id===clipId);if(!clip)return null;return<VideoCard key={clip.id} item={clip} onClick={()=>{setSelected(clip);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(clip.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(clip.id)?prev.filter(x=>x!==clip.id):[...prev,clip.id])}/>})}</div>
            </div>}
          </div>}
        </div>
      })}
      <div style={{borderTop:"1px solid "+C.border,paddingTop:20,marginTop:8}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:16}}>📋 All Content</div></div>
    </div>}
    {filtered.length===0?<div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}><div style={{fontSize:44,marginBottom:14}}>🎬</div><div style={{fontSize:17,fontWeight:600,color:C.text,marginBottom:6}}>{items.length===0?"Your library is empty":"No results"}</div><div style={{fontSize:13,color:C.muted,marginBottom:20}}>{items.length===0?"Upload your first video to get started.":"Try adjusting your search or filters."}</div>{items.length===0&&<Btn onClick={()=>setView("add")} style={{background:C.accent,color:"#fff"}}>+ Add First Content</Btn>}{activeFilterCount>0&&<Btn onClick={clearFilters} style={{background:C.surface,color:C.muted,border:"1px solid "+C.border}}>Clear Filters</Btn>}</div>
    :<><div style={{fontSize:12,color:C.muted,marginBottom:12,display:hasActiveFilters?"block":"none"}}>Showing {filtered.length} result{filtered.length!==1?"s":""}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14}}>{filtered.map(item=><VideoCard key={item.id} item={item} onClick={()=>{setSelected(item);setView("detail")}} selectMode={selectMode} isSelected={selectedIds.includes(item.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(item.id)?prev.filter(x=>x!==item.id):[...prev,item.id])}/>)}</div></>}
  </div>
}

// ── Scripts Tab ───────────────────────────────────────────────────────────
function ScriptsTab({scripts,items,brand,products,onSaveScripts,onSaveForgedAd,onGoToForged,startAtChooseMode}:any){
  const [view,setView]=useState("list")  // list | chooseMode | generate | broll | review | detail
  useEffect(()=>{if(startAtChooseMode>0)setView("chooseMode")},[startAtChooseMode])
  const [selected,setSelected]=useState<Script|null>(null)
  const [sections,setSections]=useState<any[]>([])
  const [genMeta,setGenMeta]=useState<any>(null)
  const [generating,setGenerating]=useState(false)
  const [genError,setGenError]=useState("")
  const [genStatus,setGenStatus]=useState("")
  const [matching,setMatching]=useState(false)
  const [step,setStep]=useState<"script"|"audio"|"clips"|"forge">("script")
  const [voiceoverUrl,setVoiceoverUrl]=useState<string|null>(null)
  const [voiceoverVoice,setVoiceoverVoice]=useState<string|null>(null)
  const [musicUrl,setMusicUrl]=useState<string|null>(null)
  const [musicName,setMusicName]=useState<string|null>(null)
  const [suggestedMood,setSuggestedMood]=useState("Uplifting")
  const [adTitle,setAdTitle]=useState("")
  const [hookVariations,setHookVariations]=useState<any[][]>([])
  const [selectedHooks,setSelectedHooks]=useState<number[]>([0])
  const [activeHookIdx,setActiveHookIdx]=useState(0)
  const [hookSections,setHookSections]=useState<Record<number,any[]>>({})
  const [generatingHooks,setGeneratingHooks]=useState(false)
  const [form,setForm]=useState({productId:"",awarenessStage:"problem_aware",contentType:"UGC",adLength:"30 seconds",customerAvatar:"",useAvatarId:"",painPoints:"",desires:"",objections:"",request:""})
  function setF(k:string,v:string){setForm(x=>({...x,[k]:v}))}
  const savedAvatars=(brand?.customer_avatars||[])

  // Draft persistence — save/restore in-progress ad across tab switches
  useEffect(()=>{
    try{
      const saved=localStorage.getItem("adforge_draft")
      if(saved){const d=JSON.parse(saved);if(d.sections?.length>0){setSections(d.sections);setGenMeta(d.genMeta||null);setVoiceoverUrl(d.voiceoverUrl||null);setVoiceoverVoice(d.voiceoverVoice||null);setMusicUrl(d.musicUrl||null);setMusicName(d.musicName||null);setSuggestedMood(d.suggestedMood||"Uplifting");if(d.form)setForm(d.form);if(d.hookVariations?.length>0)setHookVariations(d.hookVariations);if(d.selectedHooks)setSelectedHooks(d.selectedHooks)}}
    }catch(e){}
  },[])
  useEffect(()=>{
    if(sections.length>0&&view==="review"){
      try{localStorage.setItem("adforge_draft",JSON.stringify({sections,genMeta,voiceoverUrl,voiceoverVoice,musicUrl,musicName,suggestedMood,form,step,hookVariations,selectedHooks}))}catch(e){}
    }
  },[sections,voiceoverUrl,musicUrl,step])
  function clearDraft(){try{localStorage.removeItem("adforge_draft")}catch(e){}}

  async function handleGen(){
    setGenerating(true);setGenError("");setGenStatus("✍️ Writing script…")
    try{
      const prod=products.find((x:Product)=>String((x as any).id)===String(form.productId))||null
      const stage=STAGES.find(s=>s.value===form.awarenessStage)||STAGES[0]
      let ctx=`BRAND:\nName: ${brand.name||"Unknown"}\nDesc: ${brand.description||""}\nVoice: ${brand.voice||""}\nCustomer: ${brand.target_customer||""}\nReviews: ${brand.reviews||""}\n\n`
      if(prod)ctx+=`PRODUCT:\nName: ${prod.name}\nDesc: ${prod.description||""}\nBenefits: ${prod.benefits||""}\nClaims: ${prod.claims||""}\n\n`
      const prompt=ctx+`SCRIPT REQ:\nContent type: ${form.contentType}\nLength: ${form.adLength}\nStage: ${stage.label} — ${stage.desc}\nCustomer: ${form.customerAvatar||brand.target_customer||""}\nPains: ${form.painPoints||""}\nDesires: ${form.desires||""}\nObjections: ${form.objections||""}\nRequest: ${form.request||""}\n\nWrite a direct response video ad script. Return ONLY valid JSON:\n{"sections":[{"id":1,"type":"HOOK","spokenWords":"exact words","visualDirection":"what is on screen","durationEstimate":"0-3s"}],"suggested_music_mood":"Uplifting"}\nSection types: HOOK, PROBLEM, AGITATE, SOLUTION, SOCIAL PROOF, CTA.`
      const raw=await callClaude([{role:"user",content:prompt}],2000)
      const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
      let secs=(data.sections||[]).map((s:any,i:number)=>({...s,id:Date.now()+i,matchedClipIds:[],selectedClipId:null,autoSelected:false}))
      if(items.length>0){setGenStatus("🔍 Matching clips to sections…");secs=await matchClips(secs,items)}
      setSuggestedMood(data.suggested_music_mood||"Uplifting")
      setSections(secs);setGenMeta({form,productName:prod?.name||"General"});setView("review");setStep("script")
    }catch(e:any){setGenError(e.message||"Error generating script — please try again.")}
    setGenerating(false);setGenStatus("")
  }

  async function matchClips(secs:any[],libItems:Item[]){
    const clips=libItems.filter(i=>i.mux_playback_id)
    const matchPool=clips.length>0?clips:libItems.filter(i=>i.mux_playback_id)
    const usedIds=new Set<string>()

    const libSummary=matchPool.map(item=>{
      const a=item.analysis||{}
      return "ID:"+item.id+"|role:"+(a.clip_role||item.clip_role||"")+"|label:"+(a.label||"")+"|use:"+(a.use_case||"")+"|tags:"+(a.scene_tags||[]).join(", ")+"|summary:"+(a.summary||item.description||"").substring(0,100)+"|transcript:"+(item.transcript||"").substring(0,80)+"|quality:"+(a.quality_score||"Medium")+"|type:"+item.type
    }).join("\n")

    const sectionDesc=secs.map((s:any,i:number)=>{
      const words=(s.spokenWords||"").trim()
      const visual=(s.visualDirection||"")
      return "Section "+i+" ["+s.type+"]: spoken=\""+words.substring(0,120)+"\" visual=\""+visual.substring(0,60)+"\""
    }).join("\n")

    const prompt="You are an expert direct response video editor for DTC brands.\n\nAnalyse each script section and determine HOW MANY clips it needs to best tell the story visually.\n\nSCRIPT SECTIONS:\n"+sectionDesc+"\n\nCLIP LIBRARY ("+matchPool.length+" clips):\n"+libSummary+"\n\nRULES:\n1. Each section can use 1-4 clips depending on how many distinct visual moments exist in the spoken words\n2. A 30s ad should have roughly 8-15 total clips across all sections\n3. Match clips by VISUAL CONTENT — if script says yellow teeth, find a clip of yellow teeth\n4. Use clip tags, transcript, use_case to find best visual match\n5. NEVER use the same clip twice across the whole ad\n6. For each clip slot, provide 2 alternatives\n\nReturn ONLY valid JSON array — one entry per CLIP SLOT:\n[{\"section\":0,\"slot\":0,\"best_id\":\"clip_uuid\",\"alt_ids\":[\"alt1\",\"alt2\"],\"phrase\":\"specific phrase this clip covers\",\"reason\":\"why this clip matches\"},...]"

    try{
      const raw=await callClaude([{role:"user",content:prompt}],2000)
      const matches=JSON.parse(raw.replace(/```json/g,"").replace(/```/g,"").trim())
      const validIds=new Set(libItems.map(i=>i.id))

      return secs.map((s:any,i:number)=>{
        const sectionMatches=matches.filter((m:any)=>m.section===i)
        if(sectionMatches.length===0){
          return{...s,matchedClipIds:s.matchedClipIds||[],selectedClipId:s.selectedClipId||null,clipSegments:[{id:"seg-"+i+"-0",clipId:s.selectedClipId||null}]}
        }

        const clipSegments=sectionMatches.map((m:any,si:number)=>{
          const candidates=[m.best_id,...(m.alt_ids||[])].filter((id:string)=>id&&validIds.has(id)&&!usedIds.has(id))
          const clipId=candidates[0]||null
          if(clipId)usedIds.add(clipId)
          return{id:"seg-"+i+"-"+si,clipId,phrase:m.phrase||"",reason:m.reason||""}
        }).filter((seg:any)=>seg.clipId)

        const allMatchedIds=sectionMatches.flatMap((m:any)=>[m.best_id,...(m.alt_ids||[])]).filter((id:string)=>id&&validIds.has(id))
        const firstClipId=clipSegments[0]?.clipId||null

        return{
          ...s,
          matchedClipIds:allMatchedIds,
          selectedClipId:firstClipId,
          clipSegments:clipSegments.length>0?clipSegments:[{id:"seg-"+i+"-0",clipId:null}],
          autoSelected:clipSegments.length>0,
          matchReason:sectionMatches[0]?.reason||"",
        }
      })
    }catch(e){console.error("matchClips failed:",e);return secs}
  }
 async function handleSaveForged(status:"draft"|"complete"){
  const stageWords=(form.awarenessStage||"problem_aware").split("_").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join("")
  const hooksToSave=hookVariations.length>0&&selectedHooks.length>0?selectedHooks.map(i=>hookVariations[i]):null

  async function saveOneAd(secs:any[],hookNum?:number){
    const hookSuffix=hookNum!=null&&hookVariations.length>1?`_Hook${hookNum+1}`:""
    const baseAutoName=`${stageWords}_${form.contentType||"UGC"}_${(form.adLength||"30 seconds").replace(" seconds","s")}${hookSuffix}`
    const supabaseCheck=createClient()
    const{data:existingAds}=await supabaseCheck.from("forged_ads").select("title").ilike("title",`${baseAutoName}%`)
    let version=1
    if(existingAds&&existingAds.length>0){const versions=existingAds.map((a:any)=>{const m=a.title.match(/_v(\d+)$/);return m?parseInt(m[1]):1});version=Math.max(...versions)+1}
    const title=adTitle.trim()||`${baseAutoName}_v${version}`
    let finalVoiceoverUrl=voiceoverUrl
    if(voiceoverUrl&&voiceoverUrl.startsWith("blob:")){
      try{
        const blob=await fetch(voiceoverUrl).then(r=>r.blob())
        const file=new File([blob],"voiceover.mp3",{type:"audio/mpeg"})
        const fd=new FormData();fd.append("file",file)
        const res=await fetch("/api/voiceover/upload",{method:"POST",body:fd})
        const d=await res.json()
        if(d.url)finalVoiceoverUrl=d.url
      }catch(e){console.error("Voiceover upload failed:",e)}
    }
    const adData={title,status,mode:"script" as const,sections:secs,voiceover_url:finalVoiceoverUrl,voiceover_voice:voiceoverVoice,music_url:musicUrl,music_name:musicName,metadata:{...genMeta?.form,productName:genMeta?.productName,hookVariation:hookNum!=null?hookNum+1:null}}
    const savedAd=await onSaveForgedAd(adData)
    if(savedAd?.id){
      fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:savedAd.id})}).catch(e=>console.error("Background render error:",e))
    }
    return savedAd
  }

  if(selectedHooks.length>1){
    for(let i=0;i<selectedHooks.length;i++){
      const hookSec=hookSections[i]||hookVariations[selectedHooks[i]]||sections
      await saveOneAd(hookSec,selectedHooks[i])
    }
  } else {
    await saveOneAd(sections)
  }

  setAdTitle("");clearDraft()
  onGoToForged()
}
async function generateHookVariations(){
  setGeneratingHooks(true)
  try{
    const bodyText=sections.filter((s:any)=>s.type!=="HOOK").map((s:any)=>s.spokenWords||"").join(" ")
    const prod=products.find((x:Product)=>String((x as any).id)===String(form.productId))||null
    const prompt=`Write 3 different HOOK variations for a direct response video ad.

Brand: ${brand.name||"Unknown"}
Product: ${prod?.name||"General"}
Ad body (stays the same): "${bodyText.substring(0,300)}"

Write 3 hooks using different angles:
1. Question hook — opens with a provocative question
2. Bold statement hook — opens with a surprising or bold claim
3. Pain point hook — opens by naming a specific customer pain

Return ONLY valid JSON:
{"hooks":[{"type":"Question","spokenWords":"exact hook words","visualDirection":"what is shown"}{"type":"Bold Statement","spokenWords":"exact hook words","visualDirection":"what is shown"},{"type":"Pain Point","spokenWords":"exact hook words","visualDirection":"what is shown"}]}`

    const raw=await callClaude([{role:"user",content:prompt}],600)
    const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
    const hooks=data.hooks||[]
    // Build 3 complete section arrays — each with a different hook, same body
    const bodyBections=sections.filter((s:any)=>s.type!=="HOOK")
    const originalHook=sections.find((s:any)=>s.type==="HOOK")||sections[0]
    const originalVariation=[{...originalHook,hookType:"Original",voiceover_url:null},...bodyBections]
    const aiVariations=hooks.map((hook:any)=>[
      {...originalHook,spokenWords:hook.spokenWords,visualDirection:hook.visualDirection,hookType:hook.type,voiceover_url:null},
      ...bodyBections
    ])
    setHookVariations([originalVariation,...aiVariations])
  }catch(e:any){setGenError(e.message||"Failed to generate hook variations — try again")}
  setGeneratingHooks(false)
}

  async function handleDeleteScript(id:string){const supabase=createClient();await supabase.from("scripts").delete().eq("id",id);onSaveScripts(scripts.filter((s:Script)=>s.id!==id));setView("list")}

  const reviewSteps=[{id:"script",label:"1. Script"},{id:"audio",label:"2. Audio"},{id:"clips",label:"3. Clip Matching"},{id:"forge",label:"4. Forge"}]

  // ── Choose Mode ──
    if(view==="chooseMode")return<div style={{maxWidth:760,margin:"0 auto",padding:60}}>
    <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:32,fontSize:14}}>← Back</button>
    <STitle size={24} mb={8}>Create New Ad</STitle>
    <div style={{color:C.muted,fontSize:15,marginBottom:40}}>How would you like to start?</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
      <div onClick={()=>setView("generate")} style={{background:C.card,border:"2px solid "+C.border,borderRadius:16,padding:28,cursor:"pointer",transition:"all 0.15s"}} onMouseOver={e=>{(e.currentTarget as any).style.borderColor=C.accent;(e.currentTarget as any).style.background=C.accentSoft}} onMouseOut={e=>{(e.currentTarget as any).style.borderColor=C.border;(e.currentTarget as any).style.background=C.card}}>
        <div style={{fontSize:36,marginBottom:12}}>✍️</div>
        <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Create from Script</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>AI writes a direct response script, matches clips from your library, you add voiceover and music.</div>
      </div>
      <div onClick={()=>setView("automash")} style={{background:C.card,border:"2px solid "+C.border,borderRadius:16,padding:28,cursor:"pointer",transition:"all 0.15s"}} onMouseOver={e=>{(e.currentTarget as any).style.borderColor="#7C3AED";(e.currentTarget as any).style.background="#7C3AED0a"}} onMouseOut={e=>{(e.currentTarget as any).style.borderColor=C.border;(e.currentTarget as any).style.background=C.card}}>
        <div style={{fontSize:36,marginBottom:12}}>⚡</div>
        <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Auto-Mash from Library</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>AI assembles a complete ad from your existing creator clips — using their real voices to tell a logical story.</div>
      </div>
      <div onClick={()=>setView("broll")} style={{background:C.card,border:"2px solid "+C.border,borderRadius:16,padding:28,cursor:"pointer",transition:"all 0.15s"}} onMouseOver={e=>{(e.currentTarget as any).style.borderColor=C.green;(e.currentTarget as any).style.background="#22c55e0a"}} onMouseOut={e=>{(e.currentTarget as any).style.borderColor=C.border;(e.currentTarget as any).style.background=C.card}}>
        <div style={{fontSize:36,marginBottom:12}}>🎬</div>
        <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Add B-Roll</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>Upload a talking head or existing ad. AI keeps the original audio and suggests b-roll clips to overlay.</div>
      </div>
    </div>
  </div>

  if(view==="automash")return<AutoMashMode libraryItems={items} brand={brand} products={products} onSaveForgedAd={onSaveForgedAd} onGoToForged={onGoToForged} onBack={()=>setView("chooseMode")}/>
  if(view==="broll")return<BRollMode libraryItems={items} onSaveForgedAd={onSaveForgedAd} onBack={()=>setView("list")}/>

  if(view==="list")return<div style={{maxWidth:820,margin:"0 auto",padding:28}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <div><STitle size={22} mb={4}>Script Generator</STitle><div style={{color:C.muted,fontSize:14}}>AI direct response scripts powered by your brand data</div></div>
      <Btn onClick={()=>setView("chooseMode")} style={{background:C.accent,color:"#fff"}}>+ Create New Ad</Btn>
    </div>
    {sections.length>0&&<div style={{background:C.accentSoft,border:"1.5px solid "+C.accent,borderRadius:12,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:C.accent}}>📝 Draft in progress</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>You have an unsaved ad with {sections.length} sections.</div></div>
      <Btn onClick={()=>{setView("review");setStep("script")}} style={{background:C.accent,color:"#fff",fontSize:12,padding:"7px 14px"}}>Resume →</Btn>
      <Btn onClick={()=>{setSections([]);setGenMeta(null);setVoiceoverUrl(null);setMusicUrl(null);setHookVariations([]);clearDraft()}} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"7px 14px"}}>Discard</Btn>
    </div>}
    {scripts.length===0?<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:40,marginBottom:12}}>✍️</div><STitle mb={6}>No scripts yet</STitle><Btn onClick={()=>setView("chooseMode")} style={{background:C.accent,color:"#fff",marginTop:8}}>Create First Ad</Btn></Card>
    :<div style={{display:"grid",gap:12}}>{[...scripts].reverse().map((script:Script)=>{
      const m=script.metadata||{},stage=STAGES.find(s=>s.value===m.awarenessStage),sc2=STAGE_COLORS[m.awarenessStage]||C.accent
      const hook=(script.sections||[]).find((s:any)=>s.type==="HOOK")||(script.sections||[])[0]
      const assigned=(script.sections||[]).filter((s:any)=>!!s.selectedClipId).length
      return<Card key={script.id} style={{cursor:"pointer"}} onClick={()=>{setSelected(script);setSections(script.sections||[]);setGenMeta({form:script.metadata,productName:script.product_name});setView("detail")}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {script.product_name&&<Chip label={script.product_name} color={{bg:"#6c63ff22",color:"#a5b4fc"}}/>}
            {m.contentType&&<Chip label={m.contentType} color={{bg:"#0891b222",color:"#38bdf8"}}/>}
            {stage&&<Chip label={stage.label} color={{bg:sc2+"22",color:sc2}}/>}
            {m.adLength&&<Chip label={m.adLength} color={{bg:"#92400e22",color:"#fbbf24"}}/>}
            {script.sections&&<Chip label={`${assigned}/${script.sections.length} clips`} color={{bg:assigned===script.sections.length?"#22c55e22":"#f59e0b22",color:assigned===script.sections.length?C.green:C.yellow}}/>}
          </div>
          <span style={{fontSize:11,color:C.muted}}>{script.created_at?new Date(script.created_at).toLocaleDateString():""}</span>
        </div>
        {hook&&<div style={{fontSize:13,color:C.muted,fontStyle:"italic",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>"{(hook.spokenWords||"").substring(0,200)}"</div>}
      </Card>
    })}</div>}
  </div>

  if(view==="generate")return<div style={{maxWidth:740,margin:"0 auto",padding:28}}>
    <button onClick={()=>setView("chooseMode")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back</button>
    <STitle size={22}>New Script</STitle>
    <Card style={{marginBottom:14}}><STitle size={14} mb={10}>Quick Request (optional)</STitle><Input textarea value={form.request} onChange={(e:any)=>setF("request",e.target.value)} placeholder={'"30s UGC ad for our serum targeting women with dry skin"'} rows={2}/></Card>
    <Card style={{marginBottom:14}}>
      <STitle size={14} mb={14}>Parameters</STitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:16}}>
        <div><Label>Product</Label><select value={form.productId} onChange={e=>setF("productId",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}><option value="">General</option>{products.map((x:Product)=><option key={(x as any).id} value={(x as any).id}>{x.name}</option>)}</select></div>
        <div><Label>Content Type</Label><select value={form.contentType} onChange={e=>setF("contentType",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}>{FORM_CTYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><Label>Ad Length</Label><select value={form.adLength} onChange={e=>setF("adLength",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}>{AD_LENGTHS.map(l=><option key={l} value={l}>{l}</option>)}</select></div>
      </div>
      <Label>Market Awareness Stage</Label>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{STAGES.map(s=>{const active=form.awarenessStage===s.value,sc2=STAGE_COLORS[s.value]||C.accent;return<div key={s.value} onClick={()=>setF("awarenessStage",s.value)} style={{background:active?sc2+"22":C.surface,border:"2px solid "+(active?sc2:C.border),borderRadius:10,padding:"10px 12px",cursor:"pointer"}}><div style={{fontWeight:700,fontSize:13,color:active?sc2:C.text,marginBottom:2}}>{s.label}</div><div style={{fontSize:11,color:C.muted}}>{s.desc}</div></div>})}</div>
    </Card>
    <Card style={{marginBottom:14}}>
      <STitle size={14} mb={6}>Customer Avatar</STitle>
      {savedAvatars.length>0&&<div style={{marginBottom:12}}><Label>Use a saved avatar</Label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{savedAvatars.map((av:CustomerAvatar)=><button key={av.id} onClick={()=>{setF("useAvatarId",av.id);setF("customerAvatar",av.description);setF("painPoints",av.pains);setF("desires",av.desires);setF("objections",av.objections)}} style={{background:form.useAvatarId===av.id?C.accentSoft:C.surface,border:"1px solid "+(form.useAvatarId===av.id?C.accent:C.border),borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600,color:form.useAvatarId===av.id?C.accent:C.text}}>{av.name}</button>)}</div></div>}
      <div style={{marginBottom:12}}><Label>Who is this customer?</Label><Input textarea value={form.customerAvatar} onChange={(e:any)=>setF("customerAvatar",e.target.value)} placeholder="e.g. Sarah, 34, busy mum, tried every moisturiser" rows={2}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:12}}>
        <div><Label>Pain Points</Label><Input textarea value={form.painPoints} onChange={(e:any)=>setF("painPoints",e.target.value)} rows={3}/></div>
        <div><Label>Desires</Label><Input textarea value={form.desires} onChange={(e:any)=>setF("desires",e.target.value)} rows={3}/></div>
      </div>
      <Label>Objections</Label><Input textarea value={form.objections} onChange={(e:any)=>setF("objections",e.target.value)} rows={2}/>
    </Card>
    <Btn onClick={()=>{setGenError("");handleGen()}} disabled={generating} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:16,borderRadius:12}}>{generating?`⏳ ${genStatus||"Generating…"}`:"✨ Generate Script"}</Btn>
    {genError&&<div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#DC2626",marginTop:12}}>⚠️ {genError}</div>}
  </div>

  if(view==="review"){
    const autoCount=sections.filter(s=>s.autoSelected).length
    return<div style={{padding:20}}>
      <div style={{display:"flex",gap:0,marginBottom:24,background:C.surface,borderRadius:12,overflow:"hidden",border:"1px solid "+C.border}}>
        {reviewSteps.map((s,i)=><button key={s.id} onClick={()=>setStep(s.id as any)} style={{flex:1,padding:"12px 8px",background:step===s.id?C.accent:"transparent",color:step===s.id?"#fff":C.muted,border:"none",cursor:"pointer",fontSize:12,fontWeight:step===s.id?700:500,borderRight:i<reviewSteps.length-1?"1px solid "+C.border:"none"}}>{s.label}{s.id==="voiceover"&&voiceoverUrl?" ✓":""}{s.id==="music"&&musicUrl?" ✓":""}</button>)}
      </div>

         {/* Step 1: Script */}
      {step==="script"&&<div style={{maxWidth:860,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <button onClick={()=>setView("generate")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>← Edit Parameters</button>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={generateHookVariations} disabled={generatingHooks||sections.length===0} style={{background:generatingHooks?C.border:C.accentSoft,color:generatingHooks?C.muted:C.accent,border:"1px solid "+C.accent+"44"}}>{generatingHooks?"⏳ Generating…":"⚡ Generate 3 Hook Variations"}</Btn>
            <Btn onClick={()=>{
              if(hookVariations.length>0&&selectedHooks.length>0){
                setSections(hookVariations[selectedHooks[0]])
              }
              setStep("audio")
            }} style={{background:C.accent,color:"#fff"}}>Next: Audio →</Btn>
          </div>
        </div>
        <div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:10,padding:"10px 14px",fontSize:13,color:C.accent,marginBottom:16}}>✏️ Review and edit your script below. Use "Generate 3 Hook Variations" to create testable hook options.</div>

        {/* Hook variations */}
        {hookVariations.length>0&&<div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:15}}>⚡ Hook Variations — select to use</div>
            <div style={{fontSize:12,color:C.muted}}>{selectedHooks.length} selected</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:8}}>
            {hookVariations.map((variation:any[],vi:number)=>{
              const hook=variation[0]
              const isSelected=selectedHooks.includes(vi)
              return<div key={vi} onClick={()=>setSelectedHooks(prev=>prev.includes(vi)?prev.filter(x=>x!==vi):[...prev,vi])} style={{background:isSelected?C.accentSoft:C.card,border:"2px solid "+(isSelected?C.accent:C.border),borderRadius:12,padding:14,cursor:"pointer",transition:"all 0.15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{background:vi===0?"#ffffff22":C.accent+"22",color:vi===0?C.text:C.accent,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99}}>{vi===0?"Original":`Hook ${vi+1} — ${hook.hookType}`}</span>
                  {isSelected&&<span style={{color:C.accent,fontSize:14}}>✓</span>}
                </div>
                <textarea value={hook.spokenWords||""} onChange={e=>{e.stopPropagation();setHookVariations(prev=>prev.map((v:any[],i:number)=>i===vi?[{...v[0],spokenWords:e.target.value},...v.slice(1)]:v))}} onClick={e=>e.stopPropagation()} style={{width:"100%",background:"transparent",border:"none",resize:"none",color:C.text,fontSize:12,lineHeight:1.6,outline:"none",fontFamily:"inherit",minHeight:60,boxSizing:"border-box" as const,cursor:"text"}}/>
              </div>
            })}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
            <div style={{fontSize:11,color:C.muted,flex:1}}>Click hooks to select. All selected hooks will become separate ads.</div>
            {selectedHooks.length>0&&<Btn onClick={()=>{setSections(hookVariations[selectedHooks[0]]);setStep("audio")}} style={{background:C.accent,color:"#fff",fontSize:12,padding:"7px 14px"}}>Proceed with {selectedHooks.length} hook{selectedHooks.length>1?"s":""} →</Btn>}
          </div>
        </div>}

        {/* Main script */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sections.map((s:any,idx:number)=>{
            const sc=secColor(s.type)
            return<Card key={s.id||idx} pad={14} style={{border:"1px solid "+sc.bd}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{background:sc.bg,color:sc.color,fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:5,border:"1px solid "+sc.bd}}>{s.type}</span>
                {s.durationEstimate&&<span style={{fontSize:10,color:C.muted}}>{s.durationEstimate}</span>}
              </div>
              <textarea value={s.spokenWords||""} onChange={e=>setSections(prev=>prev.map((r:any,i:number)=>i===idx?{...r,spokenWords:e.target.value}:r))} placeholder="Spoken words…" style={{width:"100%",background:"transparent",border:"none",resize:"none",color:C.text,fontSize:13,lineHeight:1.8,outline:"none",fontFamily:"inherit",minHeight:60,boxSizing:"border-box" as const,marginBottom:4}}/>
              {s.visualDirection&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{s.visualDirection}</div>}
            </Card>
          })}
        </div>
      </div>}

       {/* Step 2: Audio — voiceover + music on one page */}
      {step==="audio"&&<div style={{maxWidth:640,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <button onClick={()=>setStep("script")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>← Back to Script</button>
          <Btn onClick={()=>setStep("clips")} style={{background:C.accent,color:"#fff"}}>Next: Match Clips →</Btn>
        </div>

        {/* Voiceover status banner */}
        {voiceoverUrl&&<div style={{background:"#22c55e11",border:"1px solid #22c55e44",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:C.green,fontSize:16}}>✓</span>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.green}}>Voiceover ready — {voiceoverVoice}</div><audio src={voiceoverUrl} controls style={{width:"100%",height:28,marginTop:4}}/></div>
          <button onClick={()=>{setVoiceoverUrl(null);setVoiceoverVoice(null)}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Remove</button>
        </div>}

        {/* Music status banner */}
        {musicUrl&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff44",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:C.accent,fontSize:16}}>✓</span>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.accent}}>Music selected — {musicName}</div><audio src={musicUrl} controls style={{width:"100%",height:28,marginTop:4}}/></div>
          <button onClick={()=>{setMusicUrl(null);setMusicName(null)}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Remove</button>
        </div>}

        {/* Ready indicator */}
        {voiceoverUrl&&musicUrl&&<div style={{background:"#22c55e11",border:"1px solid #22c55e44",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:C.green,fontWeight:600,textAlign:"center"}}>
          ✅ Both audio tracks selected — ready to match clips!
        </div>}

                <VoiceoverGenerator sections={sections} allHookSections={selectedHooks.length>1?selectedHooks.map(hi=>hookVariations[hi]||sections):null} onSave={(updatedSections:any[],voice:string,combinedUrl:string,allUpdatedHooks?:any[][])=>{
          setSections(updatedSections)
          setVoiceoverVoice(voice)
          setVoiceoverUrl(combinedUrl)
          if(allUpdatedHooks){
            const newHookSections:Record<number,any[]>={}
            selectedHooks.forEach((hi,i)=>{newHookSections[i]=allUpdatedHooks[i]||updatedSections})
            setHookSections(newHookSections)
          }
        }} onSkip={()=>{setVoiceoverUrl(null);setVoiceoverVoice(null)}}/>
        <div style={{marginTop:16}}>
          <MusicPicker suggestedMood={suggestedMood} onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
        </div>
        <Btn onClick={()=>setStep("clips")} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12,marginTop:16}}>Next: Match Clips →</Btn>
      </div>}

      {/* Step 3: Clip Matching */}
      {step==="clips"&&<>
        {/* Hook switcher */}
        {selectedHooks.length>1&&<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:600,color:C.muted}}>Previewing:</span>
          {selectedHooks.map((hi:number,i:number)=>{
            const hook=hookVariations[hi]?.[0]
            const isActive=activeHookIdx===i
            return<button key={hi} onClick={async()=>{
  setActiveHookIdx(i)
  const existingSecs=hookSections[i]
  if(existingSecs){
    setSections(existingSecs)
  } else {
    const hookSecs=hookVariations[selectedHooks[i]]||sections
    setMatching(true)
    const matched=items.length>0?await matchClips(hookSecs,items).catch(()=>hookSecs):hookSecs
    setSections(matched)
    setHookSections(prev=>({...prev,[i]:matched}))
    setMatching(false)
  }
}}

style={{background:isActive?C.accent:C.surface,color:isActive?"#fff":C.muted,border:"1px solid "+(isActive?C.accent:C.border),borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:isActive?700:500}}>
              {hi===0?"Original":hook?.hookType||`Hook ${i+1}`}{isActive?" ✓":""}
            </button>
          })}
          <span style={{fontSize:11,color:C.muted}}>— swap to preview different hooks</span>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <button onClick={()=>setStep("audio")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>← Audio</button>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={async()=>{setMatching(true);const u=await(async()=>{try{return await matchClips(sections,items)}catch{return sections}})();setSections(u);setHookSections(prev=>({...prev,[activeHookIdx]:u}));setMatching(false)}} disabled={matching||items.length===0} style={{background:matching?C.border:C.accentSoft,color:matching?C.muted:C.accent,border:"1px solid "+C.accent+"44"}}>{matching?"🔍 Matching…":"🔄 Re-match"}</Btn>
            <Btn onClick={()=>setStep("forge")} style={{background:C.accent,color:"#fff"}}>Next: Forge →</Btn>
          </div>
        </div>
        {autoCount>0&&<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#15803D",fontWeight:600}}>✦ AI auto-selected {autoCount} clip{autoCount!==1?"s":""} — swap any below.</div>}
        <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
          <ScriptTable sections={sections} onChange={(s:any[])=>{setSections(s);setHookSections(prev=>({...prev,[activeHookIdx]:s}))}} libraryItems={items} readOnly={false} brandName={brand.name} productName={genMeta?.productName} brandVoice={brand.voice} voiceoverUrl={voiceoverUrl}/>
        </Card>
        <StitchedPreview sections={sections} libraryItems={items} voiceoverUrl={voiceoverUrl} musicUrl={musicUrl}/>
      </>}

      {/* Step 4: Forge */}
      {step==="forge"&&<div style={{maxWidth:860,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <button onClick={()=>setStep("clips")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>← Back to Clips</button>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={()=>handleSaveForged("draft")} style={{background:C.surface,color:C.text,border:"1px solid "+C.border}}>💾 Save Draft</Btn>
            <Btn onClick={()=>handleSaveForged("complete")} style={{background:C.green,color:"#000",fontWeight:700}}>✓ Save {selectedHooks.length>1?`${selectedHooks.length} Hook Variations`:"& Complete"}</Btn>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <Label>Ad Name (optional)</Label>
          <input value={adTitle} onChange={e=>setAdTitle(e.target.value)} placeholder={`e.g. ProblemAware_${form.contentType||"UGC"}_${(form.adLength||"30s").replace(" seconds","s")}_v1`} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box" as const}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <Card pad={12}><div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🎙️ Voiceover</div>{voiceoverUrl?<><audio src={voiceoverUrl} controls style={{width:"100%",height:32}}/><div style={{fontSize:11,color:C.green,marginTop:4}}>✓ {voiceoverVoice}</div><button onClick={()=>setStep("audio")} style={{background:"none",border:"none",color:C.muted,fontSize:10,cursor:"pointer",textDecoration:"underline",padding:0}}>Change</button></>:<div style={{fontSize:12,color:C.muted}}>None — <button onClick={()=>setStep("audio")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,textDecoration:"underline",padding:0}}>add one</button></div>}</Card>
          <Card pad={12}><div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🎵 Music</div>{musicUrl?<><audio src={musicUrl} controls style={{width:"100%",height:32}}/><div style={{fontSize:11,color:C.green,marginTop:4}}>✓ {musicName}</div><button onClick={()=>setStep("audio")} style={{background:"none",border:"none",color:C.muted,fontSize:10,cursor:"pointer",textDecoration:"underline",padding:0}}>Change</button></>:<div style={{fontSize:12,color:C.muted}}>None — <button onClick={()=>setStep("audio")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,textDecoration:"underline",padding:0}}>add some</button></div>}</Card>
        </div>
        <StitchedPreview sections={sections} libraryItems={items} voiceoverUrl={voiceoverUrl} musicUrl={musicUrl}/>
      </div>}
    </div>
  }

  if(view==="detail"&&selected){
    const m=selected.metadata||{},stg=STAGES.find(s=>s.value===m.awarenessStage),stgC=STAGE_COLORS[m.awarenessStage]||C.accent
    const disp=sections.length>0?sections:(selected.sections||[])
    const assigned=disp.filter((s:any)=>!!s.selectedClipId).length
    return<div style={{padding:28}}>
      <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to Scripts</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:8}}>
            {selected.product_name&&<Chip label={selected.product_name} color={{bg:"#6c63ff22",color:"#a5b4fc"}}/>}
            {m.contentType&&<Chip label={m.contentType} color={{bg:"#0891b222",color:"#38bdf8"}}/>}
            {stg&&<Chip label={stg.label} color={{bg:stgC+"22",color:stgC}}/>}
            <Chip label={`${assigned}/${disp.length} clips`} color={{bg:assigned===disp.length?"#22c55e22":"#f59e0b22",color:assigned===disp.length?C.green:C.yellow}}/>
          </div>
          <div style={{fontSize:13,color:C.muted}}>Saved {selected.created_at?new Date(selected.created_at).toLocaleDateString():""}</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>{setSections(disp);setView("review");setStep("script")}} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44"}}>Edit Script</Btn>
          <Btn onClick={async()=>{
            const fresh=disp.map((s:any)=>({...s,matchedClipIds:[],selectedClipId:null,autoSelected:false}))
            const matched=items.length>0?await matchClips(fresh,items):fresh
            setSections(matched);setView("review");setStep("audio")
          }} style={{background:C.green+"22",color:C.green,border:"1px solid "+C.green+"44"}}>↺ Reuse Script</Btn>
          <Btn onClick={()=>handleDeleteScript(selected.id!)} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433"}}>Delete</Btn>
        </div>
      </div>
      <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
        <ScriptTable sections={disp} onChange={setSections} libraryItems={items} readOnly={false} brandName={brand.name} productName={selected.product_name}/>
      </Card>
      <StitchedPreview sections={disp} libraryItems={items}/>
    </div>
  }
  return null
}

function ForgedAdDownload({ad,onRefresh}:{ad:ForgedAd,onRefresh:()=>void}){
  const [checking,setChecking]=useState(false)
  const [downloading,setDownloading]=useState(false)
  const [msg,setMsg]=useState("")

  useEffect(()=>{
    // Auto-check status when opened
    if(ad.render_status==="rendering")checkStatus()
  },[])

  async function checkStatus(){
    setChecking(true)
    try{
      const res=await fetch("/api/export/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
      const data=await res.json()
      if(data.status==="ready"||data.status==="rendering"||data.status==="failed"){
        onRefresh()
      }
    }catch(e){console.error(e)}
    setChecking(false)
  }

  async function startRender(){
    setMsg("Starting render…")
    try{
      await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
      onRefresh()
      setMsg("Rendering started — check back in 1-2 mins")
    }catch(e:any){setMsg("Error: "+e.message)}
  }

  async function downloadMp4(){
    if(!ad.render_url)return
    setDownloading(true);setMsg("Downloading…")
    try{
      const res=await fetch(ad.render_url)
      const blob=await res.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=url
      a.download=`${ad.title||"adforge-ad"}.mp4`
      a.click()
      setTimeout(()=>URL.revokeObjectURL(url),15000)
      setMsg("✓ Downloaded!")
    }catch(e:any){setMsg("Download failed: "+e.message)}
    setDownloading(false)
  }

  const renderStatus=ad.render_status||"pending"

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:20,marginTop:16}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>⬇️ Download MP4</div>

    {renderStatus==="pending"&&<div>
      <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Render not started yet.</div>
      <Btn onClick={startRender} style={{background:C.accent,color:"#fff",width:"100%",padding:12}}>{msg||"🎬 Start Rendering"}</Btn>
    </div>}

    {renderStatus==="rendering"&&<div>
      <div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#fbbf24",marginBottom:12}}>⏳ Rendering in progress — usually takes 1-2 minutes.</div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={checkStatus} disabled={checking} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",flex:1}}>{checking?"Checking…":"🔄 Check Status"}</Btn>
      </div>
      {msg&&<div style={{fontSize:12,color:C.muted,marginTop:8}}>{msg}</div>}
    </div>}

    {renderStatus==="ready"&&<div>
      <div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:8,padding:"10px 14px",fontSize:13,color:C.green,marginBottom:12}}>✅ Your MP4 is ready to download!</div>
      <Btn onClick={downloadMp4} disabled={downloading} style={{background:C.green,color:"#000",fontWeight:700,width:"100%",padding:14,fontSize:15,borderRadius:12}}>{downloading?"⏳ Downloading…":"⬇️ Download MP4"}</Btn>
      {msg&&<div style={{fontSize:12,color:msg.includes("✓")?C.green:C.red,marginTop:8,fontWeight:600}}>{msg}</div>}
    </div>}

    {renderStatus==="failed"&&<div>
      <div style={{background:"#ef444411",border:"1px solid #ef444433",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#ef4444",marginBottom:12}}>❌ Render failed. Try again.</div>
      <Btn onClick={startRender} style={{background:C.accent,color:"#fff",width:"100%",padding:12}}>🔄 Retry Render</Btn>
    </div>}
  </div>
}



// ── Forged Ads Tab ────────────────────────────────────────────────────────
function ForgedAdCard({ad,items,onOpen,onRefresh,selectMode,isSelected,onToggleSelect}:{ad:ForgedAd,items:Item[],onOpen:()=>void,onRefresh:()=>void,selectMode:boolean,isSelected:boolean,onToggleSelect:()=>void}){
  const supabase=createClient()
  const [hovered,setHovered]=useState(false)
  const [thumbIdx,setThumbIdx]=useState(0)
  const [downloading,setDownloading]=useState(false)
  const [rating,setRating]=useState(ad.star_rating||0)
  const [hoverRating,setHoverRating]=useState(0)
  const intervalRef=useRef<any>(null)

  const clips=(ad.sections||[]).map((s:any)=>{
    const item=s.selectedClipId?items.find((i:Item)=>i.id===s.selectedClipId):null
    return item?.mux_playback_id?item:null
  }).filter(Boolean)

  const firstClip=clips[0]

  useEffect(()=>{
    if(hovered&&clips.length>1){
      intervalRef.current=setInterval(()=>setThumbIdx(i=>(i+1)%clips.length),800)
    } else {
      clearInterval(intervalRef.current);setThumbIdx(0)
    }
    return()=>clearInterval(intervalRef.current)
  },[hovered,clips.length])

  const currentClip=clips[thumbIdx]||firstClip
  const currentThumb=currentClip?.mux_playback_id?muxThumb(currentClip.mux_playback_id,currentClip.thumbnail_time||0):null

  const renderStatus=(ad as any).render_status||"pending"
  const renderBadge=renderStatus==="ready"?{bg:"#22c55e22",color:C.green,label:"✓ Ready"}:renderStatus==="rendering"?{bg:"#f59e0b22",color:C.yellow,label:"⏳ Rendering"}:renderStatus==="failed"?{bg:"#ef444422",color:"#ef4444",label:"❌ Failed"}:{bg:"#ffffff11",color:C.muted,label:"Pending"}

  async function quickDownload(e:React.MouseEvent){
    e.stopPropagation()
    if(!(ad as any).render_url){onOpen();return}
    setDownloading(true)
    try{
      const res=await fetch((ad as any).render_url)
      const blob=await res.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement("a");a.href=url;a.download=`${ad.title||"ad"}.mp4`;a.click()
      setTimeout(()=>URL.revokeObjectURL(url),15000)
    }catch(e){onOpen()}
    setDownloading(false)
  }

  async function saveRating(r:number){
    setRating(r)
    await supabase.from("forged_ads").update({star_rating:r}).eq("id",ad.id)
  }

  const stage=STAGES.find(s=>s.value===ad.metadata?.awarenessStage)
  const stageColor=STAGE_COLORS[ad.metadata?.awarenessStage||""]||C.accent

  function handleClick(){if(selectMode)onToggleSelect();else onOpen()}

  return<div
    onMouseEnter={()=>setHovered(true)}
    onMouseLeave={()=>setHovered(false)}
    onClick={handleClick}
    style={{background:C.card,border:"2px solid "+(isSelected?C.accent:hovered?C.accent:C.border),borderRadius:14,overflow:"hidden",cursor:"pointer",transition:"border-color 0.15s,transform 0.15s",transform:hovered&&!selectMode?"translateY(-2px)":"none",display:"flex",flexDirection:"column",position:"relative"}}
  >
    {/* Select checkbox */}
    {selectMode&&<div style={{position:"absolute",top:8,left:8,zIndex:20,width:22,height:22,borderRadius:6,background:isSelected?C.accent:"#000a",border:"2px solid "+(isSelected?"#fff":"#fff5"),display:"flex",alignItems:"center",justifyContent:"center"}}>
      {isSelected&&<span style={{color:"#fff",fontSize:12,fontWeight:800}}>✓</span>}
    </div>}

    {/* Thumbnail */}
    <div style={{position:"relative",paddingTop:"177.78%",background:"#111",overflow:"hidden",flexShrink:0}}>
      {currentThumb&&<img src={currentThumb} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",transition:"opacity 0.3s"}}/>}

      {/* Hover overlay */}
      {hovered&&!selectMode&&<div style={{position:"absolute",inset:0,background:"#00000055",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:48,height:48,borderRadius:"50%",background:"#000a",border:"2px solid #fff6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>▶</div>
      </div>}

      {/* Clip progress dots */}
      {clips.length>1&&hovered&&<div style={{position:"absolute",bottom:40,left:8,right:8,display:"flex",gap:3}}>
        {clips.map((_:any,i:number)=><div key={i} style={{height:2,flex:1,borderRadius:2,background:i===thumbIdx?"#fff":"#ffffff44",transition:"background 0.3s"}}/>)}
      </div>}

      {/* Render status */}
      <div style={{position:"absolute",top:8,right:selectMode?8:renderStatus==="ready"?40:8,background:renderBadge.bg,color:renderBadge.color,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:99,backdropFilter:"blur(4px)",border:"1px solid "+renderBadge.color+"44"}}>
        {renderBadge.label}
      </div>

      {/* Quick download */}
      {renderStatus==="ready"&&!selectMode&&<button onClick={quickDownload} disabled={downloading} style={{position:"absolute",top:8,right:8,background:"#000a",border:"1px solid #fff3",color:"#fff",borderRadius:8,padding:"5px 8px",cursor:"pointer",fontSize:13,backdropFilter:"blur(4px)"}}>
        {downloading?"…":"⬇️"}
      </button>}

      {/* Tag overlays bottom */}
      <div style={{position:"absolute",bottom:8,left:8,display:"flex",gap:4,flexWrap:"wrap",maxWidth:"calc(100% - 16px)"}}>
        {ad.metadata?.contentType&&<span style={{background:"#000b",color:"#fff",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:4,backdropFilter:"blur(4px)"}}>{ad.metadata.contentType}</span>}
        {stage&&<span style={{background:stageColor+"dd",color:"#fff",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:4}}>{stage.label}</span>}
      </div>

      {/* Audio indicators */}
      <div style={{position:"absolute",bottom:8,right:8,display:"flex",gap:3}}>
        {ad.voiceover_url&&<span style={{background:"#000b",fontSize:10,padding:"2px 4px",borderRadius:4}}>🎙️</span>}
        {ad.music_url&&<span style={{background:"#000b",fontSize:10,padding:"2px 4px",borderRadius:4}}>🎵</span>}
      </div>
    </div>

    {/* Card body — compact */}
    <div style={{padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",gap:5}}>
      <div style={{fontWeight:700,fontSize:12,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>{ad.title}</div>
      <div style={{display:"flex",gap:2}} onMouseLeave={()=>setHoverRating(0)}>
        {[1,2,3,4,5].map(star=><span key={star} onMouseEnter={e=>{e.stopPropagation();setHoverRating(star)}} onClick={e=>{e.stopPropagation();saveRating(star)}} style={{cursor:"pointer",fontSize:13,color:(hoverRating||rating)>=star?"#f59e0b":"#ffffff22",transition:"color 0.1s"}}>★</span>)}
      </div>
      <div style={{fontSize:10,color:C.muted}}>{ad.created_at?new Date(ad.created_at).toLocaleDateString():""}{ad.metadata?.adLength?` · ${ad.metadata.adLength}`:""}</div>
      {(ad as any).notes&&<div style={{fontSize:10,color:C.muted,fontStyle:"italic",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>📝 {(ad as any).notes}</div>}
    </div>
  </div>
}

function ForgedAdsTab({ads,items,onRefresh}:{ads:ForgedAd[],items:Item[],onRefresh:()=>void}){
  const supabase=createClient()
  const [previewId,setPreviewId]=useState<string|null>(null)
  const [search,setSearch]=useState("")
  const [activeTag,setActiveTag]=useState<string|null>(null)
  const [renderFilter,setRenderFilter]=useState<string|null>(null)
  const [expandedStages,setExpandedStages]=useState<Record<string,boolean>>({})
  const [editingNotes,setEditingNotes]=useState<string|null>(null)
  const [notesVal,setNotesVal]=useState("")
  const [selectMode,setSelectMode]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [deleting,setDeleting]=useState(false)
  const [autoRendering,setAutoRendering]=useState(false)
  const pollRef=useRef<any>(null)

  const previewAd=previewId?ads.find(a=>a.id===previewId):null

  // Auto-poll render status every 15 seconds
  useEffect(()=>{
    async function pollRenderStatus(){
      const rendering=ads.filter(a=>(a as any).render_status==="rendering")
      if(rendering.length===0)return
      for(const ad of rendering){
        try{
          const res=await fetch("/api/export/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
          const data=await res.json()
          if(data.status==="ready"||data.status==="failed"){onRefresh();break}
        }catch(e){}
      }
    }
    pollRenderStatus()
    pollRef.current=setInterval(pollRenderStatus,15000)
    return()=>clearInterval(pollRef.current)
  },[ads.map(a=>(a as any).render_status).join(",")])

  async function deleteAd(id:string){await supabase.from("forged_ads").delete().eq("id",id);onRefresh()}
  async function markComplete(id:string){await supabase.from("forged_ads").update({status:"complete",updated_at:new Date().toISOString()}).eq("id",id);onRefresh()}
  async function saveNotes(id:string){await supabase.from("forged_ads").update({notes:notesVal}).eq("id",id);setEditingNotes(null);onRefresh()}

  async function bulkDelete(){
    setDeleting(true)
    for(const id of selectedIds){await supabase.from("forged_ads").delete().eq("id",id)}
    setSelectedIds([]);setSelectMode(false);setDeleting(false);onRefresh()
  }

  async function autoRenderAll(){
    setAutoRendering(true)
    const pending=ads.filter(a=>(a as any).render_status==="pending"||(a as any).render_status==="failed"||!(a as any).render_status)
    for(const ad of pending){
      try{await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})}catch(e){}
    }
    onRefresh();setAutoRendering(false)
  }

  // Filter
  const filtered=ads.filter(ad=>{
    if(renderFilter&&(ad as any).render_status!==renderFilter)return false
    if(search.trim()){const q=search.toLowerCase();if(![ad.title,ad.metadata?.contentType,ad.metadata?.productName,ad.metadata?.awarenessStage,(ad as any).notes].some((f:any)=>f&&String(f).toLowerCase().includes(q)))return false}
    if(activeTag){if(![ad.metadata?.contentType,ad.metadata?.awarenessStage&&STAGES.find(s=>s.value===ad.metadata?.awarenessStage)?.label,ad.metadata?.productName].some((f:any)=>f&&f===activeTag))return false}
    return true
  })

  // Group by awareness stage
  const stageOrder=["problem_aware","unaware","solution_aware","product_aware","most_aware",""]
  const stageGroups:Record<string,ForgedAd[]>={}
  filtered.forEach(ad=>{const s=ad.metadata?.awarenessStage||"";if(!stageGroups[s])stageGroups[s]=[];stageGroups[s].push(ad)})
  const allStages=[...stageOrder.filter(s=>stageGroups[s]?.length>0),...Object.keys(stageGroups).filter(s=>!stageOrder.includes(s)&&stageGroups[s]?.length>0)]

  function toggleStage(s:string){setExpandedStages(prev=>({...prev,[s]:prev[s]===false?true:false}))}
  function isExpanded(s:string){return expandedStages[s]!==false}

  const totalReady=ads.filter(a=>(a as any).render_status==="ready").length
  const totalRendering=ads.filter(a=>(a as any).render_status==="rendering").length
  const totalPending=ads.filter(a=>(a as any).render_status==="pending"||!(a as any).render_status||(a as any).render_status==="failed").length
  const allFilteredIds=filtered.map(a=>a.id)

  return<div style={{padding:28,maxWidth:1200,margin:"0 auto"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
      <div>
        <STitle size={24} mb={4}>⚡ Forged Ads</STitle>
        <div style={{fontSize:13,color:C.muted}}>Your complete video ad library — organised by awareness stage</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {totalPending>0&&<Btn onClick={autoRenderAll} disabled={autoRendering} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"7px 14px"}}>{autoRendering?"⏳ Rendering…":`🎬 Render All (${totalPending})`}</Btn>}
        {!selectMode&&<Btn onClick={()=>setSelectMode(true)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"7px 14px"}}>Select</Btn>}
        {selectMode&&<>
          <Btn onClick={()=>{setSelectedIds(allFilteredIds)}} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"7px 14px"}}>Select All ({filtered.length})</Btn>
          <Btn onClick={bulkDelete} disabled={selectedIds.length===0||deleting} style={{background:selectedIds.length>0?"#ef444433":C.border,color:selectedIds.length>0?"#ef4444":C.muted,border:"1px solid "+(selectedIds.length>0?"#ef444466":C.border),fontSize:12,padding:"7px 14px"}}>Delete ({selectedIds.length})</Btn>
          <Btn onClick={()=>{setSelectMode(false);setSelectedIds([])}} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"7px 14px"}}>Cancel</Btn>
        </>}
      </div>
    </div>

    {/* Search + filter row */}
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ads by name, product, stage…" style={{flex:1,minWidth:220,background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:14,outline:"none"}}/>

      {/* Render status filter buttons */}
      <button onClick={()=>setRenderFilter(renderFilter==="ready"?null:"ready")} style={{background:renderFilter==="ready"?"#22c55e33":C.surface,border:"1px solid "+(renderFilter==="ready"?"#22c55e":C.border),color:renderFilter==="ready"?C.green:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>✓ Ready ({totalReady})</button>
      <button onClick={()=>setRenderFilter(renderFilter==="rendering"?null:"rendering")} style={{background:renderFilter==="rendering"?"#f59e0b33":C.surface,border:"1px solid "+(renderFilter==="rendering"?"#f59e0b":C.border),color:renderFilter==="rendering"?C.yellow:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>⏳ Rendering ({totalRendering})</button>

      {(activeTag||renderFilter||search)&&<button onClick={()=>{setActiveTag(null);setRenderFilter(null);setSearch("")}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Clear filters</button>}
    </div>

    {/* Tag cloud */}
    {ads.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
      {[...new Set(ads.flatMap(ad=>[ad.metadata?.contentType,ad.metadata?.awarenessStage&&STAGES.find(s=>s.value===ad.metadata?.awarenessStage)?.label,ad.metadata?.productName&&ad.metadata.productName!=="General"?ad.metadata.productName:null].filter(Boolean)))].map((tag:any)=><button key={tag} onClick={()=>setActiveTag(activeTag===tag?null:tag)} style={{background:activeTag===tag?C.accent:C.surface,color:activeTag===tag?"#fff":C.muted,border:"1px solid "+(activeTag===tag?C.accent:C.border),borderRadius:99,padding:"4px 11px",cursor:"pointer",fontSize:11,fontWeight:600}}>{tag}</button>)}
    </div>}

    {/* Preview modal */}
    {previewAd&&<div onClick={()=>setPreviewId(null)} style={{position:"fixed",inset:0,background:"#000000ee",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:16,padding:24,maxWidth:900,width:"100%",marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,gap:16}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:18,marginBottom:6}}>{previewAd.title}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
              <span style={{background:previewAd.status==="complete"?"#22c55e22":"#f59e0b22",color:previewAd.status==="complete"?C.green:C.yellow,border:"1px solid "+(previewAd.status==="complete"?"#22c55e44":"#f59e0b44"),borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{previewAd.status==="complete"?"✅ Complete":"📝 Draft"}</span>
              {previewAd.mode==="broll"&&<Chip label="🎬 B-Roll" color={{bg:"#22c55e22",color:C.green}}/>}
              {previewAd.metadata?.contentType&&<Chip label={previewAd.metadata.contentType} color={{bg:"#0891b222",color:"#38bdf8"}}/>}
              {previewAd.metadata?.awarenessStage&&<Chip label={STAGES.find(s=>s.value===previewAd.metadata?.awarenessStage)?.label||previewAd.metadata.awarenessStage} color={{bg:STAGE_COLORS[previewAd.metadata.awarenessStage]+"22",color:STAGE_COLORS[previewAd.metadata.awarenessStage]}}/>}
              {previewAd.created_at&&<span style={{fontSize:11,color:C.muted}}>Created {new Date(previewAd.created_at).toLocaleDateString()}</span>}
            </div>
            {editingNotes===previewAd.id
              ?<div style={{display:"flex",gap:8,marginTop:8}}>
                <input value={notesVal} onChange={e=>setNotesVal(e.target.value)} placeholder="Add internal notes…" autoFocus style={{flex:1,background:C.surface,border:"1px solid "+C.accent,borderRadius:8,padding:"6px 10px",color:C.text,fontSize:13,outline:"none"}}/>
                <Btn onClick={()=>saveNotes(previewAd.id)} style={{background:C.green,color:"#000",fontWeight:700,padding:"6px 12px",fontSize:12}}>Save</Btn>
                <Btn onClick={()=>setEditingNotes(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"6px 12px",fontSize:12}}>Cancel</Btn>
              </div>
              :<div onClick={()=>{setEditingNotes(previewAd.id);setNotesVal((previewAd as any).notes||"")}} style={{fontSize:12,color:(previewAd as any).notes?C.muted:C.accent,cursor:"pointer",marginTop:6,textDecoration:"underline"}}>
                {(previewAd as any).notes?`📝 ${(previewAd as any).notes}`:"+ Add notes"}
              </div>}
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0}}>
            {previewAd.status==="draft"&&<Btn onClick={()=>{markComplete(previewAd.id);setPreviewId(null)}} style={{background:"#22c55e22",color:C.green,border:"1px solid #22c55e44",fontSize:12,padding:"6px 12px"}}>Mark Complete</Btn>}
            <Btn onClick={()=>{deleteAd(previewAd.id);setPreviewId(null)}} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",fontSize:12,padding:"6px 12px"}}>Delete</Btn>
            <Btn onClick={()=>setPreviewId(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px"}}>✕ Close</Btn>
          </div>
        </div>
        {previewAd.sections&&previewAd.sections.length>0&&<div style={{marginBottom:20}}><StitchedPreview sections={previewAd.sections} libraryItems={items} voiceoverUrl={previewAd.voiceover_url} musicUrl={previewAd.music_url}/></div>}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
          {previewAd.voiceover_url&&<div style={{flex:1,minWidth:200}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🎙️ Voiceover · {previewAd.voiceover_voice}</div><audio src={previewAd.voiceover_url} controls style={{width:"100%",height:36}}/></div>}
          {previewAd.music_url&&<div style={{flex:1,minWidth:200}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🎵 Music · {previewAd.music_name}</div><audio src={previewAd.music_url} controls style={{width:"100%",height:36}}/></div>}
        </div>
        <ForgedAdDownload ad={previewAd} onRefresh={onRefresh}/>
      </div>
    </div>}

    {/* Empty state */}
    {ads.length===0&&<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:40,marginBottom:12}}>⚡</div><STitle mb={6}>No forged ads yet</STitle><div style={{color:C.muted,fontSize:13}}>Create an ad from the Scripts tab and save it here.</div></Card>}
    {ads.length>0&&filtered.length===0&&<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:28,marginBottom:8}}>🔍</div><div style={{color:C.muted,fontSize:14}}>No ads match your filters.<br/><button onClick={()=>{setSearch("");setActiveTag(null);setRenderFilter(null)}} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:13,textDecoration:"underline",marginTop:8}}>Clear all filters</button></div></Card>}

{/* Pending renders section */}
    {ads.filter(a=>!a.render_status||a.render_status==="pending"||a.render_status==="failed").length>0&&<div style={{marginBottom:20,border:"1px solid #f59e0b44",borderRadius:14,overflow:"hidden"}}>
      <div style={{background:"#f59e0b11",padding:"14px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #f59e0b33"}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:C.yellow,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:C.yellow}}>⏳ Waiting to Render</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>These ads are saved but haven't been rendered to MP4 yet</div>
        </div>
        <Btn onClick={autoRenderAll} disabled={autoRendering} style={{background:C.yellow,color:"#000",fontWeight:700,fontSize:12,padding:"7px 14px"}}>{autoRendering?"⏳ Starting…":"🎬 Render All"}</Btn>
      </div>
      <div style={{padding:16,background:C.bg,display:"flex",flexDirection:"column",gap:8}}>
        {ads.filter(a=>!a.render_status||a.render_status==="pending"||a.render_status==="failed").map(ad=><div key={ad.id} style={{display:"flex",alignItems:"center",gap:12,background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:"10px 14px"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{ad.title}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{ad.created_at?new Date(ad.created_at).toLocaleDateString():""}{ad.render_status==="failed"?<span style={{color:"#ef4444",marginLeft:8}}>❌ Last render failed</span>:""}</div>
          </div>
          <Btn onClick={async()=>{await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})});onRefresh()}} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"6px 12px",flexShrink:0}}>🎬 Render</Btn>
          <Btn onClick={()=>setPreviewId(ad.id)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"6px 10px",flexShrink:0}}>Open</Btn>
        </div>)}
      </div>
    </div>}

    {/* Stage folders */}
    {allStages.map(stageKey=>{
      const stageAds=stageGroups[stageKey]||[]
      const stageInfo=STAGES.find(s=>s.value===stageKey)
      const stageColor=STAGE_COLORS[stageKey]||C.accent
      const expanded=isExpanded(stageKey)
      const readyCount=stageAds.filter(a=>(a as any).render_status==="ready").length

      return<div key={stageKey} style={{marginBottom:16,border:"1px solid "+C.border,borderRadius:14,overflow:"hidden"}}>
        <div onClick={()=>toggleStage(stageKey)} style={{background:C.card,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",borderBottom:expanded?"1px solid "+C.border:"none"}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:stageColor,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15}}>{stageInfo?.label||"General"}</div>
            {stageInfo&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{stageInfo.desc}</div>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{background:stageColor+"22",color:stageColor,border:"1px solid "+stageColor+"44",borderRadius:99,fontSize:11,fontWeight:700,padding:"2px 10px"}}>{stageAds.length} ad{stageAds.length!==1?"s":""}</span>
            {readyCount>0&&<span style={{background:"#22c55e22",color:C.green,border:"1px solid #22c55e44",borderRadius:99,fontSize:11,fontWeight:700,padding:"2px 10px"}}>✓ {readyCount} ready</span>}
            <span style={{fontSize:12,color:C.muted,marginLeft:4}}>{expanded?"▲":"▼"}</span>
          </div>
        </div>
        {expanded&&<div style={{padding:20,background:C.bg}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14}}>
            {stageAds.map(ad=><ForgedAdCard key={ad.id} ad={ad} items={items} onOpen={()=>setPreviewId(ad.id)} onRefresh={onRefresh} selectMode={selectMode} isSelected={selectedIds.includes(ad.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(ad.id)?prev.filter(x=>x!==ad.id):[...prev,ad.id])}/>)}
          </div>
        </div>}
      </div>
    })}
  </div>
}

// ── Brand Tab ─────────────────────────────────────────────────────────────
function BrandTab({brand,setBrand,products,setProducts}:any){
  const supabase=createClient()
  const [section,setSection]=useState("brand")
  const [saving,setSaving]=useState(false)
  const [crawling,setCrawling]=useState(false)
  const [crawlError,setCrawlError]=useState("")
  const [editingProd,setEditingProd]=useState<Product|null>(null)
  const [editingAvatar,setEditingAvatar]=useState<CustomerAvatar|null>(null)

  async function saveBrand(){
    setSaving(true)
    if(brand.id){
      await supabase.from("brand_profile").update(brand).eq("id",brand.id)
    } else {
      const{data:existing}=await supabase.from("brand_profile").select("id").limit(1).single()
      if(existing?.id){
        await supabase.from("brand_profile").update(brand).eq("id",existing.id)
        setBrand({...brand,id:existing.id})
      } else {
        const{data}=await supabase.from("brand_profile").insert(brand).select().single()
        if(data)setBrand(data)
      }
    }
    setSaving(false)
  }  async function crawlWebsite(){if(!brand.website?.trim()){setCrawlError("Enter a website URL first.");return};setCrawling(true);setCrawlError("");try{const res=await fetch("/api/brand/crawl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:brand.website})});const d=await res.json();if(d.error)throw new Error(d.error);setBrand({...brand,...d.profile,id:brand.id,customer_avatars:brand.customer_avatars||[]})}catch(e:any){setCrawlError(e.message||"Could not fetch website.")};setCrawling(false)}
  async function saveProd(prod:Product){if((prod as any).id){await supabase.from("products").update(prod).eq("id",(prod as any).id);setProducts(products.map((p:any)=>p.id===(prod as any).id?prod:p))}else{const{data}=await supabase.from("products").insert(prod).select().single();setProducts([...products,data])};setEditingProd(null)}
  async function deleteProd(id:string){await supabase.from("products").delete().eq("id",id);setProducts(products.filter((p:any)=>p.id!==id))}
  function saveAvatar(av:CustomerAvatar){const avatars=brand.customer_avatars||[];const exists=avatars.find((a:CustomerAvatar)=>a.id===av.id);const next=exists?avatars.map((a:CustomerAvatar)=>a.id===av.id?av:a):[...avatars,av];setBrand({...brand,customer_avatars:next});setEditingAvatar(null)}
  function deleteAvatar(id:string){setBrand({...brand,customer_avatars:(brand.customer_avatars||[]).filter((a:CustomerAvatar)=>a.id!==id)})}
  const navBtn=(id:string,label:string)=><button style={{padding:"8px 18px",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",border:"none",background:section===id?C.accent:"transparent",color:section===id?"#fff":C.muted}} onClick={()=>setSection(id)}>{label}</button>

  return<div style={{maxWidth:820,margin:"0 auto",padding:28}}>
    <STitle size={22}>Brand & Products</STitle>
    <div style={{display:"flex",gap:8,marginBottom:24}}>{navBtn("brand","Brand Profile")}{navBtn("avatars",`Customer Avatars (${(brand.customer_avatars||[]).length})`)}{navBtn("products",`Products (${products.length})`)}</div>

    {section==="brand"&&<Card>
      <div style={{marginBottom:16}}>
        <Label>Website URL</Label>
        <div style={{display:"flex",gap:8}}>
          <Input value={brand.website||""} onChange={(e:any)=>{setBrand({...brand,website:e.target.value})}} onKeyDown={(e:any)=>{if(e.key==="Enter")crawlWebsite()}} placeholder="https://yourbrand.com — press Enter to autofill" style={{flex:1}}/>
          <Btn onClick={crawlWebsite} disabled={crawling} style={{background:crawling?C.border:C.accentSoft,color:crawling?C.muted:C.accent,border:"1px solid "+C.accent+"44",flexShrink:0,whiteSpace:"nowrap"}}>{crawling?"⏳ Fetching…":"✨ Autofill"}</Btn>
        </div>
        {crawlError&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#ef4444",marginTop:8}}>{crawlError}</div>}
        <div style={{fontSize:11,color:C.muted,marginTop:6}}>AI visits your website and fills fields in first-person brand voice. Edit anything afterwards.</div>
      </div>
      {[{k:"name",l:"Brand Name"},{k:"description",l:"Brand Description",ta:true,r:3},{k:"voice",l:"Brand Voice & Tone",ta:true,r:3},{k:"target_customer",l:"Target Customer",ta:true,r:3},{k:"reviews",l:"Reviews / Social Proof",ta:true,r:4},{k:"additional_info",l:"Additional Info",ta:true,r:3}].map((f,i,arr)=><div key={f.k} style={{marginBottom:i===arr.length-1?20:16}}><Label>{f.l}</Label><Input value={brand[f.k]||""} onChange={(e:any)=>setBrand({...brand,[f.k]:e.target.value})} textarea={!!(f as any).ta} rows={(f as any).r}/></div>)}
      <Btn onClick={saveBrand} disabled={saving} style={{background:C.accent,color:"#fff"}}>{saving?"Saving…":"Save Brand Profile"}</Btn>
    </Card>}

    {section==="avatars"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{color:C.muted,fontSize:14}}>Select avatars when generating scripts for targeted messaging</div>
        <Btn onClick={()=>setEditingAvatar({id:Date.now().toString(),name:"",age:"",gender:"",description:"",pains:"",desires:"",objections:""})} style={{background:C.accent,color:"#fff"}}>+ New Avatar</Btn>
      </div>
      {editingAvatar&&<Card style={{marginBottom:20,border:"1px solid "+C.accent+"44"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><STitle size={15} mb={0}>{editingAvatar.name||"New Avatar"}</STitle><Btn onClick={()=>setEditingAvatar(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"5px 10px"}}>Cancel</Btn></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:12}}>
          <div><Label>Name *</Label><Input value={editingAvatar.name} onChange={(e:any)=>setEditingAvatar({...editingAvatar,name:e.target.value})} placeholder="e.g. Sarah"/></div>
          <div><Label>Age Range</Label><select value={editingAvatar.age} onChange={e=>setEditingAvatar({...editingAvatar,age:e.target.value})} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}><option value="">Any</option>{AGE_RANGES.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
          <div><Label>Gender</Label><select value={editingAvatar.gender} onChange={e=>setEditingAvatar({...editingAvatar,gender:e.target.value})} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}><option value="">Any</option>{GENDERS.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
        </div>
        <div style={{marginBottom:12}}><Label>Description</Label><Input textarea value={editingAvatar.description} onChange={(e:any)=>setEditingAvatar({...editingAvatar,description:e.target.value})} placeholder="Describe this customer" rows={2}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div><Label>Pain Points</Label><Input textarea value={editingAvatar.pains} onChange={(e:any)=>setEditingAvatar({...editingAvatar,pains:e.target.value})} rows={3}/></div>
          <div><Label>Desires</Label><Input textarea value={editingAvatar.desires} onChange={(e:any)=>setEditingAvatar({...editingAvatar,desires:e.target.value})} rows={3}/></div>
        </div>
        <div style={{marginBottom:16}}><Label>Objections</Label><Input textarea value={editingAvatar.objections} onChange={(e:any)=>setEditingAvatar({...editingAvatar,objections:e.target.value})} rows={2}/></div>
        <Btn onClick={()=>saveAvatar(editingAvatar)} disabled={!editingAvatar.name?.trim()} style={{background:C.accent,color:"#fff",width:"100%",padding:12}}>Save Avatar</Btn>
      </Card>}
      {(brand.customer_avatars||[]).length===0&&!editingAvatar?<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:40,marginBottom:12}}>👤</div><STitle mb={6}>No avatars yet</STitle></Card>
      :<div style={{display:"grid",gap:12}}>{(brand.customer_avatars||[]).map((av:CustomerAvatar)=><Card key={av.id}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:700,fontSize:16,marginBottom:4}}>{av.name}</div><div style={{display:"flex",gap:8,marginBottom:6,flexWrap:"wrap"}}>{av.age&&<Chip label={av.age} color={{bg:"#7c3aed22",color:"#a78bfa"}}/>}{av.gender&&<Chip label={av.gender} color={{bg:"#0891b222",color:"#38bdf8"}}/>}</div>{av.description&&<div style={{fontSize:13,color:C.muted,marginBottom:4}}>{av.description}</div>}{av.pains&&<div style={{fontSize:12,color:C.muted}}><strong style={{color:C.text}}>Pains:</strong> {av.pains.substring(0,100)}</div>}</div><div style={{display:"flex",gap:8,marginLeft:16}}><Btn onClick={()=>setEditingAvatar(av)} style={{background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:12,padding:"6px 12px"}}>Edit</Btn><Btn onClick={()=>deleteAvatar(av.id)} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",fontSize:12,padding:"6px 12px"}}>Delete</Btn></div></div></Card>)}</div>}
      {(brand.customer_avatars||[]).length>0&&<div style={{marginTop:16,textAlign:"right"}}><Btn onClick={saveBrand} disabled={saving} style={{background:C.accent,color:"#fff"}}>{saving?"Saving…":"Save Changes"}</Btn></div>}
    </div>}

    {section==="products"&&!editingProd&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div style={{color:C.muted,fontSize:14}}>Products power script targeting</div><Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{background:C.accent,color:"#fff"}}>+ New Product</Btn></div>
      {products.length===0?<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:40,marginBottom:12}}>📦</div><STitle mb={6}>No products yet</STitle><Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{background:C.accent,color:"#fff",marginTop:8}}>Add First Product</Btn></Card>
      :<div style={{display:"grid",gap:12}}>{products.map((prod:any)=><Card key={prod.id}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:700,fontSize:16,marginBottom:4}}>{prod.name}</div><div style={{fontSize:13,color:C.muted}}>{(prod.description||"").substring(0,130)}</div></div><div style={{display:"flex",gap:8,marginLeft:16}}><Btn onClick={()=>setEditingProd(prod)} style={{background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:12,padding:"6px 12px"}}>Edit</Btn><Btn onClick={()=>deleteProd(prod.id)} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",fontSize:12,padding:"6px 12px"}}>Delete</Btn></div></div></Card>)}</div>}
    </div>}

    {section==="products"&&editingProd&&<Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><STitle size={16} mb={0}>{(editingProd as any).id?"Edit Product":"New Product"}</STitle><Btn onClick={()=>setEditingProd(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Cancel</Btn></div>
      {[{k:"name",l:"Product Name *"},{k:"price",l:"Price",ph:"49.99"},{k:"url",l:"Product URL",ph:"https://"},{k:"description",l:"Description",ta:true,r:3},{k:"benefits",l:"Key Benefits",ta:true,r:3},{k:"claims",l:"Claims & Results",ta:true,r:2},{k:"ingredients",l:"Key Ingredients",ta:true,r:2},{k:"differentiators",l:"What makes this different?",ta:true,r:2},{k:"reviews",l:"Product Reviews",ta:true,r:3},{k:"notes",l:"Script Notes",ta:true,r:2}].map(f=><div key={f.k} style={{marginBottom:13}}><Label>{f.l}</Label><Input value={(editingProd as any)[f.k]||""} onChange={(e:any)=>setEditingProd({...editingProd,[f.k]:e.target.value} as Product)} placeholder={(f as any).ph||""} textarea={!!(f as any).ta} rows={(f as any).r}/></div>)}
      {editingProd.url&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.accent,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span>✨ Product URL detected — autofill fields from this page?</span>
        <button onClick={async()=>{
          try{
            const res=await fetch("/api/brand/crawl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:editingProd.url})})
            const d=await res.json()
            if(d.profile){setEditingProd((prev:any)=>({...prev,name:prev.name||d.profile.name||prev.name,description:d.profile.description||prev.description,benefits:d.profile.additional_info||prev.benefits}))}
          }catch(e){console.error(e)}
        }} style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:600,flexShrink:0}}>Autofill</button>
      </div>}
      <Btn onClick={()=>saveProd(editingProd)} disabled={!editingProd.name?.trim()} style={{background:C.accent,color:"#fff",width:"100%",padding:13,fontSize:15,borderRadius:12,marginTop:4}}>{(editingProd as any).id?"Save Changes":"Add Product"}</Btn>
    </Card>}
  </div>
}

// ── Root App ──────────────────────────────────────────────────────────────
export default function AdForgeApp(){
  const supabase=createClient()
  const [tab,setTab]=useState("library")
  const [libView,setLibView]=useState("grid")
  const [items,setItems]=useState<Item[]>([])
  const [scripts,setScripts]=useState<Script[]>([])
  const [forgedAds,setForgedAds]=useState<ForgedAd[]>([])
  const [brand,setBrand]=useState<BrandProfile>({...DEFAULT_BRAND})
  const [products,setProducts]=useState<Product[]>([])
  const [scriptsStartMode,setScriptsStartMode]=useState(0)
  const [loading,setLoading]=useState(true)

  const loadData=useCallback(async()=>{
    const [itemsRes,scriptsRes,brandRes,productsRes,forgedRes]=await Promise.all([
      supabase.from("items").select("*").order("created_at",{ascending:false}),
      supabase.from("scripts").select("*").order("created_at",{ascending:false}),
      supabase.from("brand_profile").select("*").limit(1).single(),
      supabase.from("products").select("*").order("created_at",{ascending:false}),
      supabase.from("forged_ads").select("*").order("created_at",{ascending:false}),
    ])
    if(itemsRes.data)setItems(itemsRes.data)
    if(scriptsRes.data)setScripts(scriptsRes.data)
    if(brandRes.data)setBrand(brandRes.data)
    if(productsRes.data)setProducts(productsRes.data)
    if(forgedRes.data)setForgedAds(forgedRes.data)
    setLoading(false)
  },[])

  useEffect(()=>{loadData()},[loadData])
  useEffect(()=>{
    const channel=supabase.channel("items-changes").on("postgres_changes",{event:"*",schema:"public",table:"items"},()=>loadData()).subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[loadData])

  async function handleSaveForgedAd(ad:Omit<ForgedAd,"id">){
  const{data,error}=await supabase.from("forged_ads").insert({...ad,updated_at:new Date().toISOString()}).select().single()
  if(error){console.error("Save forged ad error:",error);return null}
  if(data)setForgedAds(prev=>[data,...prev])
  return data
}

  async function handleSignOut(){await supabase.auth.signOut();window.location.href="/login"}

  const tabBtn=(id:string,label:string)=>{const active=tab===id;return<button style={{padding:"10px 20px",background:"none",border:"none",borderBottom:"2px solid "+(active?C.accent:"transparent"),color:active?C.text:C.muted,fontWeight:active?700:500,fontSize:14,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}} onClick={()=>{setTab(id);if(id==="library")setLibView("grid")}}>{label}</button>}
  const draftCount=forgedAds.filter(a=>a.status==="draft").length

  if(loading)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
    <div style={{textAlign:"center"}}>
      <div style={{fontWeight:800,fontSize:24,color:C.accent,marginBottom:8,letterSpacing:"-0.02em"}}>AdForge</div>
      <div style={{fontSize:13,color:C.muted}}>Loading your workspace…</div>
    </div>
  </div>

  const navItem=(id:string,label:string,icon:string)=>{
    const active=tab===id
    return<button onClick={()=>{setTab(id);if(id==="library")setLibView("grid")}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",margin:"0 8px",borderRadius:10,border:"none",background:active?"rgba(91,73,255,0.12)":"transparent",color:active?C.accent:C.muted,fontWeight:active?700:500,fontSize:13,cursor:"pointer",width:"calc(100% - 16px)",textAlign:"left",fontFamily:"inherit",borderRight:active?"2px solid "+C.accent:"2px solid transparent"}}>
      <span style={{fontSize:15,flexShrink:0}}>{icon}</span>{label}
      {id==="forged"&&draftCount>0&&<span style={{background:C.yellow,color:"#fff",borderRadius:99,fontSize:9,padding:"1px 6px",fontWeight:800,marginLeft:"auto"}}>{draftCount}</span>}
    </button>
  }

  return<div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",color:C.text,display:"flex"}}>
    {/* Sidebar */}
    <div style={{width:220,background:"#0F1133",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:50,flexShrink:0}}>
      {/* Brand */}
      <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontWeight:800,fontSize:20,color:"#fff",letterSpacing:"-0.02em",marginBottom:2}}>Ad<span style={{color:"#7C6FFF"}}>Forge</span></div>
        {brand.name&&<div style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontWeight:600,letterSpacing:"0.04em",marginTop:2}}>{brand.name}</div>}
      </div>
      {/* Nav */}
      <div style={{padding:"12px 0",flex:1}}>
        {navItem("library","Library","▦")}
        {navItem("forged","Forged Ads","⚡")}
        {navItem("scripts","Scripts","✦")}
        {navItem("brand","Brand","◉")}
      </div>
      {/* Create Ad CTA */}
      <div style={{padding:"12px 16px 20px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        {tab==="library"&&libView!=="add"&&<button onClick={()=>setLibView("add")} style={{width:"100%",background:"rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.7)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:50,padding:"9px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:8}}>+ Add Content</button>}
        <button onClick={()=>{setScriptsStartMode(c=>c+1);setTab("scripts")}} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:50,padding:"11px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>✦ Create Ad</button>
        <button onClick={handleSignOut} style={{width:"100%",background:"none",border:"none",color:"rgba(255,255,255,0.25)",cursor:"pointer",fontSize:11,marginTop:10,fontFamily:"inherit"}}>Sign out</button>
      </div>
    </div>
    {/* Main content */}
    <div style={{marginLeft:220,flex:1,minHeight:"100vh",background:C.bg}}>
      {tab==="library"&&<LibraryTab items={items} onRefresh={loadData} view={libView} setView={setLibView} brand={brand} products={products} forgedAds={forgedAds} onGoToBrand={()=>setTab("brand")}/>}
      {tab==="scripts"&&<ScriptsTab scripts={scripts} items={items} brand={brand} products={products} onSaveScripts={setScripts} onSaveForgedAd={handleSaveForgedAd} onGoToForged={()=>setTab("forged")} startAtChooseMode={scriptsStartMode}/>}
      {tab==="forged"&&<ForgedAdsTab ads={forgedAds} items={items} onRefresh={loadData}/>}
      {tab==="brand"&&<BrandTab brand={brand} setBrand={setBrand} products={products} setProducts={setProducts}/>}
    </div>
  </div>
}

