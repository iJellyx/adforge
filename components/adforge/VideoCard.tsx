'use client'
import { useState } from 'react'
import { C } from './constants'
import { muxThumb, fmt, typeColor, secColor } from './utils'
import { Chip, Btn } from './ui-primitives'

export function VideoCard({item,onClick,selectMode,isSelected,onToggleSelect,compact,highlight,showApprovalButtons,onApprove,onReject}:any){
  const [hover,setHover]=useState(false)
  const chipLabel=item.type==="clip"?(item.analysis?.use_case||"Clip"):(item.analysis?.content_type||"Untagged")
  const tc=item.type==="clip"?typeColor("Clip"):typeColor(item.analysis?.content_type)
  const thumbTime=item.thumbnail_time??item.start_seconds??0
  const isClip=item.type==="clip"
  const qualScore=item.analysis?.quality_score as string|undefined
  const clipStatus=item.clip_status as string|undefined
  const clipRole=item.clip_role as string|undefined
  const parentTitle=item.analysis?.parent_title as string|undefined

  function handleClick(e:any){if(selectMode){e.stopPropagation();onToggleSelect()}else onClick()}

  const qualColors:Record<string,string>={High:"#22c55e",Medium:"#f59e0b",Low:"#ef4444"}
  const statusConfig:Record<string,{icon:string,bg:string,color:string}>={
    approved:{icon:"\u2713",bg:"#22c55e",color:"#fff"},
    pending:{icon:"\u25CB",bg:"#f59e0b",color:"#fff"},
    rejected:{icon:"\u2717",bg:"#ef4444",color:"#fff"},
  }

  return<div onClick={handleClick}
    onMouseOver={e=>{
      (e.currentTarget as any).style.borderColor=highlight?C.green:"var(--af-border-strong)"
      ;(e.currentTarget as any).style.transform="translateY(-2px)"
      ;(e.currentTarget as any).style.boxShadow="var(--af-shadow-md)"
      setHover(true)
    }}
    onMouseOut={e=>{
      (e.currentTarget as any).style.borderColor=isSelected?"var(--af-accent)":highlight?C.green:"var(--af-border)"
      ;(e.currentTarget as any).style.transform="translateY(0)"
      ;(e.currentTarget as any).style.boxShadow="none"
      setHover(false)
    }}
    style={{background:"var(--af-card)",border:"1px solid "+(isSelected?"var(--af-accent)":highlight?C.green:"var(--af-border)"),borderRadius:compact?10:12,overflow:"hidden",cursor:"pointer",display:"flex",flexDirection:"column",position:"relative",transition:"all 0.18s ease"}}>

    {/* Select mode checkbox */}
    {selectMode&&<div style={{position:"absolute",top:6,right:6,zIndex:10,width:20,height:20,borderRadius:5,background:isSelected?C.accent:"#000a",border:"2px solid "+(isSelected?"#fff":"#fff5"),display:"flex",alignItems:"center",justifyContent:"center"}}>{isSelected&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>{"\u2713"}</span>}</div>}

    {/* Auto highlight badge */}
    {highlight&&<div style={{position:"absolute",top:6,left:6,zIndex:10,background:C.green,color:"#000",fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4}}>AUTO</div>}

    {/* Thumbnail area */}
    <div style={{position:"relative",width:"100%",paddingTop:"177.78%",background:"#111",overflow:"hidden",flexShrink:0}}>
      {item.mux_playback_id?<img src={muxThumb(item.mux_playback_id,thumbTime)} alt={item.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><div style={{fontSize:compact?18:28}}>{item.mux_status==="pending"||item.mux_status==="analysing"?"\u23F3":"\uD83C\uDFAC"}</div>{!compact&&<div style={{fontSize:9,color:C.muted,textAlign:"center"}}>{item.mux_status==="analysing"?"Analysing\u2026":item.mux_status==="pending"?"Processing\u2026":"No preview"}</div>}</div>}

      {/* Clip badge */}
      {isClip&&<div style={{position:"absolute",top:compact?4:8,left:compact?4:8,background:"#f59e0bee",color:"#000",fontSize:compact?7:9,fontWeight:800,padding:"1px 5px",borderRadius:4}}>{"\u2702\uFE0F"}</div>}

      {/* B-ROLL / TALKING HEAD badge */}
      {item.analysis?.is_broll&&<div style={{position:"absolute",top:compact?4:8,right:compact?4:8,background:"#2563EBdd",color:"#fff",fontSize:compact?6:8,fontWeight:800,padding:"1px 4px",borderRadius:3}}>B-ROLL</div>}
      {item.analysis?.is_talking_head&&!item.analysis?.is_broll&&<div style={{position:"absolute",top:compact?4:8,right:compact?4:8,background:"#7C3AEDdd",color:"#fff",fontSize:compact?6:8,fontWeight:800,padding:"1px 4px",borderRadius:3}}>TALKING HEAD</div>}

      {/* Quality badge - below B-ROLL/TALKING HEAD badge, top-right */}
      {isClip&&qualScore&&qualColors[qualScore]&&<div style={{position:"absolute",top:compact?16:24,right:compact?4:8,width:compact?8:10,height:compact?8:10,borderRadius:"50%",background:qualColors[qualScore],border:"1.5px solid #fff",boxShadow:"0 1px 3px #0004"}}/>}

      {/* Duration badge */}
      {item.duration_seconds&&<div style={{position:"absolute",bottom:compact?4:8,right:compact?4:8,background:"#000c",color:"#fff",fontSize:compact?8:10,fontWeight:700,padding:"1px 5px",borderRadius:4}}>{fmt(item.duration_seconds)}</div>}

      {/* Approval status badge - bottom-left of thumbnail */}
      {isClip&&clipStatus&&statusConfig[clipStatus]&&<div style={{position:"absolute",bottom:compact?4:8,left:compact?4:8,background:statusConfig[clipStatus].bg,color:statusConfig[clipStatus].color,fontSize:compact?7:9,fontWeight:800,padding:"1px 5px",borderRadius:4,display:"flex",alignItems:"center",gap:2,boxShadow:"0 1px 3px #0004"}}>{statusConfig[clipStatus].icon}</div>}

      {/* Review mode overlay buttons */}
      {showApprovalButtons&&hover&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",inset:0,background:"#000000aa",display:"flex",alignItems:"center",justifyContent:"center",gap:12,zIndex:15}}>
        <button onClick={e=>{e.stopPropagation();onApprove&&onApprove()}} style={{width:44,height:44,borderRadius:"50%",border:"2px solid #22c55e",background:clipStatus==="approved"?"#22c55e":"#22c55e33",color:"#fff",fontSize:20,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2713"}</button>
        <button onClick={e=>{e.stopPropagation();onReject&&onReject()}} style={{width:44,height:44,borderRadius:"50%",border:"2px solid #ef4444",background:clipStatus==="rejected"?"#ef4444":"#ef444433",color:"#fff",fontSize:20,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2717"}</button>
      </div>}
    </div>

    {/* Info area */}
    <div style={{padding:compact?6:12,flex:1,display:"flex",flexDirection:"column",gap:3}}>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
        <Chip label={chipLabel} color={tc}/>
        {item.analysis?.creative_tags?.slice(0,2).map((t:string,i:number)=><span key={i} style={{background:C.accentSoft,color:C.accent,padding:"1px 5px",borderRadius:99,fontSize:7,fontWeight:600,border:"1px solid "+C.accent+"22"}}>{t.replace(/_/g," ")}</span>)}
      </div>

      {/* Clip role pill */}
      {isClip&&clipRole&&(()=>{const rc=secColor(clipRole.toUpperCase());return<div style={{display:"flex",marginTop:1}}><span style={{background:rc.bg,color:rc.color,border:"1px solid "+(rc.bd||rc.color+"22"),padding:"1px 7px",borderRadius:99,fontSize:7,fontWeight:700}}>{clipRole.toUpperCase()}</span></div>})()}

      <div style={{fontWeight:700,fontSize:compact?10:13,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>{item.title}</div>
      {item.creator&&<div style={{fontSize:compact?8:10,color:C.muted}}>{"\uD83D\uDC64"} {item.creator}{item.creator_age?` \u00B7 ${item.creator_age}`:""}</div>}

      {/* Source video name for clips */}
      {isClip&&parentTitle&&<div style={{fontSize:compact?7:9,color:C.muted,opacity:0.7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{"\uD83D\uDCCE"} from {parentTitle}</div>}

      {!compact&&(item.analysis?.scene_tags||[]).slice(0,2).map((t:string,i:number)=><span key={i} style={{background:"#22c55e18",color:"#4ade80",padding:"1px 5px",borderRadius:99,fontSize:8,fontWeight:600}}>{t}</span>)}
    </div>
  </div>
}
