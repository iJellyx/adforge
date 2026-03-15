import { NextRequest, NextResponse } from 'next/server'
import Mux from '@mux/mux-node'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    console.log('Upload route hit')
    console.log('MUX_TOKEN_ID:', process.env.MUX_TOKEN_ID ? 'present' : 'missing')
    console.log('MUX_TOKEN_SECRET:', process.env.MUX_TOKEN_SECRET ? 'present' : 'missing')
    console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing')
    console.log('SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing')

    const mux = new Mux({
      tokenId: process.env.MUX_TOKEN_ID!,
      tokenSecret: process.env.MUX_TOKEN_SECRET!,
    })

    const supabase = createServiceClient()
    const { filename, contentType, metadata } = await req.json()
    console.log('Request parsed, filename:', filename)

    const { data: item, error } = await supabase
      .from('items')
      .insert({
        type: 'original',
        title: metadata.title || filename.replace(/\.[^/.]+$/, ''),
        creator: metadata.creator || '',
        creator_age: metadata.creatorAge || '',
        creator_gender: metadata.creatorGender || '',
        description: metadata.description || '',
        transcript: metadata.transcript || '',
        mux_status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('Item created:', item.id)

    const upload = await mux.video.uploads.create({
      new_asset_settings: {
        playback_policy: ['public'],
        passthrough: item.id,
        mp4_support: 'standard',
      },
      cors_origin: '*',
    })

    console.log('Mux upload created:', upload.url)
    return NextResponse.json({ itemId: item.id, uploadUrl: upload.url })

  } catch (err: any) {
    console.error('Upload route error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
