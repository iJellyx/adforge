'use client'
import { useRef, useState } from 'react'
import { Upload, Image as ImageIcon, Trash2, X, Maximize2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { C } from './constants'
import { Btn } from './ui-primitives'
import type { Item } from './types'

type Props = {
  items: Item[]
  workspaceId: string
  onRefresh: () => void
  /** Drag-drop into folders is handled at the parent (FolderTree wrapper). */
  selectMode?: boolean
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
}

/**
 * Stash → Images
 *
 * Brand-asset image library. Multi-file upload (drag-drop OR file picker),
 * grid display, click-to-preview, drag-to-folder. Uses the same `items`
 * table as videos/clips (kind='image') so folders + tagging + cross-product
 * sharing all reuse the existing infra.
 */
export function ImagesView({ items, workspaceId, onRefresh, selectMode, selectedIds, onToggleSelect }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadCount, setUploadCount] = useState({ done: 0, total: 0 })
  const [errors, setErrors] = useState<string[]>([])
  const [previewItem, setPreviewItem] = useState<Item | null>(null)
  const [dragOverGrid, setDragOverGrid] = useState(false)

  // Filter to images only (parent passes the full items list)
  const images = items.filter(i => i.type === 'image' || (i as any).kind === 'image')

  async function probeImage(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve({ width: 0, height: 0 })
      img.src = URL.createObjectURL(file)
    })
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (list.length === 0) {
      setErrors(['Drop image files only — pick png/jpg/webp/gif/svg.'])
      return
    }
    setUploading(true)
    setErrors([])
    setUploadCount({ done: 0, total: list.length })

    const fd = new FormData()
    fd.append('workspace_id', workspaceId)
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      fd.append('file', f)
      // Pair the dimensions with file index — server uses items.length+errors.length
      // as the pair key, which mirrors the order of files coming in.
      const { width, height } = await probeImage(f)
      fd.append(`width_${i}`, String(width))
      fd.append(`height_${i}`, String(height))
      setUploadCount({ done: i, total: list.length })
    }

    try {
      const res = await fetch('/api/images/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.errors?.length) setErrors(data.errors)
      onRefresh()
    } catch (e: any) {
      setErrors(['Upload failed: ' + (e?.message || 'unknown error')])
    }
    setUploading(false)
    setUploadCount({ done: 0, total: 0 })
    if (fileRef.current) fileRef.current.value = ''
  }

  async function deleteImage(id: string) {
    if (!confirm('Delete this image? Cannot be undone.')) return
    // Resolve storage path from src_url so we can remove the file from the bucket
    const item = images.find(i => i.id === id)
    if (item?.src_url) {
      const m = item.src_url.match(/\/stash-images\/(.+)$/)
      if (m) {
        await supabase.storage.from('stash-images').remove([m[1]])
      }
    }
    await supabase.from('items').delete().eq('id', id)
    onRefresh()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOverGrid(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Images</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Brand assets, product photos, end-card art, logos. Drag files anywhere on the grid below to upload.
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files) handleFiles(e.target.files) }}
        />
        <Btn
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ background: C.accent, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <Upload size={14} strokeWidth={2.4} />
          {uploading ? `Uploading ${uploadCount.done}/${uploadCount.total}…` : 'Upload images'}
        </Btn>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ background: 'var(--af-red-soft)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--af-red)', fontWeight: 600, marginBottom: 4 }}>Some uploads failed:</div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 11, color: 'var(--af-red)' }}>• {e}</div>)}
        </div>
      )}

      {/* Grid + drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOverGrid(true) }}
        onDragLeave={() => setDragOverGrid(false)}
        onDrop={handleDrop}
        style={{
          minHeight: 400,
          padding: images.length === 0 ? 60 : 0,
          background: dragOverGrid ? 'var(--af-accent-soft)' : 'transparent',
          border: dragOverGrid ? '2px dashed ' + C.accent : '2px dashed transparent',
          borderRadius: 14,
          transition: 'all 0.15s',
        }}
      >
        {images.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.muted }}>
            <ImageIcon size={36} style={{ opacity: 0.4, marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>
              No images yet
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Drop image files anywhere here, or click <strong>Upload images</strong> above.<br />
              Logos, product photos, lifestyle shots, end-card art — anything you want both Forge and Split to reach.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {images.map(img => {
              const isSelected = !!selectedIds?.includes(img.id)
              return (
                <div
                  key={img.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/x-adforge-item', img.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={(e) => {
                    if (selectMode) { e.stopPropagation(); onToggleSelect?.(img.id); return }
                    setPreviewItem(img)
                  }}
                  style={{
                    position: 'relative',
                    background: C.card,
                    border: '1.5px solid ' + (isSelected ? C.accent : C.border),
                    borderRadius: 12,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'transform 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = C.accent + '88' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = C.border }}
                >
                  <div style={{
                    position: 'relative',
                    paddingTop: '100%',
                    background: '#f3f0e8',
                    overflow: 'hidden',
                  }}>
                    {img.src_url ? (
                      <img
                        src={img.src_url}
                        alt={img.title}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>
                        No preview
                      </div>
                    )}
                    {selectMode && (
                      <div style={{
                        position: 'absolute', top: 8, left: 8,
                        width: 22, height: 22, borderRadius: 6,
                        background: isSelected ? C.accent : 'rgba(0,0,0,0.55)',
                        border: '2px solid ' + (isSelected ? '#fff' : 'rgba(255,255,255,0.4)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>✓</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {img.title}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {img.width && img.height ? `${img.width}×${img.height}` : 'Image'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewItem && (
        <div
          onClick={() => setPreviewItem(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={previewItem.src_url}
              alt={previewItem.title}
              style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
            />
            <div style={{
              position: 'absolute', top: -44, left: 0, right: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {previewItem.title}
                {previewItem.width && previewItem.height ? (
                  <span style={{ marginLeft: 10, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    {previewItem.width}×{previewItem.height}
                  </span>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => deleteImage(previewItem.id)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Trash2 size={12} /> Delete
                </button>
                <button
                  onClick={() => setPreviewItem(null)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <X size={12} /> Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
