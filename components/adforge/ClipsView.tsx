'use client'
import { useState, useMemo, useCallback } from 'react'
import { C, CLIP_ROLES } from './constants'
import { STitle, Input, Btn, Card } from './ui-primitives'
import { VideoCard } from './VideoCard'
import { createClient } from '@/lib/supabase/client'
import type { Item } from './types'

type Collection = { key:string; icon:string; label:string; filter:(i:Item)=>boolean }
type SortOption = 'Newest'|'Oldest'|'A-Z'|'Quality'

const SORT_OPTIONS: SortOption[] = ['Newest','Oldest','A-Z','Quality']

export function ClipsView({items,onRefresh,workspaceId,onSelectClip}:{items:Item[],onRefresh:()=>void,workspaceId:string,onSelectClip:(item:Item)=>void}){
  const supabase = createClient()
  const [activeCollection,setActiveCollection]=useState('all')
  const [activeTags,setActiveTags]=useState<string[]>([])
  const [search,setSearch]=useState('')
  const [reviewMode,setReviewMode]=useState(false)
  const [sort,setSort]=useState<SortOption>('Newest')
  const [sortOpen,setSortOpen]=useState(false)
  const [animatingOut,setAnimatingOut]=useState<Set<string>>(new Set())

  // All clips
  const allClips = useMemo(()=>items.filter(i=>i.type==='clip'),[items])

  // Smart collections
  const collections: Collection[] = useMemo(()=>[
    {key:'all',icon:'\uD83D\uDCCE',label:'All Clips',filter:()=>true},
    {key:'approved',icon:'\u2705',label:'Approved',filter:(i:Item)=>i.clip_status==='approved'},
    {key:'pending',icon:'\u23F3',label:'Pending',filter:(i:Item)=>!i.clip_status||i.clip_status==='pending'},
    {key:'rejected',icon:'\u274C',label:'Rejected',filter:(i:Item)=>i.clip_status==='rejected'},
    {key:'_div1',icon:'',label:'',filter:()=>false},
    {key:'hooks',icon:'\uD83C\uDFA3',label:'Hooks',filter:(i:Item)=>(i.clip_role||'').toLowerCase().includes('hook')},
    {key:'broll',icon:'\uD83C\uDFAC',label:'B-Roll',filter:(i:Item)=>!!i.analysis?.is_broll},
    {key:'talking_head',icon:'\uD83D\uDDE3\uFE0F',label:'Talking Head',filter:(i:Item)=>!!i.analysis?.is_talking_head},
    {key:'high_quality',icon:'\u2B50',label:'High Quality',filter:(i:Item)=>i.analysis?.quality_score==='High'},
    {key:'under5s',icon:'\u26A1',label:'Under 5s',filter:(i:Item)=>(i.duration_seconds||999)<5},
    {key:'_div2',icon:'',label:'',filter:()=>false},
  ],[])

  // Collect unique tags from all clips
  const allTags = useMemo(()=>{
    const tagMap = new Map<string,number>()
    allClips.forEach(clip=>{
      const sceneTags = clip.analysis?.scene_tags || []
      const creativeTags = clip.analysis?.creative_tags || []
      ;[...sceneTags,...creativeTags].forEach((t:string)=>{
        tagMap.set(t,(tagMap.get(t)||0)+1)
      })
    })
    return Array.from(tagMap.entries()).sort((a,b)=>b[1]-a[1])
  },[allClips])

  // Active collection filter
  const activeFilter = useMemo(()=>{
    const c = collections.find(c=>c.key===activeCollection)
    return c?.filter || (()=>true)
  },[activeCollection,collections])

  // Filtered and sorted clips
  const filteredClips = useMemo(()=>{
    let result = allClips.filter(activeFilter)

    // Tag filter (OR logic)
    if(activeTags.length>0){
      result = result.filter(clip=>{
        const clipTags = [...(clip.analysis?.scene_tags||[]),...(clip.analysis?.creative_tags||[])]
        return activeTags.some(t=>clipTags.includes(t))
      })
    }

    // Search
    if(search.trim()){
      const q = search.toLowerCase()
      result = result.filter(clip=>
        (clip.title||'').toLowerCase().includes(q)||
        (clip.creator||'').toLowerCase().includes(q)||
        (clip.analysis?.use_case||'').toLowerCase().includes(q)||
        (clip.clip_role||'').toLowerCase().includes(q)||
        [...(clip.analysis?.scene_tags||[]),...(clip.analysis?.creative_tags||[])].some((t:string)=>t.toLowerCase().includes(q))
      )
    }

    // Sort
    if(sort==='Newest') result.sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())
    else if(sort==='Oldest') result.sort((a,b)=>new Date(a.created_at||0).getTime()-new Date(b.created_at||0).getTime())
    else if(sort==='A-Z') result.sort((a,b)=>(a.title||'').localeCompare(b.title||''))
    else if(sort==='Quality'){
      const qOrder:Record<string,number>={High:0,Medium:1,Low:2}
      result.sort((a,b)=>(qOrder[a.analysis?.quality_score]??3)-(qOrder[b.analysis?.quality_score]??3))
    }

    return result
  },[allClips,activeFilter,activeTags,search,sort])

  // Review mode stats
  const reviewedCount = useMemo(()=>allClips.filter(c=>c.clip_status==='approved'||c.clip_status==='rejected').length,[allClips])

  // Approval handlers
  const handleApprove = useCallback(async(clip:Item)=>{
    setAnimatingOut(prev=>new Set(prev).add(clip.id))
    const { error } = await supabase.from('items').update({clip_status:'approved'}).eq('id',clip.id)
    if(error){
      console.error('[ClipsView] approve error:',error)
      alert('Approve failed: '+error.message+(error.message?.toLowerCase().includes('column')?'\n\nTip: The clip_status column may be missing. Run this SQL in Supabase:\nALTER TABLE items ADD COLUMN IF NOT EXISTS clip_status text DEFAULT \'pending\';':''))
      setAnimatingOut(prev=>{const n=new Set(prev);n.delete(clip.id);return n})
      return
    }
    setTimeout(()=>{setAnimatingOut(prev=>{const n=new Set(prev);n.delete(clip.id);return n});onRefresh()},300)
  },[supabase,onRefresh])

  const handleReject = useCallback(async(clip:Item)=>{
    setAnimatingOut(prev=>new Set(prev).add(clip.id))
    const { error } = await supabase.from('items').update({clip_status:'rejected'}).eq('id',clip.id)
    if(error){
      console.error('[ClipsView] reject error:',error)
      alert('Reject failed: '+error.message)
      setAnimatingOut(prev=>{const n=new Set(prev);n.delete(clip.id);return n})
      return
    }
    setTimeout(()=>{setAnimatingOut(prev=>{const n=new Set(prev);n.delete(clip.id);return n});onRefresh()},300)
  },[supabase,onRefresh])

  function toggleTag(tag:string){
    setActiveTags(prev=>prev.includes(tag)?prev.filter(t=>t!==tag):[...prev,tag])
  }

  // Count for a collection
  function collectionCount(c:Collection){return allClips.filter(c.filter).length}

  return <div style={{display:'flex',height:'100%',background:C.bg,fontFamily:'inherit'}}>

    {/* Left sidebar */}
    <div style={{width:200,minWidth:200,borderRight:'1.5px solid '+C.border,background:C.surface,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'16px 14px 8px'}}>
        <STitle size={14} mb={12}>Smart Collections</STitle>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'0 8px'}}>
        {collections.map(c=>{
          if(c.key.startsWith('_div')) return <div key={c.key} style={{height:1,background:C.border,margin:'6px 6px'}}/>
          const active = activeCollection===c.key
          const count = collectionCount(c)
          return <div key={c.key} onClick={()=>{setActiveCollection(c.key);setActiveTags([])}}
            style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,cursor:'pointer',background:active?C.accentSoft:'transparent',color:active?C.accent:C.text,fontSize:12,fontWeight:active?700:500,marginBottom:2,transition:'background 0.15s'}}>
            <span style={{fontSize:13,width:18,textAlign:'center'}}>{c.icon}</span>
            <span style={{flex:1}}>{c.label}</span>
            <span style={{fontSize:10,color:active?C.accent:C.muted,fontWeight:600,minWidth:18,textAlign:'right'}}>{count}</span>
          </div>
        })}

        {/* Tags section */}
        <div style={{padding:'12px 6px 4px'}}>
          <STitle size={12} mb={8}>Tags</STitle>
        </div>
        <div style={{maxHeight:240,overflowY:'auto',padding:'0 2px'}}>
          {allTags.map(([tag,count])=>{
            const active = activeTags.includes(tag)
            return <div key={tag} onClick={()=>toggleTag(tag)}
              style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:6,cursor:'pointer',background:active?C.accentSoft:'transparent',color:active?C.accent:C.text,fontSize:11,fontWeight:active?600:400,marginBottom:1}}>
              <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tag.replace(/_/g,' ')}</span>
              <span style={{fontSize:9,color:active?C.accent:C.muted,fontWeight:600}}>({count})</span>
            </div>
          })}
          {allTags.length===0&&<div style={{fontSize:11,color:C.muted,padding:'4px 10px',fontStyle:'italic'}}>No tags found</div>}
        </div>
      </div>
    </div>

    {/* Main content area */}
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderBottom:'1.5px solid '+C.border,background:C.surface,flexShrink:0}}>
        <div style={{flex:1,maxWidth:320}}>
          <Input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Search clips..." style={{fontSize:12,padding:'7px 12px'}}/>
        </div>

        {/* Review mode toggle */}
        <Btn onClick={()=>setReviewMode(!reviewMode)} style={{background:reviewMode?C.accent:C.surface,color:reviewMode?'#fff':C.text,border:'1.5px solid '+(reviewMode?C.accent:C.border),padding:'6px 14px',fontSize:11}}>
          {reviewMode?'Exit Review':'Review Mode'}
        </Btn>

        {reviewMode&&<span style={{fontSize:11,color:C.muted,fontWeight:600}}>{reviewedCount} of {allClips.length} reviewed</span>}

        {/* Sort dropdown */}
        <div style={{position:'relative'}}>
          <button onClick={()=>setSortOpen(!sortOpen)} style={{background:C.surface,border:'1px solid '+C.border,borderRadius:8,padding:'6px 12px',fontSize:11,cursor:'pointer',color:C.text,fontWeight:500,display:'flex',alignItems:'center',gap:4,fontFamily:'inherit'}}>
            Sort: {sort} <span style={{fontSize:8,opacity:0.5}}>{sortOpen?'\u25B2':'\u25BC'}</span>
          </button>
          {sortOpen&&<div style={{position:'absolute',top:'calc(100% + 4px)',right:0,background:C.surface,border:'1px solid '+C.border,borderRadius:10,padding:4,zIndex:200,minWidth:130,boxShadow:'0 8px 24px #0003'}}>
            {SORT_OPTIONS.map(opt=><div key={opt} onClick={()=>{setSort(opt);setSortOpen(false)}}
              style={{padding:'7px 10px',borderRadius:6,cursor:'pointer',fontSize:12,color:sort===opt?C.accent:C.text,background:sort===opt?C.accentSoft:'transparent',fontWeight:sort===opt?700:400}}>{opt}</div>)}
          </div>}
        </div>
      </div>

      {/* Grid */}
      <div style={{flex:1,overflowY:'auto',padding:20}}>
        {filteredClips.length===0&&<div style={{textAlign:'center',padding:'60px 20px',color:C.muted}}>
          <div style={{fontSize:32,marginBottom:8}}>{"\uD83D\uDD0D"}</div>
          <div style={{fontSize:14,fontWeight:600}}>No clips found</div>
          <div style={{fontSize:12,marginTop:4}}>Try adjusting your filters or search</div>
        </div>}

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',gap:16}}>
          {filteredClips.map(clip=><div key={clip.id} style={{opacity:animatingOut.has(clip.id)?0:1,transform:animatingOut.has(clip.id)?'scale(0.95)':'scale(1)',transition:'opacity 0.3s, transform 0.3s'}}>
            <VideoCard
              item={clip}
              onClick={()=>onSelectClip(clip)}
              selectMode={false}
              isSelected={false}
              onToggleSelect={()=>{}}
              compact={false}
              highlight={false}
              showApprovalButtons={reviewMode}
              onApprove={()=>handleApprove(clip)}
              onReject={()=>handleReject(clip)}
            />
          </div>)}
        </div>
      </div>
    </div>
  </div>
}
