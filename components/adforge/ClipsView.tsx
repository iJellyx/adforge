'use client'
import { useState, useMemo, useCallback } from 'react'
import { Search, ChevronDown, ChevronUp, Paperclip, CheckCircle, Clock, XCircle, Anchor, Film, MessageSquare, Star, Zap } from 'lucide-react'
import { C, CLIP_ROLES } from './constants'
import { STitle, Input, Btn, Card } from './ui-primitives'
import { VideoCard } from './VideoCard'
import { createClient } from '@/lib/supabase/client'
import type { Item } from './types'

type Collection = { key:string; icon:React.ReactNode; label:string; filter:(i:Item)=>boolean }
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

  const allClips = useMemo(()=>items.filter(i=>i.type==='clip'),[items])

  const collections: Collection[] = useMemo(()=>[
    {key:'all',icon:<Paperclip className="w-3.5 h-3.5" />,label:'All Clips',filter:()=>true},
    {key:'approved',icon:<CheckCircle className="w-3.5 h-3.5" />,label:'Approved',filter:(i:Item)=>i.clip_status==='approved'},
    {key:'pending',icon:<Clock className="w-3.5 h-3.5" />,label:'Pending',filter:(i:Item)=>!i.clip_status||i.clip_status==='pending'},
    {key:'rejected',icon:<XCircle className="w-3.5 h-3.5" />,label:'Rejected',filter:(i:Item)=>i.clip_status==='rejected'},
    {key:'_div1',icon:null,label:'',filter:()=>false},
    {key:'hooks',icon:<Anchor className="w-3.5 h-3.5" />,label:'Hooks',filter:(i:Item)=>(i.clip_role||'').toLowerCase().includes('hook')},
    {key:'broll',icon:<Film className="w-3.5 h-3.5" />,label:'B-Roll',filter:(i:Item)=>!!i.analysis?.is_broll},
    {key:'talking_head',icon:<MessageSquare className="w-3.5 h-3.5" />,label:'Talking Head',filter:(i:Item)=>!!i.analysis?.is_talking_head},
    {key:'high_quality',icon:<Star className="w-3.5 h-3.5" />,label:'High Quality',filter:(i:Item)=>i.analysis?.quality_score==='High'},
    {key:'under5s',icon:<Zap className="w-3.5 h-3.5" />,label:'Under 5s',filter:(i:Item)=>(i.duration_seconds||999)<5},
    {key:'_div2',icon:null,label:'',filter:()=>false},
  ],[])

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

  const activeFilter = useMemo(()=>{
    const c = collections.find(c=>c.key===activeCollection)
    return c?.filter || (()=>true)
  },[activeCollection,collections])

  const filteredClips = useMemo(()=>{
    let result = allClips.filter(activeFilter)
    if(activeTags.length>0){
      result = result.filter(clip=>{
        const clipTags = [...(clip.analysis?.scene_tags||[]),...(clip.analysis?.creative_tags||[])]
        return activeTags.some(t=>clipTags.includes(t))
      })
    }
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
    if(sort==='Newest') result.sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())
    else if(sort==='Oldest') result.sort((a,b)=>new Date(a.created_at||0).getTime()-new Date(b.created_at||0).getTime())
    else if(sort==='A-Z') result.sort((a,b)=>(a.title||'').localeCompare(b.title||''))
    else if(sort==='Quality'){
      const qOrder:Record<string,number>={High:0,Medium:1,Low:2}
      result.sort((a,b)=>(qOrder[a.analysis?.quality_score]??3)-(qOrder[b.analysis?.quality_score]??3))
    }
    return result
  },[allClips,activeFilter,activeTags,search,sort])

  const reviewedCount = useMemo(()=>allClips.filter(c=>c.clip_status==='approved'||c.clip_status==='rejected').length,[allClips])

  const handleApprove = useCallback(async(clip:Item)=>{
    setAnimatingOut(prev=>new Set(prev).add(clip.id))
    await supabase.from('items').update({clip_status:'approved'}).eq('id',clip.id)
    setTimeout(()=>{setAnimatingOut(prev=>{const n=new Set(prev);n.delete(clip.id);return n});onRefresh()},300)
  },[supabase,onRefresh])

  const handleReject = useCallback(async(clip:Item)=>{
    setAnimatingOut(prev=>new Set(prev).add(clip.id))
    await supabase.from('items').update({clip_status:'rejected'}).eq('id',clip.id)
    setTimeout(()=>{setAnimatingOut(prev=>{const n=new Set(prev);n.delete(clip.id);return n});onRefresh()},300)
  },[supabase,onRefresh])

  function toggleTag(tag:string){
    setActiveTags(prev=>prev.includes(tag)?prev.filter(t=>t!==tag):[...prev,tag])
  }

  function collectionCount(c:Collection){return allClips.filter(c.filter).length}

  return <div className="flex h-full bg-bg">

    {/* Left sidebar */}
    <div className="w-[200px] min-w-[200px] border-r border-border bg-surface flex flex-col overflow-hidden flex-shrink-0">
      <div className="px-3.5 pt-4 pb-2">
        <STitle size={14} mb={12}>Smart Collections</STitle>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {collections.map(c=>{
          if(c.key.startsWith('_div')) return <div key={c.key} className="h-px bg-border mx-1.5 my-1.5"/>
          const active = activeCollection===c.key
          const count = collectionCount(c)
          return <div key={c.key} onClick={()=>{setActiveCollection(c.key);setActiveTags([])}}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs mb-0.5 transition-colors duration-150 ${active?'bg-accent-soft text-accent font-bold':'text-text hover:bg-card-hover font-medium'}`}>
            <span className="w-[18px] text-center flex-shrink-0">{c.icon}</span>
            <span className="flex-1">{c.label}</span>
            <span className={`text-[10px] font-semibold min-w-[18px] text-right ${active?'text-accent':'text-text-muted'}`}>{count}</span>
          </div>
        })}

        {/* Tags section */}
        <div className="px-1.5 pt-3 pb-1">
          <STitle size={12} mb={8}>Tags</STitle>
        </div>
        <div className="max-h-60 overflow-y-auto px-0.5">
          {allTags.map(([tag,count])=>{
            const active = activeTags.includes(tag)
            return <div key={tag} onClick={()=>toggleTag(tag)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md cursor-pointer text-xs mb-0.5 transition-colors duration-150 ${active?'bg-accent-soft text-accent font-semibold':'text-text hover:bg-card-hover'}`}>
              <span className="flex-1 truncate">{tag.replace(/_/g,' ')}</span>
              <span className={`text-[9px] font-semibold ${active?'text-accent':'text-text-muted'}`}>({count})</span>
            </div>
          })}
          {allTags.length===0&&<div className="text-xs text-text-muted px-2.5 py-1 italic">No tags found</div>}
        </div>
      </div>
    </div>

    {/* Main content area */}
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-surface flex-shrink-0">
        <div className="flex-1 max-w-[320px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Search clips..." className="bg-bg border border-border rounded-md py-2 pl-9 pr-3 text-xs w-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50 text-text transition-all duration-150"/>
        </div>

        {/* Review mode toggle */}
        <Btn onClick={()=>setReviewMode(!reviewMode)} className={`px-3.5 py-1.5 text-xs transition-all duration-150 ${reviewMode?'bg-accent text-white border-[1.5px] border-accent':'bg-surface text-text border-[1.5px] border-border hover:border-border-strong'}`}>
          {reviewMode?'Exit Review':'Review Mode'}
        </Btn>

        {reviewMode&&<span className="text-xs text-text-muted font-semibold">{reviewedCount} of {allClips.length} reviewed</span>}

        {/* Sort dropdown */}
        <div className="relative">
          <button onClick={()=>setSortOpen(!sortOpen)} className="bg-surface border border-border rounded-md px-3 py-1.5 text-xs cursor-pointer text-text font-medium flex items-center gap-1 transition-all duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/50">
            Sort: {sort} {sortOpen?<ChevronUp className="w-3 h-3 opacity-50" />:<ChevronDown className="w-3 h-3 opacity-50" />}
          </button>
          {sortOpen&&<div className="absolute top-[calc(100%+4px)] right-0 bg-surface border border-border rounded-md p-1 z-[200] min-w-[130px] shadow-lg">
            {SORT_OPTIONS.map(opt=><div key={opt} onClick={()=>{setSort(opt);setSortOpen(false)}}
              className={`px-2.5 py-2 rounded-md cursor-pointer text-xs transition-colors duration-150 ${sort===opt?'text-accent bg-accent-soft font-bold':'text-text hover:bg-card-hover'}`}>{opt}</div>)}
          </div>}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredClips.length===0&&<div className="text-center py-16 text-text-muted">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <div className="text-sm font-semibold">No clips found</div>
          <div className="text-xs mt-1">Try adjusting your filters or search</div>
        </div>}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {filteredClips.map(clip=><div key={clip.id} className="transition-all duration-300" style={{opacity:animatingOut.has(clip.id)?0:1,transform:animatingOut.has(clip.id)?'scale(0.95)':'scale(1)'}}>
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
