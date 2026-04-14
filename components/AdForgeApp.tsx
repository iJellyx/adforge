'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useTheme } from '@/lib/theme-context'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import { Film, Wand2, Zap, Lightbulb, Settings, Sun, Moon, Plus, LogOut } from 'lucide-react'
import type { Item, Script, ForgedAd, BrandProfile, Product } from './adforge/types'
import { C, DEFAULT_BRAND } from './adforge/constants'
import { LibraryTab } from './adforge/tabs/LibraryTab'
import { ScriptsTab } from './adforge/tabs/ScriptsTab'
import { ForgedAdsTab } from './adforge/tabs/ForgedAdsTab'
import { BrandTab } from './adforge/tabs/BrandTab'
import { WinningAdsTab } from './adforge/tabs/WinningAdsTab'

// ── Root App ──────────────────────────────────────────────────────────────
const NAV_ICONS: Record<string,any> = { library: Film, scripts: Wand2, forged: Zap, winning: Lightbulb, brand: Settings }

export default function AdForgeApp(){
  const supabase=createClient()
  const { activeWorkspace, loading: wsLoading } = useWorkspace()
  const { theme, toggleTheme } = useTheme()
  const [tab,setTab]=useState("library")
  const [libView,setLibView]=useState("grid")
  const [items,setItems]=useState<Item[]>([])
  const [scripts,setScripts]=useState<Script[]>([])
  const [forgedAds,setForgedAds]=useState<ForgedAd[]>([])
  const [brand,setBrand]=useState<BrandProfile>({...DEFAULT_BRAND})
  const [products,setProducts]=useState<Product[]>([])
  const [scriptsStartMode,setScriptsStartMode]=useState(0)
  const [editingAd,setEditingAd]=useState<ForgedAd|null>(null)
  const [v2SourceAd,setV2SourceAd]=useState<ForgedAd|null>(null)
  const [loading,setLoading]=useState(true)

  const loadData=useCallback(async()=>{
    if(!activeWorkspace)return
    const wsId=activeWorkspace.id
    const [itemsRes,scriptsRes,brandRes,productsRes,forgedRes]=await Promise.all([
      supabase.from("items").select("*").eq("workspace_id",wsId).order("created_at",{ascending:false}),
      supabase.from("scripts").select("*").eq("workspace_id",wsId).order("created_at",{ascending:false}),
      supabase.from("brand_profile").select("*").eq("workspace_id",wsId).limit(1).single(),
      supabase.from("products").select("*").eq("workspace_id",wsId).order("created_at",{ascending:false}),
      supabase.from("forged_ads").select("*").eq("workspace_id",wsId).order("created_at",{ascending:false}),
    ])
    if(itemsRes.data)setItems(itemsRes.data)
    if(scriptsRes.data)setScripts(scriptsRes.data)
    if(brandRes.data)setBrand(brandRes.data)
    else setBrand({...DEFAULT_BRAND})
    if(productsRes.data)setProducts(productsRes.data)
    if(forgedRes.data)setForgedAds(forgedRes.data)
    setLoading(false)
  },[activeWorkspace])

  useEffect(()=>{if(activeWorkspace)loadData()},[loadData,activeWorkspace])
  useEffect(()=>{
    if(!activeWorkspace)return
    const channel=supabase.channel("items-changes-"+activeWorkspace.id).on("postgres_changes",{event:"*",schema:"public",table:"items",filter:`workspace_id=eq.${activeWorkspace.id}`},()=>loadData()).subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[loadData,activeWorkspace])

  useEffect(()=>{
    function handleKeyDown(e: KeyboardEvent){
      const tag=(e.target as HTMLElement)?.tagName
      if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return
      if(e.metaKey||e.ctrlKey){
        if(e.key==="n"||e.key==="N"){e.preventDefault();setScriptsStartMode(c=>c+1);setTab("scripts")}
        if(e.key==="u"||e.key==="U"){e.preventDefault();setTab("library");setLibView("add")}
      }
    }
    window.addEventListener("keydown",handleKeyDown)
    return()=>window.removeEventListener("keydown",handleKeyDown)
  },[])

  async function handleSaveForgedAd(ad:Omit<ForgedAd,"id">){
  if(!activeWorkspace)return null
  const{data,error}=await supabase.from("forged_ads").insert({...ad,workspace_id:activeWorkspace.id,updated_at:new Date().toISOString()}).select().single()
  if(error){console.error("Save forged ad error:",error);return null}
  if(data){
    setForgedAds(prev=>[data,...prev])
    // Background: score clip-script alignment
    fetch("/api/ads/score",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:data.id})})
      .then(r=>r.json())
      .then(d=>{if(d.score!=null)setForgedAds(prev=>prev.map(a=>a.id===data.id?{...a,metadata:{...a.metadata,score:d.score,grade:d.details?.overall_grade||d.grade,score_details:d.details}}:a))})
      .catch(e=>console.error("Background score error:",e))
  }
  return data
}

  async function handleSignOut(){await supabase.auth.signOut();window.location.href="/login"}

  const draftCount=forgedAds.filter(a=>a.status==="draft").length

  // Onboarding checklist — show when brand is new (no content + incomplete profile)
  const onboardingSteps=[
    {id:"brand",label:"Fill in your brand profile",done:!!(brand.name&&brand.description&&brand.voice),action:()=>setTab("brand"),cta:"Set up Brand →"},
    {id:"product",label:"Add your first product",done:products.length>0,action:()=>setTab("brand"),cta:"Add Product →"},
    {id:"library",label:"Upload 5+ videos",done:items.filter(i=>i.type==="original").length>=5,action:()=>{setTab("library");setLibView("add")},cta:"Upload Videos →"},
    {id:"script",label:"Generate your first ad script",done:scripts.length>0||forgedAds.length>0,action:()=>{setScriptsStartMode(c=>c+1);setTab("scripts")},cta:"Create First Ad →"},
  ]
  const onboardingDone=onboardingSteps.filter(s=>s.done).length
  const showOnboarding=onboardingDone<4&&items.length<10&&forgedAds.length===0

  if(loading||wsLoading||!activeWorkspace)return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
    <div style={{textAlign:"center"}}>
      <div style={{fontWeight:800,fontSize:24,color:C.accent,marginBottom:8,letterSpacing:"-0.02em"}}>AdForge</div>
      <div style={{fontSize:13,color:C.muted}}>Loading your workspace…</div>
    </div>
  </div>

  const navItem=(id:string,label:string)=>{
    const active=tab===id
    const Icon=NAV_ICONS[id]
    return<button onClick={()=>{setTab(id);if(id==="library")setLibView("grid")}} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",margin:"0 10px",borderRadius:10,border:"none",background:active?"var(--af-sidebar-active)":"transparent",color:active?"var(--af-sidebar-text-active)":"var(--af-sidebar-text)",fontWeight:active?700:500,fontSize:13,cursor:"pointer",width:"calc(100% - 20px)",textAlign:"left",fontFamily:"inherit",borderLeft:active?"3px solid var(--af-accent)":"3px solid transparent",transition:"all 0.15s ease"}}>
      {Icon&&<Icon size={17} style={{flexShrink:0,opacity:active?1:0.7}}/>}{label}
      {id==="forged"&&draftCount>0&&<span style={{background:"var(--af-yellow)",color:"#000",borderRadius:99,fontSize:9,padding:"1px 6px",fontWeight:800,marginLeft:"auto"}}>{draftCount}</span>}
    </button>
  }

  return<div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",color:C.text,display:"flex"}}>
    {/* Sidebar */}
    <div style={{width:240,background:"var(--af-sidebar)",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:50,flexShrink:0}}>
      {/* Brand */}
      <div style={{padding:"24px 20px 18px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{fontWeight:800,fontSize:22,color:"#fff",letterSpacing:"-0.03em",marginBottom:10}}>Ad<span style={{color:"var(--af-accent)"}}>Forge</span></div>
        <WorkspaceSwitcher/>
      </div>
      {/* Nav */}
      <div style={{padding:"16px 0",flex:1,display:"flex",flexDirection:"column",gap:2}}>
        {navItem("library","Library")}
        {navItem("scripts","Create Ad")}
        {navItem("forged","My Ads")}
        {navItem("winning","Inspiration")}
        <div style={{flex:1}}/>
        {navItem("brand","Brand")}
      </div>
      {/* Footer */}
      <div style={{padding:"12px 16px 20px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:8}}>
        {tab==="library"&&libView!=="add"&&<button onClick={()=>setLibView("add")} style={{width:"100%",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.6)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:50,padding:"9px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"background 0.15s"}}><Plus size={14}/>Add Content</button>}
        <button onClick={()=>{setScriptsStartMode(c=>c+1);setTab("scripts")}} style={{width:"100%",background:"var(--af-accent)",color:"#fff",border:"none",borderRadius:50,padding:"11px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.15s"}}><Wand2 size={15}/>Create Ad</button>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4}}>
          <button onClick={handleSignOut} style={{background:"none",border:"none",color:"rgba(255,255,255,0.20)",cursor:"pointer",fontSize:11,fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,transition:"color 0.15s"}}><LogOut size={12}/>Sign out</button>
          <button onClick={toggleTheme} style={{background:"rgba(255,255,255,0.06)",border:"none",color:"rgba(255,255,255,0.40)",cursor:"pointer",borderRadius:8,padding:6,display:"flex",alignItems:"center",transition:"all 0.15s"}}>{theme==="dark"?<Sun size={14}/>:<Moon size={14}/>}</button>
        </div>
      </div>
    </div>
    {/* Main content */}
    <div style={{marginLeft:240,flex:1,minHeight:"100vh",background:C.bg}}>
      {/* Onboarding checklist */}
      {showOnboarding&&tab==="library"&&<div style={{background:"#fff",borderBottom:"1px solid "+C.border,padding:"16px 28px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>🚀 Get started — {onboardingDone}/4 complete</div>
          <div style={{fontSize:12,color:C.muted}}>Complete these steps to generate your first winning ad</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {onboardingSteps.map(step=><button key={step.id} onClick={step.done?undefined:step.action} style={{display:"flex",alignItems:"center",gap:6,background:step.done?"#F0FDF4":C.surface,border:"1px solid "+(step.done?"#86EFAC":C.border),borderRadius:8,padding:"6px 12px",cursor:step.done?"default":"pointer",fontSize:12,color:step.done?"#15803D":C.text,fontWeight:step.done?600:500,whiteSpace:"nowrap" as const}}>
            <span style={{fontSize:13}}>{step.done?"✅":"○"}</span>
            {step.done?step.label:step.cta}
          </button>)}
        </div>
      </div>}
      {tab==="library"&&<LibraryTab items={items} onRefresh={loadData} view={libView} setView={setLibView} brand={brand} products={products} onGoToBrand={()=>setTab("brand")} workspaceId={activeWorkspace.id}/>}
      {tab==="scripts"&&<ScriptsTab scripts={scripts} items={items} brand={brand} products={products} onSaveScripts={setScripts} onSaveForgedAd={handleSaveForgedAd} onGoToForged={()=>setTab("forged")} startAtChooseMode={scriptsStartMode} editingAd={editingAd} onEditingAdConsumed={()=>setEditingAd(null)} v2SourceAd={v2SourceAd} onV2Consumed={()=>setV2SourceAd(null)} forgedAds={forgedAds} workspaceId={activeWorkspace.id}/>}
      {tab==="forged"&&<ForgedAdsTab ads={forgedAds} items={items} brand={brand} setBrand={setBrand} onRefresh={loadData} onEditAd={(ad:ForgedAd)=>{setEditingAd(ad);setScriptsStartMode(c=>c+1);setTab("scripts")}} onCreateV2={(ad:ForgedAd)=>{setV2SourceAd(ad);setScriptsStartMode(c=>c+1);setTab("scripts")}}/>}
      {tab==="brand"&&<BrandTab brand={brand} setBrand={setBrand} products={products} setProducts={setProducts} workspaceId={activeWorkspace.id}/>}
      {tab==="winning"&&<WinningAdsTab brand={brand} setBrand={setBrand} products={products} items={items} onSaveForgedAd={handleSaveForgedAd} onGoToForged={()=>setTab("forged")} workspaceId={activeWorkspace.id}/>}
    </div>
  </div>
}
