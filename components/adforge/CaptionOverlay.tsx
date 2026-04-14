'use client'
import type { CaptionStyle, CaptionSettings, WordTimestamp } from './types'

export function isKeyWord(word:string,idx:number,all:string[]):boolean{
  const clean=word.replace(/[^a-zA-Z0-9%$£€]/g,"")
  if(!clean)return false
  if(/^\d/.test(clean))return true
  if(/%|€|\$|£/.test(word))return true
  if(clean===clean.toUpperCase()&&clean.length>1)return true
  if(idx>0&&/[.!?]$/.test(all[idx-1]))return true
  if((idx+1)%4===0)return true
  return false
}

export function buildCaptionChunks(text:string,style:CaptionStyle,totalDur:number,wordTimestamps?:WordTimestamp[]):{words:string[],start:number,end:number,wordStarts?:number[],wordEnds?:number[]}[]{
  const words=text.trim().split(/\s+/).filter(Boolean)
  if(!words.length)return[]

  // If we have real word timestamps from Deepgram, use them for precise timing
  const hasTimestamps=wordTimestamps&&wordTimestamps.length>0

  if(style==="line"){
    const start=hasTimestamps?wordTimestamps![0].start:0
    const end=hasTimestamps?wordTimestamps![wordTimestamps!.length-1].end:totalDur
    return[{words:hasTimestamps?wordTimestamps!.map(w=>w.word):words,start,end,wordStarts:hasTimestamps?wordTimestamps!.map(w=>w.start):undefined,wordEnds:hasTimestamps?wordTimestamps!.map(w=>w.end):undefined}]
  }
  if(style==="karaoke"){
    return[{words:hasTimestamps?wordTimestamps!.map(w=>w.word):words,start:0,end:totalDur,wordStarts:hasTimestamps?wordTimestamps!.map(w=>w.start):undefined,wordEnds:hasTimestamps?wordTimestamps!.map(w=>w.end):undefined}]
  }

  // Word-by-word: groups of 2
  if(hasTimestamps){
    const chunks:{words:string[],start:number,end:number,wordStarts:number[],wordEnds:number[]}[]=[]
    for(let i=0;i<wordTimestamps!.length;i+=2){
      const group=wordTimestamps!.slice(i,i+2)
      chunks.push({words:group.map(w=>w.word),start:group[0].start,end:group[group.length-1].end,wordStarts:group.map(w=>w.start),wordEnds:group.map(w=>w.end)})
    }
    return chunks
  }

  // Fallback: evenly distributed timing
  const chunks:{words:string[],start:number,end:number}[]=[]
  for(let i=0;i<words.length;i+=2){
    const group=words.slice(i,i+2)
    chunks.push({words:group,start:0,end:0})
  }
  const durEach=totalDur/chunks.length
  return chunks.map((c,i)=>({...c,start:i*durEach,end:(i+1)*durEach}))
}

export function CaptionOverlay({spoken,elapsed,clipDur,settings,wordTimestamps}:{spoken:string,elapsed:number,clipDur:number,settings:CaptionSettings,wordTimestamps?:WordTimestamp[]}){
  if(!settings.enabled||!spoken.trim())return null
  const chunks=buildCaptionChunks(spoken,settings.style,clipDur,wordTimestamps)
  if(!chunks.length)return null
  const allWords=chunks.flatMap(c=>c.words)
  const hasTimestamps=wordTimestamps&&wordTimestamps.length>0

  // With real timestamps, find the active word by checking elapsed against word start/end
  let activeWordIdx=0
  if(hasTimestamps){
    for(let i=0;i<wordTimestamps!.length;i++){
      if(elapsed>=wordTimestamps![i].start)activeWordIdx=i
    }
  }else{
    const progress=Math.min(1,elapsed/clipDur)
    activeWordIdx=Math.floor(progress*allWords.length)
  }

  let displayWords:string[]=[];let chunkStart=0
  if(settings.style==="karaoke"){displayWords=allWords;chunkStart=0}
  else{
    const active=chunks.find(c=>elapsed>=c.start&&elapsed<c.end)||chunks[chunks.length-1]
    if(!active)return null
    displayWords=active.words
    let off=0;for(const c of chunks){if(c===active)break;off+=c.words.length}
    chunkStart=off
  }
  const {fontSize,accentColor,style}=settings
  return<div style={{position:"absolute",bottom:"18%",left:"50%",transform:"translateX(-50%)",width:"88%",textAlign:"center",pointerEvents:"none",zIndex:10,filter:"drop-shadow(0 1px 3px rgba(0,0,0,0.9))"}}>
    <div style={{display:"inline-flex",flexWrap:"wrap",justifyContent:"center",gap:"0 6px",lineHeight:1.25}}>
      {displayWords.map((word,i)=>{
        const globalIdx=chunkStart+i
        const isKey=isKeyWord(word,globalIdx,allWords)
        const isActive=style==="karaoke"&&globalIdx===activeWordIdx
        const isPast=style==="karaoke"&&globalIdx<activeWordIdx
        return<span key={i} style={{fontFamily:"'Plus Jakarta Sans','Arial Black',system-ui,sans-serif",fontSize:fontSize+"px",fontWeight:900,color:isActive||isKey?accentColor:"#fff",opacity:style==="karaoke"?(isPast?0.55:1):1,textShadow:"0 0 8px rgba(0,0,0,0.8), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",transition:"color 0.05s"}}>{word}</span>
      })}
    </div>
  </div>
}
