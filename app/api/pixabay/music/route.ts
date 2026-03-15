import { NextRequest, NextResponse } from 'next/server'

const TRACKS: any[] = [
  {id:"1",name:"Inspiring Morning",artist:"Scott Holmes",duration:158,mood:"uplifting,inspiring,corporate",url:"https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3"},
  {id:"2",name:"Energetic Sport",artist:"Pixabay",duration:120,mood:"energetic,fun,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3"},
  {id:"3",name:"Calm Piano",artist:"Pixabay",duration:180,mood:"relaxing,emotional,acoustic",url:"https://cdn.pixabay.com/download/audio/2021/11/13/audio_cb4e15f7ba.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2021/11/13/audio_cb4e15f7ba.mp3"},
  {id:"4",name:"Corporate Background",artist:"Pixabay",duration:140,mood:"corporate,inspiring,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749b5e5.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749b5e5.mp3"},
  {id:"5",name:"Cinematic Drama",artist:"Pixabay",duration:165,mood:"dramatic,emotional",url:"https://cdn.pixabay.com/download/audio/2022/04/27/audio_67f8b2bef2.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/04/27/audio_67f8b2bef2.mp3"},
  {id:"6",name:"Happy Acoustic",artist:"Pixabay",duration:132,mood:"acoustic,fun,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/03/10/audio_2dde668d05.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/03/10/audio_2dde668d05.mp3"},
  {id:"7",name:"Motivational Beat",artist:"Pixabay",duration:145,mood:"energetic,inspiring,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b4fd4fe.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b4fd4fe.mp3"},
  {id:"8",name:"Lofi Relaxing",artist:"Pixabay",duration:170,mood:"relaxing,acoustic,emotional",url:"https://cdn.pixabay.com/download/audio/2022/05/17/audio_8a1e7c2e3e.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/05/17/audio_8a1e7c2e3e.mp3"},
  {id:"9",name:"Pop Upbeat",artist:"Pixabay",duration:128,mood:"fun,energetic,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/06/11/audio_c8e5f3b12e.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/06/11/audio_c8e5f3b12e.mp3"},
  {id:"10",name:"Deep Corporate",artist:"Pixabay",duration:155,mood:"corporate,dramatic,inspiring",url:"https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3"},
  {id:"11",name:"Emotional Strings",artist:"Pixabay",duration:190,mood:"emotional,dramatic,relaxing",url:"https://cdn.pixabay.com/download/audio/2022/01/24/audio_6f4c4bc95c.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/01/24/audio_6f4c4bc95c.mp3"},
  {id:"12",name:"Fun Kids",artist:"Pixabay",duration:95,mood:"fun,uplifting,energetic",url:"https://cdn.pixabay.com/download/audio/2021/09/06/audio_166c2a8e78.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2021/09/06/audio_166c2a8e78.mp3"},
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || 'uplifting').toLowerCase()
  const filtered = TRACKS.filter(t => t.mood.includes(q))
  const tracks = filtered.length > 0 ? filtered : TRACKS
  return NextResponse.json({ tracks })
}