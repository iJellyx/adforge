'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandProfile, Product, CustomerAvatar } from '../types'
import { C, GENDERS, AGE_RANGES, DEFAULT_PRODUCT } from '../constants'
import { Btn, Label, Card, STitle, Input, Chip } from '../ui-primitives'

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
  }  async function crawlWebsite(){if(!brand.website?.trim()){setCrawlError("Enter a website URL first.");return};setCrawling(true);setCrawlError("");try{const res=await fetch("/api/brand/crawl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:brand.website})});const d=await res.json();if(d.error)throw new Error(d.error);setBrand({...brand,...d.profile,id:brand.id,customer_avatars:brand.customer_avatars||[]})}catch(e:any){setCrawlError(e.message||"Could not fetch website.")};setCrawling(false)}
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
      const res=await fetch("/api/brand/products",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          url:brand.website,
          // Pass brand's default currency so the extractor picks matching
          // offers when a Shopify store has multi-locale pricing.
          preferredCurrency:brand.default_currency||"USD",
        }),
      })
      // Handle non-JSON / HTTP errors (Vercel timeout, 502, etc.)
      if(!res.ok){
        const txt=await res.text().catch(()=>"")
        throw new Error("Server error ("+res.status+"). "+(txt.slice(0,140)||"Try again, or add products manually."))
      }
      const d=await res.json()
      if(d.error){setProductError(d.error);setFindingProducts(false);return}
      if(d.products&&d.products.length>0){
        const remaining=3-products.length
        const toAdd=d.products.slice(0,Math.max(0,remaining))
        const saved:Product[]=[]
        for(const prod of toAdd){
          // The extractor returns extra fields (benefits, claims, ingredients,
          // primary_image_url) that the brand_products INSTEAD-OF trigger
          // ignores cleanly — only the columns it knows about get written.
          const{data,error:insertErr}=await supabase.from("products").insert({...prod,workspace_id:workspaceId}).select().single()
          if(insertErr){console.error("[products] insert error",insertErr);continue}
          if(data)saved.push(data)
        }
        if(saved.length===0){setProductError("Found products but couldn't save them. Check the console for details.")}
        setProducts([...products,...saved])
      }else{
        setProductError("No products found on the website. The site may not be on Shopify or expose a sitemap. Try adding products manually.")
      }
    }catch(e:any){setProductError(e.message||"Failed to find products.")}
    setFindingProducts(false)
  }

  const navBtn=(id:string,label:string)=><button style={{padding:"8px 18px",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",border:"none",background:section===id?C.accent:"transparent",color:section===id?"#fff":C.muted}} onClick={()=>setSection(id)}>{label}</button>

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

  return<div style={{maxWidth:820,margin:"0 auto",padding:28}}>
    <STitle size={22}>Brand & Products</STitle>

    <div style={{background:C.accentSoft,border:"1px solid "+C.accent+"33",borderRadius:10,padding:"12px 16px",fontSize:13,color:C.accent,marginBottom:20}}>
      💡 The more brand context you provide, the better your AI-generated scripts will be. Focus on Name, Description, and Voice first.
    </div>

    {/* Intelligence Score */}
    <div style={{background:C.card,border:"1.5px solid "+C.border,borderRadius:16,padding:20,marginBottom:24,boxShadow:"0 2px 12px rgba(91,73,255,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>🧠 Platform Intelligence Score</div>
          <div style={{fontSize:12,color:C.muted}}>How well the platform knows your brand. Higher = better scripts, smarter clip matching.</div>
        </div>
        <div style={{fontSize:36,fontWeight:900,color:displayPct>=80?C.green:displayPct>=50?C.accent:C.yellow,minWidth:64,textAlign:"right" as const}}>{displayPct}%</div>
      </div>
      <div style={{height:8,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:12}}>
        <div style={{height:"100%",width:displayPct+"%",background:displayPct>=80?"linear-gradient(90deg,#16A34A,#22c55e)":"linear-gradient(90deg,"+C.accent+",#8B7FFF)",borderRadius:4,transition:"width 0.6s ease"}}/>
      </div>
      {intellItems.filter(i=>!i.earned).length>0&&<div>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:8}}>Fill these to improve:</div>
        <div style={{display:"flex",flexDirection:"column" as const,gap:4}}>
          {intellItems.filter(i=>!i.earned).map(i=><div key={i.label} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
            <span style={{color:C.yellow,fontWeight:700,fontSize:11,minWidth:28}}>+{i.pts}</span>
            <span style={{color:C.muted}}>{i.tip}</span>
          </div>)}
        </div>
      </div>}
      {displayPct>=70&&<div style={{fontSize:11,color:C.muted,marginTop:8}}>🎯 The final 10% is earned through usage — the platform learns from your ad performance data over time.</div>}
    </div>

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
      {[{k:"name",l:"Brand Name",req:true},{k:"description",l:"Brand Description",ta:true,r:3,req:true},{k:"voice",l:"Brand Voice & Tone",ta:true,r:3,req:true},{k:"target_customer",l:"Target Customer",ta:true,r:3},{k:"reviews",l:"Reviews / Social Proof",ta:true,r:4},{k:"additional_info",l:"Additional Info",ta:true,r:3}].map((f,i,arr)=><div key={f.k} style={{marginBottom:16}}><Label>{f.l}{(f as any).req?<span style={{color:C.accent,fontWeight:700,marginLeft:4,fontSize:10}}>Required</span>:<span style={{color:C.muted,fontWeight:400,marginLeft:4,fontSize:10,opacity:0.7}}>(optional)</span>}</Label><Input value={brand[f.k]||""} onChange={(e:any)=>setBrand({...brand,[f.k]:e.target.value})} textarea={!!(f as any).ta} rows={(f as any).r}/></div>)}
      {/* Default currency — used by product autofill to pick the right
          price when JSON-LD exposes multiple offers, and as the implicit
          currency for any price the user types. */}
      <div style={{marginBottom:20}}>
        <Label>Default Currency<span style={{color:C.muted,fontWeight:400,marginLeft:4,fontSize:10,opacity:0.7}}>(your primary market)</span></Label>
        <select
          value={brand?.default_currency||"USD"}
          onChange={(e:any)=>setBrand({...brand,default_currency:e.target.value})}
          style={{width:"100%",background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",cursor:"pointer",fontFamily:"inherit"}}
        >
          <option value="USD">USD — US Dollar ($)</option>
          <option value="EUR">EUR — Euro (€)</option>
          <option value="GBP">GBP — British Pound (£)</option>
          <option value="AUD">AUD — Australian Dollar (A$)</option>
          <option value="CAD">CAD — Canadian Dollar (C$)</option>
          <option value="NZD">NZD — New Zealand Dollar (NZ$)</option>
          <option value="JPY">JPY — Japanese Yen (¥)</option>
          <option value="CHF">CHF — Swiss Franc</option>
          <option value="SEK">SEK — Swedish Krona</option>
          <option value="NOK">NOK — Norwegian Krone</option>
          <option value="DKK">DKK — Danish Krone</option>
        </select>
        <div style={{fontSize:11,color:C.muted,marginTop:6}}>Product autofill uses this when a page exposes multi-currency pricing. Individual products can override.</div>
      </div>

      {/* ── VISUAL IDENTITY ──────────────────────────────────────────
          Same row in brand_cards as Split edits — colours, typography,
          USPs, category. Editing here mirrors to Split, and vice versa.
      */}
      <div style={{marginBottom:20,paddingTop:20,borderTop:"1px solid "+C.border}}>
        <Label>Visual Identity <span style={{color:C.muted,fontWeight:400,marginLeft:4,fontSize:10,opacity:0.7}}>(shared with Split)</span></Label>

        {/* Palette — 5 colour swatches */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:6}}>Brand Palette</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
            {(["primary","secondary","accent","neutral_dark","neutral_light"] as const).map(slot=>(
              <div key={slot} style={{textAlign:"center" as const}}>
                <input
                  type="color"
                  value={(brand.palette as any)?.[slot]||"#000000"}
                  onChange={(e:any)=>setBrand({...brand,palette:{...(brand.palette||{}),[slot]:e.target.value}})}
                  style={{width:"100%",height:42,border:"1px solid "+C.border,borderRadius:8,cursor:"pointer",padding:2,background:"transparent"}}
                />
                <div style={{fontSize:9,color:C.muted,marginTop:3,textTransform:"capitalize" as const}}>{slot.replace("_"," ")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Typography */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:6}}>Typography</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Input
              value={(brand.typography as any)?.heading_font||""}
              onChange={(e:any)=>setBrand({...brand,typography:{...(brand.typography||{}),heading_font:e.target.value}})}
              placeholder="Heading font (e.g. Inter)"
            />
            <Input
              value={(brand.typography as any)?.body_font||""}
              onChange={(e:any)=>setBrand({...brand,typography:{...(brand.typography||{}),body_font:e.target.value}})}
              placeholder="Body font (e.g. Söhne)"
            />
          </div>
          <Input
            value={(brand.typography as any)?.style_descriptor||""}
            onChange={(e:any)=>setBrand({...brand,typography:{...(brand.typography||{}),style_descriptor:e.target.value}})}
            placeholder="Style descriptor (e.g. modern geometric sans-serif)"
            style={{marginTop:8}}
          />
        </div>

        {/* USPs */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:6}}>Unique Selling Points <span style={{fontWeight:400,opacity:0.7}}>(one per line)</span></div>
          <Input
            textarea
            rows={3}
            value={Array.isArray(brand.usps)?brand.usps.join("\n"):""}
            onChange={(e:any)=>setBrand({...brand,usps:e.target.value.split("\n").map((s:string)=>s.trim()).filter(Boolean)})}
            placeholder={"Hand-blended in Ireland\nClinically tested for 28 days\n100% recyclable packaging"}
          />
        </div>

        {/* Category */}
        <div>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:6}}>Category</div>
          <Input
            value={brand.category||""}
            onChange={(e:any)=>setBrand({...brand,category:e.target.value})}
            placeholder="e.g. Skincare, SaaS, Fashion"
          />
        </div>
      </div>

      <Btn onClick={saveBrand} disabled={saving} style={{background:C.accent,color:"#fff"}}>{saving?"Saving…":"Save Brand Profile"}</Btn>
    </Card>}

    {section==="avatars"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:C.muted,fontSize:14}}>Select avatars when generating scripts for targeted messaging</div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={generateAvatars} disabled={generatingAvatars} style={{background:generatingAvatars?C.border:C.accentSoft,color:generatingAvatars?C.muted:C.accent,border:"1px solid "+C.accent+"44",whiteSpace:"nowrap"}}>{generatingAvatars?"⏳ Generating…":"✨ Auto-Generate 3"}</Btn>
          <Btn onClick={()=>setEditingAvatar({id:Date.now().toString(),name:"",age:"",gender:"",description:"",pains:"",desires:"",objections:""})} style={{background:C.accent,color:"#fff"}}>+ New Avatar</Btn>
        </div>
      </div>
      {(brand.customer_avatars||[]).length>0&&<button onClick={()=>setAvatarsCollapsed(!avatarsCollapsed)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,marginBottom:12,padding:0,fontFamily:"inherit"}}>{avatarsCollapsed?`▶ Show ${(brand.customer_avatars||[]).length} avatar${(brand.customer_avatars||[]).length!==1?"s":""}`:"▼ Hide avatars"}</button>}
      {!avatarsCollapsed&&<div style={{marginBottom:8}}>
      {avatarError&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#ef4444",marginBottom:12}}>{avatarError}</div>}
      {generatingAvatars&&<Card style={{textAlign:"center",padding:40,marginBottom:12}}><div style={{fontSize:32,marginBottom:8}}>🧠</div><div style={{fontWeight:600,fontSize:14,marginBottom:4}}>Analyzing your brand…</div><div style={{fontSize:12,color:C.muted}}>Generating 3 customer avatars based on your brand profile. This takes 10-15 seconds.</div></Card>}
      {editingAvatar&&<Card style={{marginBottom:20,border:"1px solid "+C.accent+"44"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><STitle size={15} mb={0}>{editingAvatar.name||"New Avatar"}</STitle><Btn onClick={()=>setEditingAvatar(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"5px 10px"}}>Cancel</Btn></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:12}}>
          <div><Label>Name *</Label><Input value={editingAvatar.name} onChange={(e:any)=>setEditingAvatar({...editingAvatar,name:e.target.value})} placeholder="e.g. Sarah"/></div>
          <div><Label>Age Range</Label><select value={editingAvatar.age} onChange={e=>setEditingAvatar({...editingAvatar,age:e.target.value})} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",cursor:"pointer"}}><option value="">Any</option>{AGE_RANGES.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
          <div><Label>Gender</Label><select value={editingAvatar.gender} onChange={e=>setEditingAvatar({...editingAvatar,gender:e.target.value})} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",cursor:"pointer"}}><option value="">Any</option>{GENDERS.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
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
    </div>}

    {section==="products"&&!editingProd&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{color:C.muted,fontSize:14}}>Products power script targeting</div><div style={{display:"flex",gap:8}}><Btn onClick={findProducts} disabled={findingProducts||products.length>=3} style={{background:findingProducts?C.border:C.accentSoft,color:findingProducts?C.muted:C.accent,border:"1px solid "+C.accent+"44",whiteSpace:"nowrap"}}>{findingProducts?"⏳ Searching…":products.length>=3?"3 Product Limit":"✨ Find Best Sellers"}</Btn><Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{background:C.accent,color:"#fff"}}>+ New Product</Btn></div></div>
      {products.length>0&&<button onClick={()=>setProductsCollapsed(!productsCollapsed)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,marginBottom:12,padding:0,fontFamily:"inherit"}}>{productsCollapsed?`▶ Show ${products.length} product${products.length!==1?"s":""}`:"▼ Hide products"}</button>}
      {!productsCollapsed&&<div>
      {productError&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#ef4444",marginBottom:12}}>{productError}</div>}
      {findingProducts&&<Card style={{textAlign:"center",padding:40,marginBottom:12}}><div style={{fontSize:32,marginBottom:8}}>🔍</div><div style={{fontWeight:600,fontSize:14,marginBottom:4}}>Crawling your website…</div><div style={{fontSize:12,color:C.muted}}>Finding up to 3 best-selling products. This may take 15-20 seconds.</div></Card>}
      {products.length===0?<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:40,marginBottom:12}}>📦</div><STitle mb={6}>No products yet</STitle><Btn onClick={()=>setEditingProd({...DEFAULT_PRODUCT})} style={{background:C.accent,color:"#fff",marginTop:8}}>Add First Product</Btn></Card>
      :<div style={{display:"grid",gap:12}}>{products.map((prod:any)=><Card key={prod.id}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:700,fontSize:16,marginBottom:4}}>{prod.name}</div><div style={{fontSize:13,color:C.muted}}>{(prod.description||"").substring(0,130)}</div></div><div style={{display:"flex",gap:8,marginLeft:16}}><Btn onClick={()=>setEditingProd(prod)} style={{background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:12,padding:"6px 12px"}}>Edit</Btn><Btn onClick={()=>deleteProd(prod.id)} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",fontSize:12,padding:"6px 12px"}}>Delete</Btn></div></div></Card>)}</div>}
      </div>}
    </div>}

    {section==="products"&&editingProd&&(()=>{
      // Defensive: if `brand` somehow hasn't loaded yet, treat default_currency
      // as undefined and fall through to USD. Earlier code accessed
      // brand.default_currency directly which threw a client-side exception
      // when brand was null mid-mount (the "Application error" page).
      const brandDefaultCcy=(brand?.default_currency||"USD") as string
      const productCcy=(editingProd.currency||brandDefaultCcy) as string
      // Trigger autofill — extracted into a function so the URL field's
      // onPaste / onBlur can call it AND the explicit Autofill button.
      async function runAutofill(targetUrl:string){
        if(!targetUrl||!/^https?:\/\//i.test(targetUrl))return
        try{
          const res=await fetch("/api/product/extract",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({url:targetUrl,preferredCurrency:brandDefaultCcy}),
          })
          const d=await res.json()
          if(d.product){
            const p=d.product
            setEditingProd((prev:any)=>({
              ...prev,
              name:prev?.name||p.name||"",
              description:prev?.description||p.description||"",
              benefits:prev?.benefits||p.benefits||"",
              price:prev?.price||p.price||"",
              currency:prev?.currency||p.currency||brandDefaultCcy,
              claims:prev?.claims||p.claims||"",
              ingredients:prev?.ingredients||p.ingredients||"",
            }))
          }else if(d.error){alert("Autofill failed: "+d.error)}
        }catch(err:any){console.error(err);alert("Autofill failed: "+(err?.message||"unknown error"))}
      }
      return <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <STitle size={16} mb={0}>{(editingProd as any).id?"Edit Product":"New Product"}</STitle>
          <Btn onClick={()=>setEditingProd(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Cancel</Btn>
        </div>

        {/* ── PRODUCT URL FIRST ──────────────────────────────────────────
            Top of the form so a brand can paste their URL and trigger
            autofill without scrolling. */}
        <div style={{marginBottom:13}}>
          <Label>Product URL <span style={{color:C.muted,fontWeight:400,marginLeft:4,fontSize:10,opacity:0.7}}>(paste to autofill)</span></Label>
          <Input
            value={editingProd.url||""}
            onChange={(e:any)=>setEditingProd({...editingProd,url:e.target.value} as Product)}
            placeholder="https://yourbrand.com/products/your-product"
          />
        </div>
        {editingProd.url&&/^https?:\/\//i.test(editingProd.url)&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.accent,marginBottom:13,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span>✨ Product URL detected — autofill name, price, description?</span>
          <button onClick={async(e:any)=>{
            const btn=e.currentTarget
            btn.disabled=true
            const originalText=btn.textContent
            btn.textContent="⏳ Extracting…"
            await runAutofill(editingProd.url||"")
            btn.disabled=false
            btn.textContent=originalText
          }} style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:600,flexShrink:0}}>Autofill</button>
        </div>}

        {/* ── Essential fields ────────────────────────────────────────── */}
        {[{k:"name",l:"Product Name *"},{k:"description",l:"Description",ta:true,r:3},{k:"benefits",l:"Key Benefits",ta:true,r:3}].map(f=>(
          <div key={f.k} style={{marginBottom:13}}>
            <Label>{f.l}</Label>
            <Input
              value={((editingProd as any)?.[f.k])||""}
              onChange={(e:any)=>setEditingProd({...editingProd,[f.k]:e.target.value} as Product)}
              textarea={!!(f as any).ta}
              rows={(f as any).r}
            />
          </div>
        ))}

        {/* ── Price + currency ────────────────────────────────────────── */}
        <div style={{marginBottom:13}}>
          <Label>Price</Label>
          <div style={{display:"flex",gap:8}}>
            <Input
              value={editingProd.price||""}
              onChange={(e:any)=>setEditingProd({...editingProd,price:e.target.value} as Product)}
              placeholder="49.99"
              style={{flex:1}}
            />
            <select
              value={productCcy}
              onChange={(e:any)=>setEditingProd({...editingProd,currency:e.target.value} as Product)}
              style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",cursor:"pointer",fontFamily:"inherit",minWidth:90}}
            >
              {["USD","EUR","GBP","AUD","CAD","NZD","JPY","CHF","SEK","NOK","DKK"].map(c=>(
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Advanced toggle ────────────────────────────────────────── */}
        <button
          onClick={()=>setShowAdvancedProduct(!showAdvancedProduct)}
          style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,fontWeight:600,padding:0,marginBottom:showAdvancedProduct?12:16,fontFamily:"inherit"}}
        >
          {showAdvancedProduct?"▼ Hide advanced fields":"▶ Show advanced fields (claims, ingredients, differentiators…)"}
        </button>
        {showAdvancedProduct&&[{k:"claims",l:"Claims & Results (optional)",ta:true,r:2},{k:"ingredients",l:"Key Ingredients (optional)",ta:true,r:2},{k:"differentiators",l:"What makes this different? (optional)",ta:true,r:2},{k:"reviews",l:"Product Reviews (optional)",ta:true,r:3},{k:"notes",l:"Script Notes (optional)",ta:true,r:2},{k:"target_customer",l:"Target Customer (optional)",ta:true,r:2}].map(f=>(
          <div key={f.k} style={{marginBottom:13}}>
            <Label>{f.l}</Label>
            <Input
              value={((editingProd as any)?.[f.k])||""}
              onChange={(e:any)=>setEditingProd({...editingProd,[f.k]:e.target.value} as Product)}
              textarea={!!(f as any).ta}
              rows={(f as any).r}
            />
          </div>
        ))}

        <Btn
          onClick={()=>saveProd(editingProd)}
          disabled={!editingProd.name?.trim()}
          style={{background:C.accent,color:"#fff",width:"100%",padding:13,fontSize:15,borderRadius:12,marginTop:4}}
        >
          {(editingProd as any).id?"Save Changes":"Add Product"}
        </Btn>
      </Card>
    })()}
  </div>
}
