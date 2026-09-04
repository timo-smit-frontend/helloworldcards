import { useCallback, useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronDown, ChevronUp, Crop as CropIcon, FlipHorizontal, FlipVertical, Link2, Link2Off, RotateCcw, RotateCw, X } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import type { CmsMedia } from '~/cms/types'
import { adminJson } from './api'
import { appendUploadVariants } from './media-variants'

// Canvas can only re-encode raster formats; GIF and SVG are left untouched.
const EDITABLE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

export function canEditImage(contentType: string): boolean {
  return contentType in EDITABLE_TYPES
}

type Crop = { x: number; y: number; width: number; height: number }
type Size = { width: number; height: number }

const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 }
const MIN_CROP = 0.02
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]
type Drag = { mode: 'move' | Handle; originX: number; originY: number; start: Crop }

// Corner brackets and edge bars straddle the crop lines, the way a crop tool frames a
// selection. The pseudo-element widens the grab area without making the marks chunky.
const HANDLE_BASE = "absolute bg-site-envy drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] after:absolute after:-inset-2.5 after:content-['']"
const CORNER_BASE = 'absolute size-6 border-site-envy bg-transparent'
const HANDLE_POSITION: Record<Handle, string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 border-t-4 border-l-4 cursor-nwse-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 border-t-4 border-r-4 cursor-nesw-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 border-r-4 border-b-4 cursor-nwse-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 border-b-4 border-l-4 cursor-nesw-resize',
  n: 'top-0 left-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  s: 'bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  e: 'top-1/2 right-0 h-8 w-1 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  w: 'top-1/2 left-0 h-8 w-1 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize'
}

function isCorner(handle: Handle): boolean {
  return handle.length === 2
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function editedFilename(filename: string, extension: string): string {
  const stem = filename.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}.${extension}`
}

function rotatedSize(width: number, height: number, rotation: number): Size {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width }
}

function ToolButton({ label, icon, active, onClick }: { label: string; icon: typeof RotateCw; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex size-11 cursor-pointer items-center justify-center border-r border-site-mulled-wine smooth last:border-r-0 ${
        active ? 'bg-site-envy/15 text-site-envy' : 'text-site-mantle hover:bg-site-dark hover:text-site-gray-nurse'
      }`}
    >
      <MorphIcon icon={icon} size={18} strokeWidth={2.25} />
    </button>
  )
}

// Native number spinners look out of place on the rounded fields, so they are hidden in
// favour of matching chevron steppers.
function NumberField({
  label,
  prefix,
  value,
  onChange
}: {
  label: string
  prefix: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex min-h-11 items-center rounded-full border-2 border-site-mulled-wine bg-site-dark pr-1.5 pl-4 focus-within:border-site-envy">
      <span aria-hidden className="text-xs font-semibold tracking-[0.18em] text-site-mantle uppercase">
        {prefix}
      </span>
      <input
        type="number"
        min={1}
        max={10000}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-16 appearance-none bg-transparent pl-2 text-sm text-site-gray-nurse outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="flex flex-col">
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          className="flex h-4 w-6 cursor-pointer items-center justify-center rounded-full text-site-mantle smooth hover:bg-site-mulled-wine/50 hover:text-site-envy"
          onClick={() => onChange(value + 1)}
        >
          <MorphIcon icon={ChevronUp} size={12} strokeWidth={3} />
        </button>
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="flex h-4 w-6 cursor-pointer items-center justify-center rounded-full text-site-mantle smooth hover:bg-site-mulled-wine/50 hover:text-site-envy"
          onClick={() => onChange(value - 1)}
        >
          <MorphIcon icon={ChevronDown} size={12} strokeWidth={3} />
        </button>
      </span>
    </div>
  )
}

export function MediaImageEditor({
  item,
  open,
  onOpenChange,
  onSaved
}: {
  item: CmsMedia
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (next: CmsMedia) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [source, setSource] = useState<HTMLImageElement | null>(null)
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [crop, setCrop] = useState<Crop>(FULL_CROP)
  const [cropping, setCropping] = useState(false)
  const [output, setOutput] = useState<Size>({ width: 0, height: 0 })
  const [linked, setLinked] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    setRotation(0)
    setFlipX(false)
    setFlipY(false)
    setCrop(FULL_CROP)
    setCropping(false)
    setError('')
    const image = new window.Image()
    image.onload = () => setSource(image)
    image.onerror = () => setError('Could not load this image for editing.')
    // Always edit the original file, never a resized variant.
    image.src = item.url
    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [open, item.url])

  // The visible canvas holds the rotated and flipped image at full resolution and
  // doubles as the source the export reads from, so what you see is what gets saved.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) {
      return
    }
    const size = rotatedSize(source.naturalWidth, source.naturalHeight, rotation)
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.clearRect(0, 0, size.width, size.height)
    context.save()
    context.translate(size.width / 2, size.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
    context.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2)
    context.restore()
  }, [source, rotation, flipX, flipY])

  const cropSize: Size = source
    ? (() => {
        const size = rotatedSize(source.naturalWidth, source.naturalHeight, rotation)
        return { width: Math.max(1, Math.round(size.width * crop.width)), height: Math.max(1, Math.round(size.height * crop.height)) }
      })()
    : { width: 0, height: 0 }

  // Cropping or rotating changes what "actual size" means, so the pixel fields follow
  // along until they are edited again.
  useEffect(() => {
    setOutput(cropSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow the crop box, not every render
  }, [cropSize.width, cropSize.height])

  const pointAt = useCallback((event: PointerEvent | React.PointerEvent) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null
    }
    return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    function move(event: PointerEvent) {
      const drag = dragRef.current
      const point = pointAt(event)
      if (!drag || !point) {
        return
      }
      if (drag.mode === 'move') {
        setCrop({
          ...drag.start,
          x: clamp01(Math.min(drag.start.x + point.x - drag.originX, 1 - drag.start.width)),
          y: clamp01(Math.min(drag.start.y + point.y - drag.originY, 1 - drag.start.height))
        })
        return
      }
      const start = drag.start
      const left = drag.mode.includes('w') ? Math.min(point.x, start.x + start.width - MIN_CROP) : start.x
      const right = drag.mode.includes('e') ? Math.max(point.x, start.x + MIN_CROP) : start.x + start.width
      const top = drag.mode.includes('n') ? Math.min(point.y, start.y + start.height - MIN_CROP) : start.y
      const bottom = drag.mode.includes('s') ? Math.max(point.y, start.y + MIN_CROP) : start.y + start.height
      setCrop({ x: left, y: top, width: right - left, height: bottom - top })
    }
    function end() {
      dragRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [open, pointAt])

  function startDrag(mode: Drag['mode'], event: React.PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    const point = pointAt(event)
    if (!point) {
      return
    }
    dragRef.current = { mode, originX: point.x, originY: point.y, start: crop }
  }

  // Leaving crop mode drops the selection, so the whole image is saved again.
  function toggleCropping() {
    setCropping((current) => {
      if (current) {
        setCrop(FULL_CROP)
      }
      return !current
    })
  }

  function rotate(degrees: number) {
    setRotation((current) => (current + degrees + 360) % 360)
    setCrop(FULL_CROP)
  }

  function resize(side: 'width' | 'height', value: number) {
    const next = Math.max(1, Math.min(10000, Math.round(value || 0)))
    if (!linked || cropSize.width === 0 || cropSize.height === 0) {
      setOutput((current) => ({ ...current, [side]: next }))
      return
    }
    const ratio = cropSize.width / cropSize.height
    setOutput(
      side === 'width'
        ? { width: next, height: Math.max(1, Math.round(next / ratio)) }
        : { width: Math.max(1, Math.round(next * ratio)), height: next }
    )
  }

  async function save() {
    const canvas = canvasRef.current
    if (!canvas || !source) {
      return
    }
    setSaving(true)
    setError('')
    const target = document.createElement('canvas')
    target.width = Math.max(1, output.width)
    target.height = Math.max(1, output.height)
    const context = target.getContext('2d')
    if (!context) {
      setSaving(false)
      setError('Could not render the edited image.')
      return
    }
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      canvas,
      Math.round(crop.x * canvas.width),
      Math.round(crop.y * canvas.height),
      Math.max(1, Math.round(crop.width * canvas.width)),
      Math.max(1, Math.round(crop.height * canvas.height)),
      0,
      0,
      target.width,
      target.height
    )
    const type = canEditImage(item.contentType) ? item.contentType : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) => target.toBlob(resolve, type, 0.92))
    if (!blob) {
      setSaving(false)
      setError('Could not render the edited image.')
      return
    }
    const edited = new File([blob], editedFilename(item.filename, EDITABLE_TYPES[type] ?? 'jpg'), { type })
    const body = new FormData()
    body.append('file', edited)
    await appendUploadVariants(body, edited)
    const result = await adminJson<{ media?: CmsMedia; error?: string }>(`/media/${item.id}/file`, { method: 'POST', body })
    setSaving(false)
    if (result.data?.media) {
      onSaved(result.data.media)
      onOpenChange(false)
      return
    }
    setError(result.data?.error ?? 'Could not save the edited image.')
  }

  const cropStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-100 flex max-h-[min(90dvh,56rem)] w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-auto rounded-panel bg-site-gunmetal ring-1 ring-site-mulled-wine outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="sticky top-0 z-20 flex items-stretch justify-between border-b border-site-mulled-wine bg-site-gunmetal">
            <DialogPrimitive.Title className="title-xs self-center px-5 py-4">Edit image</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex w-14 cursor-pointer items-center justify-center border-l border-site-mulled-wine text-site-mantle smooth hover:text-site-gray-nurse"
            >
              <MorphIcon icon={X} size={20} strokeWidth={2.25} />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Crop, resize, rotate, and flip this image before saving it.
          </DialogPrimitive.Description>
          <div className="flex min-h-64 items-center justify-center overflow-hidden bg-site-dark p-4 md:p-8">
            <div ref={frameRef} className="relative w-fit touch-none select-none">
              <canvas ref={canvasRef} className="block max-h-[min(50dvh,32rem)] w-auto max-w-full object-contain" />
              {cropping ? (
                <>
                  {/* Everything outside the box stays visible but dimmed, so you can see what is being cut off. */}
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute shadow-[0_0_0_9999px_rgba(28,32,48,0.72)]" style={cropStyle} />
                  </div>
                  {/* The crop lines run out past the image so an edge stays easy to follow. */}
                  <div className="pointer-events-none absolute inset-0">
                    <span className="absolute -left-[100vw] h-px w-[300vw] bg-site-envy/40" style={{ top: cropStyle.top }} />
                    <span
                      className="absolute -left-[100vw] h-px w-[300vw] bg-site-envy/40"
                      style={{ top: `calc(${cropStyle.top} + ${cropStyle.height})` }}
                    />
                    <span className="absolute -top-[100vh] h-[300vh] w-px bg-site-envy/40" style={{ left: cropStyle.left }} />
                    <span
                      className="absolute -top-[100vh] h-[300vh] w-px bg-site-envy/40"
                      style={{ left: `calc(${cropStyle.left} + ${cropStyle.width})` }}
                    />
                  </div>
                  <div
                    className="absolute cursor-move outline-1 outline-site-gray-nurse/60"
                    style={cropStyle}
                    onPointerDown={(event) => startDrag('move', event)}
                  >
                    <div className="pointer-events-none absolute inset-0">
                      <span className="absolute inset-y-0 left-1/3 w-px bg-site-gray-nurse/20" />
                      <span className="absolute inset-y-0 left-2/3 w-px bg-site-gray-nurse/20" />
                      <span className="absolute inset-x-0 top-1/3 h-px bg-site-gray-nurse/20" />
                      <span className="absolute inset-x-0 top-2/3 h-px bg-site-gray-nurse/20" />
                    </div>
                    {HANDLES.map((handle) => (
                      <span
                        key={handle}
                        role="presentation"
                        onPointerDown={(event) => startDrag(handle, event)}
                        className={`${isCorner(handle) ? CORNER_BASE : HANDLE_BASE} ${HANDLE_POSITION[handle]}`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                aria-pressed={cropping}
                onClick={() => toggleCropping()}
                className={`inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold smooth ${
                  cropping
                    ? 'border-site-envy bg-site-envy/15 text-site-envy'
                    : 'border-site-mulled-wine bg-site-dark text-site-gray-nurse hover:border-site-envy hover:text-site-envy'
                }`}
              >
                <MorphIcon icon={CropIcon} size={18} strokeWidth={2.25} />
                {cropping ? 'Cropping' : 'Crop image'}
              </button>
              <div className="flex overflow-hidden rounded-full border-2 border-site-mulled-wine bg-site-gunmetal">
                <ToolButton label="Rotate left" icon={RotateCcw} onClick={() => rotate(-90)} />
                <ToolButton label="Rotate right" icon={RotateCw} onClick={() => rotate(90)} />
                <ToolButton label="Flip horizontal" icon={FlipHorizontal} active={flipX} onClick={() => setFlipX((current) => !current)} />
                <ToolButton label="Flip vertical" icon={FlipVertical} active={flipY} onClick={() => setFlipY((current) => !current)} />
              </div>
              <div className="flex items-center gap-2">
                <NumberField label="Width in pixels" prefix="W" value={output.width} onChange={(next) => resize('width', next)} />
                <NumberField label="Height in pixels" prefix="H" value={output.height} onChange={(next) => resize('height', next)} />
                <button
                  type="button"
                  aria-label={linked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  title={linked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  aria-pressed={linked}
                  onClick={() => setLinked((current) => !current)}
                  className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 smooth ${
                    linked ? 'border-site-envy text-site-envy' : 'border-site-mulled-wine text-site-mantle hover:text-site-gray-nurse'
                  }`}
                >
                  <MorphIcon icon={linked ? Link2 : Link2Off} size={16} strokeWidth={2.25} />
                </button>
              </div>
            </div>
            {error ? <p className="content-s text-site-loss">{error}</p> : null}
            <div className="flex items-center gap-2">
              <button type="button" className="button-green w-fit cursor-pointer" disabled={saving || !source} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save image'}
              </button>
              <button type="button" className="button-quiet w-fit" onClick={() => onOpenChange(false)}>
                Cancel
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
