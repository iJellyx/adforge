'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useTheme } from '@/lib/theme-context'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import type { Item, Script, ForgedAd, BrandProfile, Product } from './adforge/types'
import { DEFAULT_BRAND } from './adforge/constants'
import { LibraryTab } from './adforge/tabs/LibraryTab'
import { ScriptsTab } from './adforge/tabs/ScriptsTab'
import { ForgedAdsTab } from './adforge/tabs/ForgedAdsTab'
import { BrandTab } from './adforge/tabs/BrandTab'
import { WinningAdsTab } from './adforge/tabs/WinningAdsTab'
import { Scissors, Wand2, Zap, Lightbulb, Settings, Plus, LogOut, Sun, Moon, CheckCircle2, Circle, Rocket } from 'lucide-react'

// ── Root App ──────────────────────────────────────────────────────────────
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
    {id:"brand",label:"Fill in your brand profile",done:!!(brand.name&&brand.description&&brand.voice),action:()=>setTab("brand"),cta:"Set up Brand"},
    {id:"product",label:"Add your first product",done:products.length>0,action:()=>setTab("brand"),cta:"Add Product"},
    {id:"library",label:"Upload 5+ videos",done:items.filter(i=>i.type==="original").length>=5,action:()=>{setTab("library");setLibView("add")},cta:"Upload Videos"},
    {id:"script",label:"Generate your first ad script",done:scripts.length>0||forgedAds.length>0,action:()=>{setScriptsStartMode(c=>c+1);setTab("scripts")},cta:"Create First Ad"},
  ]
  const onboardingDone=onboardingSteps.filter(s=>s.done).length
  const showOnboarding=onboardingDone<4&&items.length<10&&forgedAds.length===0

  if(loading||wsLoading||!activeWorkspace)return(
    <div className="bg-bg min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="font-extrabold text-2xl text-accent tracking-tight mb-2">AdForge</div>
        <div className="text-sm text-text-muted">Loading your workspace...</div>
      </div>
    </div>
  )

  const NAV_ITEMS = [
    { id: "library", label: "Library", icon: Scissors },
    { id: "scripts", label: "Create Ad", icon: Wand2 },
    { id: "forged", label: "My Ads", icon: Zap },
    { id: "winning", label: "Inspiration", icon: Lightbulb },
    { id: "brand", label: "Brand", icon: Settings },
  ]

  return(
    <div className="bg-bg min-h-screen text-text flex">
      {/* Sidebar */}
      <div className="w-[240px] bg-sidebar flex flex-col fixed top-0 left-0 bottom-0 z-50 shrink-0">
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="font-extrabold text-xl text-white tracking-tight mb-2">
            Ad<span className="text-accent">Forge</span>
          </div>
          <WorkspaceSwitcher/>
        </div>
        {/* Nav */}
        <div className="py-3 flex-1 flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => { setTab(id); if (id === "library") setLibView("grid") }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left cursor-pointer border-none ${
                  active
                    ? "bg-sidebar-active text-accent font-semibold border-l-2 border-accent"
                    : "text-white/50 hover:text-white/80 hover:bg-sidebar-hover"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {id === "forged" && draftCount > 0 && (
                  <span className="bg-warning text-black rounded-full text-[9px] px-1.5 py-0.5 font-bold ml-auto">
                    {draftCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* Footer */}
        <div className="px-4 pb-5 pt-3 border-t border-white/[0.06] flex flex-col gap-2">
          {tab === "library" && libView !== "add" && (
            <button
              onClick={() => setLibView("add")}
              className="w-full bg-white/[0.06] text-white/60 border border-white/[0.08] rounded-full py-2 text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Content
            </button>
          )}
          <button
            onClick={() => { setScriptsStartMode(c => c + 1); setTab("scripts") }}
            className="w-full bg-accent text-white rounded-full py-2.5 text-sm font-bold hover:bg-accent-hover active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <Wand2 className="w-4 h-4" /> Create Ad
          </button>
          <div className="flex items-center justify-between">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSignOut}
              className="text-white/20 hover:text-white/40 text-[11px] cursor-pointer transition-colors flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-[240px] flex-1 min-h-screen bg-bg">
        {/* Onboarding checklist */}
        {showOnboarding && tab === "library" && (
          <div className="bg-card border-b border-border px-7 py-4 flex items-center gap-5 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-bold text-sm mb-0.5 flex items-center gap-2">
                <Rocket className="w-4 h-4 text-accent" /> Get started — {onboardingDone}/4 complete
              </div>
              <div className="text-xs text-text-muted">Complete these steps to generate your first winning ad</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {onboardingSteps.map(step => (
                <button
                  key={step.id}
                  onClick={step.done ? undefined : step.action}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                    step.done
                      ? "bg-success-soft border-success/30 text-success"
                      : "bg-surface border-border text-text hover:border-border-strong cursor-pointer"
                  }`}
                >
                  {step.done
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : <Circle className="w-3.5 h-3.5" />}
                  {step.done ? step.label : step.cta}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab==="library"&&<LibraryTab items={items} onRefresh={loadData} view={libView} setView={setLibView} brand={brand} products={products} onGoToBrand={()=>setTab("brand")} workspaceId={activeWorkspace.id}/>}
        {tab==="scripts"&&<ScriptsTab scripts={scripts} items={items} brand={brand} products={products} onSaveScripts={setScripts} onSaveForgedAd={handleSaveForgedAd} onGoToForged={()=>setTab("forged")} startAtChooseMode={scriptsStartMode} editingAd={editingAd} onEditingAdConsumed={()=>setEditingAd(null)} v2SourceAd={v2SourceAd} onV2Consumed={()=>setV2SourceAd(null)} forgedAds={forgedAds} workspaceId={activeWorkspace.id}/>}
        {tab==="forged"&&<ForgedAdsTab ads={forgedAds} items={items} brand={brand} setBrand={setBrand} onRefresh={loadData} onEditAd={(ad:ForgedAd)=>{setEditingAd(ad);setScriptsStartMode(c=>c+1);setTab("scripts")}} onCreateV2={(ad:ForgedAd)=>{setV2SourceAd(ad);setScriptsStartMode(c=>c+1);setTab("scripts")}}/>}
        {tab==="brand"&&<BrandTab brand={brand} setBrand={setBrand} products={products} setProducts={setProducts} workspaceId={activeWorkspace.id}/>}
        {tab==="winning"&&<WinningAdsTab brand={brand} setBrand={setBrand} products={products} items={items} onSaveForgedAd={handleSaveForgedAd} onGoToForged={()=>setTab("forged")} workspaceId={activeWorkspace.id}/>}
      </div>
    </div>
  )
}
