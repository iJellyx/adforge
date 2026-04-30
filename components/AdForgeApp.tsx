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

  async function handleSaveForgedAd(ad:Omit<ForgedAd,"id">):Promise<ForgedAd|null>{
  if(!activeWorkspace)return null
  // Strip the placeholder id used by GenerationFlow before inserting
  const { id: _ignore, ...insertable } = ad as any
  const{data,error}=await supabase.from("forged_ads").insert({...insertable,workspace_id:activeWorkspace.id,updated_at:new Date().toISOString()}).select().single()
  if(error){console.error("Save forged ad error:",error);return null}
  if(data){
    setForgedAds(prev=>[data,...prev])
    // Background: score clip-script alignment
    fetch("/api/ads/score",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:data.id})})
      .then(r=>r.json())
      .then(d=>{if(d.score!=null)setForgedAds(prev=>prev.map(a=>a.id===data.id?{...a,metadata:{...a.metadata,score:d.score,grade:d.details?.overall_grade||d.grade,score_details:d.details}}:a))})
      .catch(e=>console.error("Background score error:",e))
  }
  return data as ForgedAd
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
    return<button key={id} onClick={()=>{setTab(id);if(id==="library")setLibView("grid")}} style={{display:"flex",alignItems:"center",gap:11,padding:"8px 12px",margin:"0 10px",borderRadius:8,border:"none",background:active?"var(--af-sidebar-active)":"transparent",color:active?"var(--af-sidebar-text-active)":"var(--af-sidebar-text)",fontWeight:active?600:500,fontSize:13,cursor:"pointer",width:"calc(100% - 20px)",textAlign:"left",fontFamily:"inherit",transition:"all 0.15s ease",letterSpacing:"-0.005em"}} onMouseEnter={e=>{if(!active)(e.currentTarget as any).style.background="var(--af-sidebar-hover)"}} onMouseLeave={e=>{if(!active)(e.currentTarget as any).style.background="transparent"}}>
      {Icon&&<Icon size={16} strokeWidth={active?2.2:1.8} style={{flexShrink:0,opacity:active?1:0.75}}/>}<span style={{flex:1}}>{label}</span>
      {id==="forged"&&draftCount>0&&<span style={{background:"var(--af-yellow)",color:"#000",borderRadius:99,fontSize:9.5,padding:"1px 6px",fontWeight:700}}>{draftCount}</span>}
    </button>
  }
  const navSection=(label:string)=><div style={{padding:"14px 22px 6px",fontSize:10.5,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--af-sidebar-section-label)"}}>{label}</div>

  return<div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",color:C.text,display:"flex"}}>
    {/* Sidebar */}
    <div style={{width:232,background:"var(--af-sidebar)",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:50,flexShrink:0,borderRight:"1px solid rgba(255,255,255,0.04)"}}>
      {/* Brand */}
      <div style={{padding:"22px 20px 16px"}}>
        <div style={{fontWeight:800,fontSize:20,color:"#fff",letterSpacing:"-0.03em",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#8B7FFF,#5B49FF)",boxShadow:"0 4px 12px rgba(139,127,255,0.3)"}}><Wand2 size={14} color="#fff" strokeWidth={2.5}/></span>
          Ad<span style={{color:"var(--af-accent)"}}>Forge</span>
        </div>
        <WorkspaceSwitcher/>
      </div>
      {/* Nav */}
      <div style={{padding:"4px 0 16px",flex:1,display:"flex",flexDirection:"column",overflowY:"auto"}}>
        {navSection("Content")}
        {navItem("library","Library")}
        {navSection("Ads")}
        {navItem("scripts","Create Ad")}
        {navItem("forged","My Ads")}
        {navItem("winning","Inspiration")}
        <div style={{flex:1}}/>
        {navSection("Settings")}
        {navItem("brand","Brand")}
      </div>
      {/* Footer */}
      <div style={{padding:"12px 14px 18px",borderTop:"1px solid rgba(255,255,255,0.04)",display:"flex",flexDirection:"column",gap:8}}>
        <button onClick={()=>{setScriptsStartMode(c=>c+1);setTab("scripts")}} style={{width:"100%",background:"var(--af-accent)",color:"#fff",border:"none",borderRadius:8,padding:"10px 12px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7,transition:"all 0.15s",letterSpacing:"-0.005em"}} onMouseEnter={e=>(e.currentTarget as any).style.background="var(--af-accent-hover)"} onMouseLeave={e=>(e.currentTarget as any).style.background="var(--af-accent)"}><Wand2 size={14} strokeWidth={2.2}/>New ad</button>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:4}}>
          <button onClick={handleSignOut} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:11.5,fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,transition:"color 0.15s",padding:"4px 6px"}} onMouseEnter={e=>(e.currentTarget as any).style.color="rgba(255,255,255,0.6)"} onMouseLeave={e=>(e.currentTarget as any).style.color="rgba(255,255,255,0.3)"}><LogOut size={12}/>Sign out</button>
          <button onClick={toggleTheme} title={theme==="dark"?"Switch to light":"Switch to dark"} style={{background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",borderRadius:7,padding:7,display:"flex",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>{(e.currentTarget as any).style.background="rgba(255,255,255,0.1)";(e.currentTarget as any).style.color="rgba(255,255,255,0.8)"}} onMouseLeave={e=>{(e.currentTarget as any).style.background="rgba(255,255,255,0.05)";(e.currentTarget as any).style.color="rgba(255,255,255,0.5)"}}>{theme==="dark"?<Sun size={14}/>:<Moon size={14}/>}</button>
        </div>
      </div>
    </div>
    {/* Main content */}
    <div style={{marginLeft:232,flex:1,minHeight:"100vh",background:C.bg}}>
      {/* Onboarding checklist */}
      {showOnboarding&&tab==="library"&&<div style={{background:"var(--af-card)",borderBottom:"1px solid var(--af-border)",padding:"18px 28px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:3,letterSpacing:"-0.01em"}}>Get started · <span style={{color:"var(--af-accent)"}}>{onboardingDone}/4 complete</span></div>
          <div style={{fontSize:12,color:"var(--af-text-secondary)"}}>Complete these steps to generate your first winning ad</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {onboardingSteps.map(step=><button key={step.id} onClick={step.done?undefined:step.action} style={{display:"flex",alignItems:"center",gap:7,background:step.done?"var(--af-green-soft)":"var(--af-surface)",border:"1px solid "+(step.done?"rgba(74,222,128,0.25)":"var(--af-border)"),borderRadius:8,padding:"7px 12px",cursor:step.done?"default":"pointer",fontSize:12,color:step.done?"var(--af-green)":"var(--af-text)",fontWeight:step.done?600:500,whiteSpace:"nowrap" as const,fontFamily:"inherit",transition:"all 0.15s"}}>
            {step.done?"✓":"○"} {step.done?step.label:step.cta}
          </button>)}
        </div>
      </div>}
      {tab==="library"&&<LibraryTab items={items} onRefresh={loadData} view={libView} setView={setLibView} brand={brand} products={products} onGoToBrand={()=>setTab("brand")} workspaceId={activeWorkspace.id}/>}
      {tab==="scripts"&&<ScriptsTab scripts={scripts} items={items} brand={brand} products={products} onSaveScripts={setScripts} onSaveForgedAd={handleSaveForgedAd} onGoToForged={()=>setTab("forged")} startAtChooseMode={scriptsStartMode} editingAd={editingAd} onEditingAdConsumed={()=>setEditingAd(null)} v2SourceAd={v2SourceAd} onV2Consumed={()=>setV2SourceAd(null)} forgedAds={forgedAds} workspaceId={activeWorkspace.id}/>}
      {tab==="forged"&&<ForgedAdsTab ads={forgedAds} items={items} brand={brand} setBrand={setBrand} onRefresh={loadData} onEditAd={(ad:ForgedAd)=>{setEditingAd(ad);setScriptsStartMode(c=>c+1);setTab("scripts")}} onCreateV2={(ad:ForgedAd)=>{setV2SourceAd(ad);setScriptsStartMode(c=>c+1);setTab("scripts")}} workspaceId={activeWorkspace.id}/>}
      {tab==="brand"&&<BrandTab brand={brand} setBrand={setBrand} products={products} setProducts={setProducts} workspaceId={activeWorkspace.id}/>}
      {tab==="winning"&&<WinningAdsTab brand={brand} setBrand={setBrand} products={products} items={items} onSaveForgedAd={handleSaveForgedAd} onGoToForged={()=>setTab("forged")} workspaceId={activeWorkspace.id}/>}
    </div>
  </div>
}
