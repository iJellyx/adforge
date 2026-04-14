'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import type { Item, Script, ForgedAd, BrandProfile, Product } from './adforge/types'
import { C, DEFAULT_BRAND } from './adforge/constants'
import { LibraryTab } from './adforge/tabs/LibraryTab'
import { ScriptsTab } from './adforge/tabs/ScriptsTab'
import { ForgedAdsTab } from './adforge/tabs/ForgedAdsTab'
import { BrandTab } from './adforge/tabs/BrandTab'
import { WinningAdsTab } from './adforge/tabs/WinningAdsTab'

// ── Root App ──────────────────────────────────────────────────────────────
export default function AdForgeApp(){
  const supabase=createClient()
  const { activeWorkspace, loading: wsLoading } = useWorkspace()
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
        <div style={{fontWeight:800,fontSize:20,color:"#fff",letterSpacing:"-0.02em",marginBottom:8}}>Ad<span style={{color:"#7C6FFF"}}>Forge</span></div>
        <WorkspaceSwitcher/>
      </div>
      {/* Nav */}
      <div style={{padding:"12px 0",flex:1}}>
        {navItem("library","Library","✂️")}
        {navItem("scripts","Create Ad","✦")}
        {navItem("forged","My Ads","⚡")}
        {navItem("winning","Inspiration","💡")}
        {navItem("brand","Brand","⚙️")}
      </div>
      {/* Footer */}
      <div style={{padding:"12px 16px 20px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        {tab==="library"&&libView!=="add"&&<button onClick={()=>setLibView("add")} style={{width:"100%",background:"rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.7)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:50,padding:"9px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:8}}>+ Add Content</button>}
        <button onClick={()=>{setScriptsStartMode(c=>c+1);setTab("scripts")}} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:50,padding:"11px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>✦ Create Ad</button>
        <button onClick={handleSignOut} style={{width:"100%",background:"none",border:"none",color:"rgba(255,255,255,0.25)",cursor:"pointer",fontSize:11,marginTop:10,fontFamily:"inherit"}}>Sign out</button>
      </div>
    </div>
    {/* Main content */}
    <div style={{marginLeft:220,flex:1,minHeight:"100vh",background:C.bg}}>
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
