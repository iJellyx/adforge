'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandProfile, Product, CustomerAvatar } from '../types'
import { C, GENDERS, AGE_RANGES, DEFAULT_PRODUCT } from '../constants'
import { Btn, Label, Card, STitle, Input, Chip } from '../ui-primitives'
import { Brain, Lightbulb, ChevronRight, ChevronDown, User, Package, AlertTriangle, Sparkles, Globe, Search } from 'lucide-react'

export function BrandTab({brand,setBrand,products,setProducts,workspaceId}:any){
  const supabase=createClient()
  const [section,setSection]=useState("brand")
  const [saving,setSaving]=useState(false)
  const [crawling,setCrawling]=useState(false)
  const [crawlError,setCrawlError]=useState("")
  const [editingProd,setEditingProd]=useState<Product|null>(null)
  const [editingAvatar,setEditingAvatar]=useState<CustomerAvatar|null>(null)
  const [generatingAvatars,setGeneratingAvatars]=useState(false)
  const [avatarError,setAvatarError]=useState("")
  const [findingProducts,setFindingProducts]=useState(false)
  const [productError,setProductError]=useState("")
  const [showAdvancedProduct,setShowAdvancedProduct]=useState(false)
  const [avatarsCollapsed,setAvatarsCollapsed]=useState((brand.customer_avatars||[]).length>0)
  const [productsCollapsed,setProductsCollapsed]=useState(products.length>0)

  async function saveBrand(){
    setSaving(true)
    if(brand.id){
      await supabase.from("brand_profile").update(brand).eq("id",brand.id)
    } else {
      const{data:existing}=await supabase.from("brand_profile").select("id").eq("workspace_id",workspaceId).limit(1).single()
      if(existing?.id){
        await supabase.from("brand_profile").update(brand).eq("id",existing.id)
        setBrand({...brand,id:existing.id})
      } else {
        const{data}=await supabase.from("brand_profile").insert({...brand,workspace_id:workspaceId}).select().single()
        if(data)setBrand(data)
      }
    }
    setSaving(false)
  }

  async function crawlWebsite(){if(!brand.website?.trim()){setCrawlError("Enter a website URL first.");return};setCrawling(true);setCrawlError("");try{const res=await fetch("/api/brand/crawl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:brand.website})});const d=await res.json();if(d.error)throw new Error(d.error);setBrand({...brand,...d.profile,id:brand.id,customer_avatars:brand.customer_avatars||[]})}catch(e:any){setCrawlError(e.message||"Could not fetch website.")};setCrawling(false)}
  async function saveProd(prod:Product){if((prod as any).id){await supabase.from("products").update(prod).eq("id",(prod as any).id);setProducts(products.map((p:any)=>p.id===(prod as any).id?prod:p))}else{const{data}=await supabase.from("products").insert({...prod,workspace_id:workspaceId}).select().single();setProducts([...products,data])};setEditingProd(null)}
  async function deleteProd(id:string){await supabase.from("products").delete().eq("id",id);setProducts(products.filter((p:any)=>p.id!==id))}
  function saveAvatar(av:CustomerAvatar){const avatars=brand.customer_avatars||[];const exists=avatars.find((a:CustomerAvatar)=>a.id===av.id);const next=exists?avatars.map((a:CustomerAvatar)=>a.id===av.id?av:a):[...avatars,av];setBrand({...brand,customer_avatars:next});setEditingAvatar(null)}
  function deleteAvatar(id:string){setBrand({...brand,customer_avatars:(brand.customer_avatars||[]).filter((a:CustomerAvatar)=>a.id!==id)})}

  async function generateAvatars(){
    setGeneratingAvatars(true);setAvatarError("")
    try{
      const res=await fetch("/api/brand/avatars",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brand})})
      const d=await res.json()
      if(d.error)throw new Error(d.error)
      if(d.avatars&&d.avatars.length>0){
        const toStr=(v:any)=>Array.isArray(v)?v.join('\n'):(v||'').toString()
        const safe=d.avatars.map((a:any)=>({id:a.id||Date.now().toString(),name:toStr(a.name),age:toStr(a.age),gender:toStr(a.gender),description:toStr(a.description),pains:toStr(a.pains),desires:toStr(a.desires),objections:toStr(a.objections)}))
        setBrand({...brand,customer_avatars:safe})
      }
    }catch(e:any){setAvatarError(e.message||"Failed to generate avatars.")}
    setGeneratingAvatars(false)
  }

  async function findProducts(){
    if(!brand.website?.trim()){setProductError("Add a website URL in your Brand Profile first.");return}
    setFindingProducts(true);setProductError("")
    try{
      const res=await fetch("/api/brand/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:brand.website})})
      const d=await res.json()
      if(d.error)throw new Error(d.error)
      if(d.products&&d.products.length>0){
        const remaining=3-products.length
        const toAdd=d.products.slice(0,Math.max(0,remaining))
        const saved:Product[]=[]
        for(const prod of toAdd){
          const{data}=await supabase.from("products").insert({...prod,workspace_id:workspaceId}).select().single()
          if(data)saved.push(data)
        }
        setProducts([...products,...saved])
      }else{
        setProductError("No products found on the website. Try adding them manually.")
      }
    }catch(e:any){setProductError(e.message||"Failed to find products.")}
    setFindingProducts(false)
  }

  // Brand intelligence score calculation
  function calcScore():{score:number,max:number,items:{label:string,pts:number,earned:boolean,tip:string}[]}{
    const b=brand;const ps=products
    const checks=[
      {label:"Brand name",pts:2,earned:!!(b.name?.trim()),tip:"Add your brand name"},
      {label:"Brand description (100+ chars)",pts:5,earned:(b.description||"").length>=100,tip:"Describe what your brand does in detail"},
      {label:"Brand voice & tone (50+ chars)",pts:5,earned:(b.voice||"").length>=50,tip:"Describe your brand's personality and tone"},
      {label:"Target customer (50+ chars)",pts:5,earned:(b.target_customer||"").length>=50,tip:"Describe your ideal customer"},
      {label:"Social proof / reviews",pts:5,earned:(b.reviews||"").length>=30,tip:"Paste customer reviews or testimonials"},
      {label:"Additional info",pts:3,earned:(b.additional_info||"").length>=30,tip:"Ingredients, certifications, brand backstory"},
      {label:"At least 1 customer avatar",pts:5,earned:(b.customer_avatars||[]).length>=1,tip:"Create an avatar with pains, desires & objections"},
      {label:"At least 1 product",pts:5,earned:ps.length>=1,tip:"Add your first product"},
      {label:"Product benefits & claims",pts:5,earned:ps.some((p:Product)=>(p.benefits||"").length>20&&(p.claims||"").length>20),tip:"Fill in product benefits and specific claims"},
      {label:"Product differentiators",pts:5,earned:ps.some((p:Product)=>(p.differentiators||"").length>20),tip:"What makes your product unique vs competitors?"},
      {label:"Product reviews",pts:5,earned:ps.some((p:Product)=>(p.reviews||"").length>20),tip:"Paste specific product reviews — quoted in scripts"},
      {label:"Product price",pts:5,earned:ps.some((p:Product)=>!!(p.price?.trim())),tip:"Add price — unlocks specific CTA copy"},
    ]
    const score=checks.reduce((acc,c)=>acc+(c.earned?c.pts:0),0)
    const max=checks.reduce((acc,c)=>acc+c.pts,0)
    return{score,max,items:checks}
  }

  const {score:intellScore,max:intellMax,items:intellItems}=calcScore()
  const displayPct=Math.min(90,Math.round(intellScore/intellMax*90))

  return(
    <div className="max-w-3xl mx-auto p-7">
      <STitle size={22}>Brand & Products</STitle>

      <div className="bg-accent-soft border border-accent/20 rounded-lg px-4 py-3 text-sm text-accent mb-5 flex items-center gap-2">
        <Lightbulb className="w-4 h-4 shrink-0" /> The more brand context you provide, the better your AI-generated scripts will be. Focus on Name, Description, and Voice first.
      </div>

      {/* Intelligence Score */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1">
            <div className="font-extrabold text-[15px] mb-0.5 flex items-center gap-1.5"><Brain className="w-4 h-4" /> Platform Intelligence Score</div>
            <div className="text-xs text-text-muted">How well the platform knows your brand. Higher = better scripts, smarter clip matching.</div>
          </div>
          <div className={`text-4xl font-black min-w-16 text-right ${displayPct>=80?"text-success":displayPct>=50?"text-accent":"text-warning"}`}>{displayPct}%</div>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-[width] duration-600" style={{width:displayPct+"%",background:displayPct>=80?"linear-gradient(90deg,#16A34A,#22c55e)":"linear-gradient(90deg,var(--color-accent),#8B7FFF)"}}/>
        </div>
        {intellItems.filter(i=>!i.earned).length>0&&<div>
          <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">Fill these to improve:</div>
          <div className="flex flex-col gap-1">
            {intellItems.filter(i=>!i.earned).map(i=><div key={i.label} className="flex items-center gap-2 text-xs">
              <span className="text-warning font-bold text-[11px] min-w-7">+{i.pts}</span>
              <span className="text-text-muted">{i.tip}</span>
            </div>)}
          </div>
        </div>}
        {displayPct>=70&&<div className="text-[11px] text-text-muted mt-2">The final 10% is earned through usage — the platform learns from your ad performance data over time.</div>}
      </div>

      <div className="flex gap-2 mb-6">
        {[{id:"brand",label:"Brand Profile",icon:Globe},{id:"avatars",label:`Customer Avatars (${(brand.customer_avatars||[]).length})`,icon:User},{id:"products",label:`Products (${products.length})`,icon:Package}].map(nav=>
          <button key={nav.id} onClick={()=>setSection(nav.id)} className={`px-4 py-2 rounded-full text-sm font-semibold cursor-pointer border-none transition-all flex items-center gap-1.5 ${section===nav.id?"bg-accent text-white":"bg-transparent text-text-muted hover:text-text hover:bg-surface"}`}>
            <nav.icon className="w-3.5 h-3.5" /> {nav.label}
          </button>
        )}
      </div>

      {section==="brand"&&<Card>
        <div className="mb-4">
          <Label>Website URL</Label>
          <div className="flex gap-2">
            <Input value={brand.website||""} onChange={(e:any)=>{setBrand({...brand,website:e.target.value})}} onKeyDown={(e:any)=>{if(e.key==="Enter")crawlWebsite()}} placeholder="https://yourbrand.com — press Enter to autofill" style={{flex:1}}/>
            <Btn onClick={crawlWebsite} disabled={crawling} style={{background:crawling?"var(--color-border)":"var(--color-accent-soft)",color:crawling?"var(--color-text-muted)":"var(--color-accent)",border:"1px solid var(--color-accent-muted)",flexShrink:0,whiteSpace:"nowrap"}}>{crawling?(<><Sparkles className="w-3.5 h-3.5 inline animate-pulse-soft"/> Fetching...</>):(<><Sparkles className="w-3.5 h-3.5 inline"/> Autofill</>)}</Btn>
          </div>
          {crawlError&&<div className="bg-danger-soft border border-danger/20 rounded-lg px-3 py-2 text-xs text-danger mt-2">{crawlError}</div>}
          <div className="text-[11px] text-text-muted mt-1.5">AI visits your website and fills fields in first-person brand voice. Edit anything afterwards.</div>
        </div>
        {[{k:"name",l:"Brand Name",req:true},{k:"description",l:"Brand Description",ta:true,r:3,req:true},{k:"voice",l:"Brand Voice & Tone",ta:true,r:3,req:true},{k:"target_customer",l:"Target Customer",ta:true,r:3},{k:"reviews",l:"Reviews / Social Proof",ta:true,r:4},{k:"additional_info",l:"Additional Info",ta:true,r:3}].map((f,i,arr)=><div key={f.k} className={i===arr.length-1?"mb-5":"mb-4"}><Label>{f.l}{(f as any).req?<span className="text-accent font-bold ml-1 text-[10px]">Required</span>:<span className="text-text-muted font-normal ml-1 text-[10px] opacity-70">(optional)</span>}</Label><Input value={brand[f.k]||""} onChange={(e:any)=>setBrand({...brand,[f.k]:e.target.value})} textarea={!!(f as any).ta} rows={(f as any).r}/></div>)}
        <Btn onClick={saveBrand} disabled={saving} style={{background:"var(--color-accent)",color:"#fff"}}>{saving?"Saving...":"Save Brand Profile"}</Btn>
      </Card>}

      {section==="avatars"&&<div>
        <div className="flex justify-between items-center mb-3">
          <div className="text-text-muted text-sm">Select avatars when generating scripts for targeted messaging</div>
          <div className="flex gap-2">
            <Btn onClick={generateAvatars} disabled={generatingAvatars} style={{background:generatingAvatars?"var(--color-border)":"var(--color-accent-soft)",color:generatingAvatars?"var(--color-text-muted)":"var(--color-accent)",border:"1px solid var(--color-accent-muted)",whiteSpace:"nowrap"}}>{generatingAvatars?(<><Sparkles className="w-3.5 h-3.5 inline animate-pulse-soft"/> Generating...</>):(<><Sparkles className="w-3.5 h-3.5 inline"/> Auto-Generate 3</>)}</Btn>
            <Btn onClick={()=>setEditingAvatar({id:Date.now().toString(),name:"",age:"",gender:"",description:"",pains:"",desires:"",objections:""})} style={{background:"var(--color-accent)",color:"#fff"}}>+ New Avatar</Btn>
          </div>
        </div>
        {(brand.customer_avatars||[]).length>0&&<button onClick={()=>setAvatarsCollapsed(!avatarsCollapsed)} className="bg-transparent border-none text-text-muted cursor-pointer text-xs mb-3 p-0 flex items-center gap-1 hover:text-text transition-colors">{avatarsCollapsed?<><ChevronRight className="w-3 h-3"/> Show {(brand.customer_avatars||[]).length} avatar{(brand.customer_avatars||[]).length!==1?"s":""}</>:<><ChevronDown className="w-3 h-3"/> Hide avatars</>}</button>}
        {!avatarsCollapsed&&<div className="mb-2">
        {avatarError&&<div className="bg-danger-soft border border-danger/20 rounded-lg px-3 py-2 text-xs text-danger mb-3">{avatarError}</div>}
        {generatingAvatars&&<Card style={{textAlign:"center",padding:40,marginBottom:12}}><Brain className="w-8 h-8 mx-auto mb-2 text-accent animate-pulse-soft" /><div className="font-semibold text-sm mb-1">Analyzing your brand...</div><div className="text-xs text-text-muted">Generating 3 customer avatars based on your brand profile. This takes 10-15 seconds.</div></Card>}
        {editingAvatar&&<Card style={{marginBottom:20,border:"1px solid var(--color-accent-muted)"}}>
          <div className="flex justify-between items-center mb-4"><STitle size={15} mb={0}>{editingAvatar.name||"New Avatar"}</STitle><Btn onClick={()=>setEditingAvatar(null)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:12,padding:"5px 10px"}}>Cancel</Btn></div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 mb-3">
            <div><Label>Name *</Label><Input value={editingAvatar.name} onChange={(e:any)=>setEditingAvatar({...editingAvatar,name:e.target.value})} placeholder="e.g. Sarah"/></div>
            <div><Label>Age Range</Label><select value={editingAvatar.age} onChange={e=>setEditingAvatar({...editingAvatar,age:e.target.value})} className="bg-surface border border-border rounded-lg px-3 py-2 text-text text-sm outline-none w-full cursor-pointer"><option value="">Any</option>{AGE_RANGES.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
            <div><Label>Gender</Label><select value={editingAvatar.gender} onChange={e=>setEditingAvatar({...editingAvatar,gender:e.target.value})} className="bg-surface border border-border rounded-lg px-3 py-2 text-text text-sm outline-none w-full cursor-pointer"><option value="">Any</option>{GENDERS.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
          </div>
          <div className="mb-3"><Label>Description</Label><Input textarea value={editingAvatar.description} onChange={(e:any)=>setEditingAvatar({...editingAvatar,description:e.target.value})} placeholder="Describe this customer" rows={2}/></div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><Label>Pain Points</Label><Input textarea value={editingAvatar.pains} onChange={(e:any)=>setEditingAvatar({...editingAvatar,pains:e.target.value})} rows={3}/></div>
            <div><Label>Desires</Label><Input textarea value={editingAvatar.desires} onChange={(e:any)=>setEditingAvatar({...editingAvatar,desires:e.target.value})} rows={3}/></div>
          </div>
          <div className="mb-4"><Label>Objections</Label><Input textarea value={editingAvatar.objections} onChange={(e:any)=>setEditingAvatar({...editingAvatar,objections:e.target.value})} rows={2}/></div>
          <Btn onClick={()=>saveAvatar(editingAvatar)} disabled={!editingAvatar.name?.trim()} style={{background:"var(--color-accent)",color:"#fff",width:"100%",padding:12}}>Save Avatar</Btn>
        </Card>}
        {(brand.customer_avatars||[]).length===0&&!editingAvatar?<Card style={{textAlign:"center",padding:60}}><User className="w-10 h-10 mx-auto mb-3 text-text-muted" /><STitle mb={6}>No avatars yet</STitle></Card>
        :<div className="grid gap-3">{(brand.customer_avatars||[]).map((av:CustomerAvatar)=><Card key={av.id}><div className="flex justify-between items-start"><div><div className="font-bold text-base mb-1">{av.name}</div><div className="flex gap-2 mb-1.5 flex-wrap">{av.age&&<Chip label={av.age} color={{bg:"#7c3aed22",color:"#a78bfa"}}/>}{av.gender&&<Chip label={av.gender} color={{bg:"#0891b222",color:"#38bdf8"}}/>}</div>{av.description&&<div className="text-sm text-text-muted mb-1">{av.description}</div>}{av.pains&&<div className="text-xs text-text-muted"><strong className="text-text">Pains:</strong> {av.pains.substring(0,100)}</div>}</div><div className="flex gap-2 ml-4"><Btn onClick={()=>setEditingAvatar(av)} style={{background:"var(--color-surface)",color:"var(--color-text)",border:"1px solid var(--color-border)",fontSize:12,padding:"6px 12px"}}>Edit</Btn><Btn onClick={()=>deleteAvatar(av.id)} style={{background:"rgba(239,68,68,0.13)",color:"var(--color-danger)",border:"1px solid rgba(239,68,68,0.2)",fontSize:12,padding:"6px 12px"}}>Delete</Btn></div></div></Card>)}</div>}
        {(brand.customer_avatars||[]).length>0&&<div className="mt-4 text-right"><Btn onClick={saveBrand} disabled={saving} style={{background:"var(--color-accent)",color:"#fff"}}>{saving?"Saving...":"Save Changes"}</Btn></div>}
        </div>}
      </div>}

      {section==="products"&&!editingProd&&<div>
        <div className="flex justify-between items-center mb-3"><div className="text-text-muted text-sm">Products power script targeting</div><div className="flex gap-2"><Btn onClick={findProducts} disabled={findingProducts||products.length>=3} style={{background:findingProducts?"var(--color-border)":"var(--color-accent-soft)",color:findingProducts?"var(--color-text-muted)":"var(--color-accent)",border:"1px solid var(--color-accent-muted)",whiteSpace:"nowrap"}}>{findingProducts?(<><Sparkles className="w-3.5 h-3.5 inline animate-pulse-soft"/> Searching...</>):products.length>=3?"3 Product Limit":(<><Sparkles className="w-3.5 h-3.5 inline"/> Find Best Sellers</>)}</Btn><Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{background:"var(--color-accent)",color:"#fff"}}>+ New Product</Btn></div></div>
        {products.length>0&&<button onClick={()=>setProductsCollapsed(!productsCollapsed)} className="bg-transparent border-none text-text-muted cursor-pointer text-xs mb-3 p-0 flex items-center gap-1 hover:text-text transition-colors">{productsCollapsed?<><ChevronRight className="w-3 h-3"/> Show {products.length} product{products.length!==1?"s":""}</>:<><ChevronDown className="w-3 h-3"/> Hide products</>}</button>}
        {!productsCollapsed&&<div>
        {productError&&<div className="bg-danger-soft border border-danger/20 rounded-lg px-3 py-2 text-xs text-danger mb-3">{productError}</div>}
        {findingProducts&&<Card style={{textAlign:"center",padding:40,marginBottom:12}}><Search className="w-8 h-8 mx-auto mb-2 text-accent animate-pulse-soft" /><div className="font-semibold text-sm mb-1">Crawling your website...</div><div className="text-xs text-text-muted">Finding up to 3 best-selling products. This may take 15-20 seconds.</div></Card>}
        {products.length===0?<Card style={{textAlign:"center",padding:60}}><Package className="w-10 h-10 mx-auto mb-3 text-text-muted" /><STitle mb={6}>No products yet</STitle><Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{background:"var(--color-accent)",color:"#fff",marginTop:8}}>Add First Product</Btn></Card>
        :<div className="grid gap-3">{products.map((prod:any)=><Card key={prod.id}><div className="flex justify-between items-start"><div><div className="font-bold text-base mb-1">{prod.name}</div><div className="text-sm text-text-muted">{(prod.description||"").substring(0,130)}</div></div><div className="flex gap-2 ml-4"><Btn onClick={()=>setEditingProd(prod)} style={{background:"var(--color-surface)",color:"var(--color-text)",border:"1px solid var(--color-border)",fontSize:12,padding:"6px 12px"}}>Edit</Btn><Btn onClick={()=>deleteProd(prod.id)} style={{background:"rgba(239,68,68,0.13)",color:"var(--color-danger)",border:"1px solid rgba(239,68,68,0.2)",fontSize:12,padding:"6px 12px"}}>Delete</Btn></div></div></Card>)}</div>}
        </div>}
      </div>}

      {section==="products"&&editingProd&&<Card>
        <div className="flex justify-between items-center mb-4"><STitle size={16} mb={0}>{(editingProd as any).id?"Edit Product":"New Product"}</STitle><Btn onClick={()=>setEditingProd(null)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)"}}>Cancel</Btn></div>
        {[{k:"name",l:"Product Name *"},{k:"description",l:"Description",ta:true,r:3},{k:"benefits",l:"Key Benefits",ta:true,r:3},{k:"price",l:"Price",ph:"49.99"},{k:"url",l:"Product URL",ph:"https://"}].map(f=><div key={f.k} className="mb-3"><Label>{f.l}</Label><Input value={(editingProd as any)[f.k]||""} onChange={(e:any)=>setEditingProd({...editingProd,[f.k]:e.target.value} as Product)} placeholder={(f as any).ph||""} textarea={!!(f as any).ta} rows={(f as any).r}/></div>)}
        <button onClick={()=>setShowAdvancedProduct(!showAdvancedProduct)} className={`bg-transparent border-none text-accent cursor-pointer text-xs font-semibold p-0 ${showAdvancedProduct?"mb-3":"mb-4"} flex items-center gap-1`}>{showAdvancedProduct?<><ChevronDown className="w-3 h-3"/> Hide advanced fields</>:<><ChevronRight className="w-3 h-3"/> Show advanced fields (claims, ingredients, differentiators...)</>}</button>
        {showAdvancedProduct&&[{k:"claims",l:"Claims & Results (optional)",ta:true,r:2},{k:"ingredients",l:"Key Ingredients (optional)",ta:true,r:2},{k:"differentiators",l:"What makes this different? (optional)",ta:true,r:2},{k:"reviews",l:"Product Reviews (optional)",ta:true,r:3},{k:"notes",l:"Script Notes (optional)",ta:true,r:2},{k:"target_customer",l:"Target Customer (optional)",ta:true,r:2}].map(f=><div key={f.k} className="mb-3"><Label>{f.l}</Label><Input value={(editingProd as any)[f.k]||""} onChange={(e:any)=>setEditingProd({...editingProd,[f.k]:e.target.value} as Product)} placeholder={(f as any).ph||""} textarea={!!(f as any).ta} rows={(f as any).r}/></div>)}
        {editingProd.url&&<div className="bg-accent-soft border border-accent/20 rounded-lg px-3 py-2 text-xs text-accent mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Product URL detected — autofill fields from this page?</span>
          <button onClick={async()=>{
            try{
              const res=await fetch("/api/brand/crawl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:editingProd.url})})
              const d=await res.json()
              if(d.profile){setEditingProd((prev:any)=>({...prev,name:prev.name||d.profile.name||prev.name,description:d.profile.description||prev.description,benefits:d.profile.additional_info||prev.benefits}))}
            }catch(e){console.error(e)}
          }} className="bg-accent text-white border-none rounded-md px-2.5 py-1 cursor-pointer text-xs font-semibold shrink-0 hover:bg-accent-hover transition-colors">Autofill</button>
        </div>}
        <Btn onClick={()=>saveProd(editingProd)} disabled={!editingProd.name?.trim()} style={{background:"var(--color-accent)",color:"#fff",width:"100%",padding:13,fontSize:15,borderRadius:12,marginTop:4}}>{(editingProd as any).id?"Save Changes":"Add Product"}</Btn>
      </Card>}
    </div>
  )
}
