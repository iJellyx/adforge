export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { writeFile, unlink, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

async function downloadToTemp(url: string, filename: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const path = join(tmpdir(), filename)
  await writeFile(path, Buffer.from(buffer))
  return path
}

export async function POST(req: NextRequest) {
  const tempFiles: string[] = []

  try {
    const { sections, itemIds, voiceoverUrl, musicUrl } = await req.json()
    const supabase = createServiceClient()

    // Fetch all items from DB
    const { data: items } = await supabase
      .from('items')
      .select('id, mux_playback_id, start_seconds, end_seconds, title')
      .in('id', itemIds)

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items found' }, { status: 400 })
    }

    // Build ordered clip list from sections
    const clips = sections
      .map((s: any) => {
        const item = items.find((i: any) => i.id === s.selectedClipId)
        if (!item?.mux_playback_id) return null
        return {
          ...item,
          start: s.start_seconds ?? item.start_seconds ?? 0,
          end: s.end_seconds ?? item.end_seconds ?? null,
        }
      })
      .filter(Boolean)

    if (!clips.length) {
      return NextResponse.json({ error: 'No clips assigned to sections' }, { status: 400 })
    }

    // Download each clip from Mux
    const clipPaths: string[] = []
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const mp4Url = `https://stream.mux.com/${clip.mux_playback_id}/capped-1080p.mp4`
      const filename = `clip_${i}_${Date.now()}.mp4`
      const path = await downloadToTemp(mp4Url, filename)
      tempFiles.push(path)

      // Trim clip if needed
      if (clip.start > 0 || clip.end) {
        const trimmedPath = join(tmpdir(), `trimmed_${i}_${Date.now()}.mp4`)
        tempFiles.push(trimmedPath)
        await new Promise<void>((resolve, reject) => {
          let cmd = ffmpeg(path).setStartTime(clip.start)
          if (clip.end) cmd = cmd.setDuration(clip.end - clip.start)
          cmd.output(trimmedPath)
            .videoCodec('copy')
            .audioCodec('copy')
            .on('end', () => resolve())
            .on('error', reject)
            .run()
        })
        clipPaths.push(trimmedPath)
      } else {
        clipPaths.push(path)
      }
    }

    // Concat all clips
    const concatPath = join(tmpdir(), `concat_${Date.now()}.mp4`)
    tempFiles.push(concatPath)

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg()
      clipPaths.forEach(p => cmd.input(p))
      cmd
        .on('end', () => resolve())
        .on('error', reject)
        .mergeToFile(concatPath, tmpdir())
    })

    let finalPath = concatPath

    // Mix voiceover + music if provided
    if (voiceoverUrl || musicUrl) {
      const mixedPath = join(tmpdir(), `mixed_${Date.now()}.mp4`)
      tempFiles.push(mixedPath)

      await new Promise<void>((resolve, reject) => {
        let cmd = ffmpeg(concatPath)
        const audioInputs: string[] = []

        if (voiceoverUrl) {
          cmd = cmd.input(voiceoverUrl)
          audioInputs.push('voiceover')
        }
        if (musicUrl) {
          cmd = cmd.input(musicUrl)
          audioInputs.push('music')
        }

        let filterComplex = ''
        if (voiceoverUrl && musicUrl) {
          const voIdx = 1, muIdx = 2
          filterComplex = `[${voIdx}:a]volume=1.0[vo];[${muIdx}:a]volume=0.2[mu];[vo][mu]amix=inputs=2:duration=first[aout]`
          cmd = cmd.outputOptions(['-filter_complex', filterComplex, '-map', '0:v', '-map', '[aout]', '-shortest'])
        } else if (voiceoverUrl) {
          cmd = cmd.outputOptions(['-map', '0:v', '-map', '1:a', '-shortest'])
        } else if (musicUrl) {
          cmd = cmd.outputOptions([
            '-filter_complex', '[1:a]volume=0.2[aout]',
            '-map', '0:v',
            '-map', '[aout]',
            '-shortest'
          ])
        }

        cmd
          .videoCodec('copy')
          .output(mixedPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run()
      })

      finalPath = mixedPath
    }

    // Read final file and return as MP4
    const finalBuffer = await readFile(finalPath)

    // Cleanup temp files
    await Promise.all(tempFiles.map(f => unlink(f).catch(() => {})))

    return new NextResponse(finalBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="adforge-ad-${Date.now()}.mp4"`,
        'Content-Length': finalBuffer.length.toString(),
      }
    })

  } catch (e: any) {
    await Promise.all(tempFiles.map(f => unlink(f).catch(() => {})))
    console.error('Export error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}