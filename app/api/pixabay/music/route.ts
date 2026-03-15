import { NextRequest, NextResponse } from 'next/server'

const MUSIC_BY_MOOD: Record<string, any[]> = {
  uplifting: [
    {id:"u1",name:"Inspiring Morning",artist:"Scott Holmes",duration:158,url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Inspiring_Cinematic_Music/Scott_Holmes_-_01_-_Inspiring_Morning.mp3",preview_url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Inspiring_Cinematic_Music/Scott_Holmes_-_01_-_Inspiring_Morning.mp3"},
    {id:"u2",name:"Upbeat Party",artist:"Scott Holmes",duration:124,url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Upbeat_Party/Scott_Holmes_-_01_-_Upbeat_Party.mp3",preview_url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Upbeat_Party/Scott_Holmes_-_01_-_Upbeat_Party.mp3"},
  ],
  energetic: [
    {id:"e1",name:"Rock Intro",artist:"Audionautix",duration:90,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rock%20Intro.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rock%20Intro.mp3"},
    {id:"e2",name:"Pump",artist:"Audionautix",duration:115,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pump.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pump.mp3"},
  ],
  relaxing: [
    {id:"r1",name:"Relaxing Piano Music",artist:"Kevin MacLeod",duration:180,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Relaxing%20Piano%20Music.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Relaxing%20Piano%20Music.mp3"},
    {id:"r2",name:"Slow Burn",artist:"Kevin MacLeod",duration:134,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Slow%20Burn.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Slow%20Burn.mp3"},
  ],
  inspiring: [
    {id:"i1",name:"Positive Motivation",artist:"Scott Holmes",duration:162,url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Inspiring_Cinematic_Music/Scott_Holmes_-_02_-_Positive_Motivation.mp3",preview_url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Inspiring_Cinematic_Music/Scott_Holmes_-_02_-_Positive_Motivation.mp3"},
    {id:"i2",name:"Upbeat Forever",artist:"Scott Holmes",duration:140,url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Upbeat_Party/Scott_Holmes_-_02_-_Upbeat_Forever.mp3",preview_url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Upbeat_Party/Scott_Holmes_-_02_-_Upbeat_Forever.mp3"},
  ],
  emotional: [
    {id:"em1",name:"Touching Moment",artist:"Kevin MacLeod",duration:148,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Touching%20Moment.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Touching%20Moment.mp3"},
    {id:"em2",name:"Bittersweet",artist:"Kevin MacLeod",duration:120,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bittersweet.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bittersweet.mp3"},
  ],
  fun: [
    {id:"f1",name:"Carefree",artist:"Kevin MacLeod",duration:132,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3"},
    {id:"f2",name:"Polka",artist:"Kevin MacLeod",duration:110,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Polka.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Polka.mp3"},
  ],
  dramatic: [
    {id:"d1",name:"Cipher",artist:"Kevin MacLeod",duration:145,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher.mp3"},
    {id:"d2",name:"Danse Macabre",artist:"Kevin MacLeod",duration:220,url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Danse%20Macabre.mp3",preview_url:"https://incompetech.com/music/royalty-free/mp3-royaltyfree/Danse%20Macabre.mp3"},
  ],
  corporate: [
    {id:"c1",name:"Networking",artist:"Scott Holmes",duration:155,url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Inspiring_Cinematic_Music/Scott_Holmes_-_03_-_Networking.mp3",preview_url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Inspiring_Cinematic_Music/Scott_Holmes_-_03_-_Networking.mp3"},
    {id:"c2",name:"Bright Sun",artist:"Scott Holmes",duration:130,url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Upbeat_Party/Scott_Holmes_-_03_-_Bright_Sun.mp3",preview_url:"https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Scott_Holmes/Upbeat_Party/Scott_Holmes_-_03_-_Bright_Sun.mp3"},
  ],
  acoustic: [
    {id:"ac1",name:"Acoustic Breeze",artist:"Bensound",duration:172,url:"https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3",preview_url:"https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3"},
    {id:"ac2",name:"Sweet",artist:"Bensound",duration:183,url:"https://www.bensound.com/bensound-music/bensound-sweet.mp3",preview_url:"https://www.bensound.com/bensound-music/bensound-sweet.mp3"},
  ],
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || 'uplifting').toLowerCase()
  const key = Object.keys(MUSIC_BY_MOOD).find(k => q.includes(k)) || 'uplifting'
  const tracks = MUSIC_BY_MOOD[key] || MUSIC_BY_MOOD.uplifting
  return NextResponse.json({ tracks })
}