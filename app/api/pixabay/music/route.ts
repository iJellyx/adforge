import { NextRequest, NextResponse } from 'next/server'

interface PixabayTrack {
  id: string
  title: string
  duration: number
  downloads: number
  pageURL: string
  previewURL: string
  largePreviewURL?: string
}

interface Track {
  id: string
  name: string
  artist: string
  duration: number
  mood: string
  url: string
  preview_url: string
}

const FALLBACK_TRACKS: Track[] = [
  // Uplifting / Corporate
  {id:"1",name:"Inspiring Morning",artist:"Scott Holmes",duration:158,mood:"uplifting,inspiring,corporate",url:"https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3"},
  {id:"2",name:"Deep Corporate",artist:"Pixabay",duration:155,mood:"corporate,uplifting,inspiring",url:"https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3"},
  {id:"3",name:"Motivational",artist:"Pixabay",duration:134,mood:"uplifting,inspiring,energetic",url:"https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b4fd4fe.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b4fd4fe.mp3"},
  {id:"4",name:"Corporate Uplifting",artist:"Pixabay",duration:140,mood:"corporate,uplifting,inspiring",url:"https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749b5e5.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749b5e5.mp3"},
  {id:"5",name:"Positive Thinking",artist:"Pixabay",duration:122,mood:"uplifting,fun,inspiring",url:"https://cdn.pixabay.com/download/audio/2022/04/07/audio_f334dba7c5.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/04/07/audio_f334dba7c5.mp3"},
  // Energetic
  {id:"6",name:"Energetic Sport",artist:"Pixabay",duration:120,mood:"energetic,fun,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3"},
  {id:"7",name:"Action Intro",artist:"Pixabay",duration:95,mood:"energetic,dramatic,fun",url:"https://cdn.pixabay.com/download/audio/2022/07/25/audio_c5d1a99ec9.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/07/25/audio_c5d1a99ec9.mp3"},
  {id:"8",name:"Upbeat Funk",artist:"Pixabay",duration:128,mood:"energetic,fun,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/06/11/audio_c8e5f3b12e.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/06/11/audio_c8e5f3b12e.mp3"},
  // Relaxing / Emotional
  {id:"9",name:"Calm Piano",artist:"Pixabay",duration:180,mood:"relaxing,emotional,acoustic",url:"https://cdn.pixabay.com/download/audio/2021/11/13/audio_cb4e15f7ba.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2021/11/13/audio_cb4e15f7ba.mp3"},
  {id:"10",name:"Emotional Strings",artist:"Pixabay",duration:190,mood:"emotional,dramatic,relaxing",url:"https://cdn.pixabay.com/download/audio/2022/01/24/audio_6f4c4bc95c.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/01/24/audio_6f4c4bc95c.mp3"},
  {id:"11",name:"Lofi Chill",artist:"Pixabay",duration:170,mood:"relaxing,acoustic,emotional",url:"https://cdn.pixabay.com/download/audio/2022/05/17/audio_8a1e7c2e3e.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/05/17/audio_8a1e7c2e3e.mp3"},
  {id:"12",name:"Soft Acoustic",artist:"Pixabay",duration:132,mood:"acoustic,relaxing,emotional",url:"https://cdn.pixabay.com/download/audio/2022/03/10/audio_2dde668d05.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/03/10/audio_2dde668d05.mp3"},
  // Dramatic
  {id:"13",name:"Cinematic Drama",artist:"Pixabay",duration:165,mood:"dramatic,emotional,inspiring",url:"https://cdn.pixabay.com/download/audio/2022/04/27/audio_67f8b2bef2.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/04/27/audio_67f8b2bef2.mp3"},
  {id:"14",name:"Epic Trailer",artist:"Pixabay",duration:155,mood:"dramatic,energetic,inspiring",url:"https://cdn.pixabay.com/download/audio/2022/09/13/audio_74c6b4d534.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/09/13/audio_74c6b4d534.mp3"},
  // Fun
  {id:"15",name:"Happy Ukulele",artist:"Pixabay",duration:145,mood:"fun,uplifting,acoustic",url:"https://cdn.pixabay.com/download/audio/2021/09/06/audio_166c2a8e78.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2021/09/06/audio_166c2a8e78.mp3"},
  {id:"16",name:"Playful Pop",artist:"Pixabay",duration:118,mood:"fun,energetic,uplifting",url:"https://cdn.pixabay.com/download/audio/2022/11/22/audio_febc508520.mp3",preview_url:"https://cdn.pixabay.com/download/audio/2022/11/22/audio_febc508520.mp3"},
]

function getMoodFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase()
  const moods: string[] = []

  if (lowerTitle.match(/uplifting|inspiring|motivat|positive|happy|joyful|cheerful/i)) {
    moods.push('uplifting', 'inspiring')
  }
  if (lowerTitle.match(/energetic|upbeat|dynamic|active|sport|fun/i)) {
    moods.push('energetic', 'fun')
  }
  if (lowerTitle.match(/calm|relax|chill|lofi|ambient|peace|meditat/i)) {
    moods.push('relaxing', 'acoustic')
  }
  if (lowerTitle.match(/dramatic|epic|cinematic|trailer|intense|powerful/i)) {
    moods.push('dramatic', 'inspiring')
  }
  if (lowerTitle.match(/emotional|feeling|string|piano|acoustic/i)) {
    moods.push('emotional', 'acoustic')
  }
  if (lowerTitle.match(/corporate|business|professional|ambient/i)) {
    moods.push('corporate', 'uplifting')
  }

  return moods.length > 0 ? moods.join(',') : 'uplifting'
}

async function fetchPixabayMusic(query: string): Promise<Track[] | null> {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) return null

  try {
    const url = new URL('https://pixabay.com/api/')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('q', query)
    url.searchParams.set('category', 'music')
    url.searchParams.set('per_page', '20')
    url.searchParams.set('safesearch', 'true')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!response.ok) {
      console.error('Pixabay API error:', response.status)
      return null
    }

    const data = await response.json()
    const hits = data.hits || []

    return hits.map((track: PixabayTrack, index: number) => ({
      id: String(track.id || index),
      name: track.title || 'Untitled',
      artist: 'Pixabay',
      duration: Math.round(track.duration) || 120,
      mood: getMoodFromTitle(track.title),
      url: track.largePreviewURL || track.previewURL || '',
      preview_url: track.previewURL || '',
    }))
  } catch (err) {
    console.error('Pixabay API fetch error:', err)
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').toLowerCase()

  let tracks: Track[] = []

  // Try real Pixabay API first
  if (q) {
    const apiResults = await fetchPixabayMusic(q)
    if (apiResults && apiResults.length > 0) {
      tracks = apiResults
    }
  }

  // Fall back to hardcoded tracks if API didn't return results
  if (tracks.length === 0) {
    tracks = q ? FALLBACK_TRACKS.filter(t => t.mood.includes(q)) : FALLBACK_TRACKS
    tracks = tracks.length >= 2 ? tracks : FALLBACK_TRACKS
  }

  return NextResponse.json({ tracks })
}