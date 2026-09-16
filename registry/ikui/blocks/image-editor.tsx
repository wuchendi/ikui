'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from 'cn'
// Types only — the runtime module is loaded lazily in an effect so this client
// component never imports fabric (a browser-only library) during SSR/prerender.
import type { Canvas, FabricImage, FabricObject } from 'fabric'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  Bold,
  BringToFront,
  Check,
  Circle,
  Code2,
  Copy,
  Crop as CropIcon,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  GripVertical,
  Hand,
  History,
  ImageUp,
  Italic,
  Layers as LayersIcon,
  Lock,
  LockOpen,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  SendToBack,
  Shapes,
  Square,
  Stamp,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react'
import * as React from 'react'
import type { Crop, PercentCrop } from '@/components/image-crop'
import {
  centerCrop,
  convertToPixelCrop,
  ImageCrop,
  makeAspectCrop,
} from '@/components/image-crop'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type FabricModule = typeof import('fabric')

const SAMPLE_IMAGE_URL =
  'https://hj-img.zeroaigen.cn/prod/USER/IMAGE/aa585c3201eaf54d0ce696484ab4abfb.jpg'

/** The stage is fit inside this box when it has not been measured yet. */
const MAX_W = 760
const MAX_H = 460

/** Tonal adjustments, normalized to fabric's -1..1 filter range. */
interface Adjust {
  brightness: number
  contrast: number
  saturation: number
}
const NEUTRAL: Adjust = { brightness: 0, contrast: 0, saturation: 0 }

/** Zoom is a multiplier over the contain-fit view; 1 = fully fit. */
const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.25

/**
 * Clamp the pan offset so the zoomed image always fills the viewport — no empty
 * gaps appear at the edges. Mirrors filerobot's `dragBoundFunc`:
 * `offset ∈ [size * (1 - zoom), 0]`.
 */
function clampViewport(canvas: Canvas) {
  const vpt = canvas.viewportTransform
  if (!vpt) return
  const z = canvas.getZoom()
  vpt[4] = Math.min(0, Math.max(vpt[4], canvas.width * (1 - z)))
  vpt[5] = Math.min(0, Math.max(vpt[5], canvas.height * (1 - z)))
  canvas.setViewportTransform(vpt)
}

/** Filter presets — each builds the fabric filter stack it layers on the base. */
type FabricFilters = FabricModule['filters']
type FilterList = NonNullable<FabricImage['filters']>
interface PresetDef {
  id: string
  label: string
  build: (f: FabricFilters) => FilterList
}
const PRESETS: PresetDef[] = [
  { id: 'original', label: 'Original', build: () => [] },
  { id: 'invert', label: 'Invert', build: (f) => [new f.Invert()] },
  { id: 'bw', label: 'B&W', build: (f) => [new f.Grayscale()] },
  { id: 'sepia', label: 'Sepia', build: (f) => [new f.Sepia()] },
  {
    id: 'vivid',
    label: 'Vivid',
    build: (f) => [
      new f.Saturation({ saturation: 0.4 }),
      new f.Contrast({ contrast: 0.12 }),
    ],
  },
  {
    id: 'clarendon',
    label: 'Clarendon',
    build: (f) => [
      new f.Contrast({ contrast: 0.15 }),
      new f.Saturation({ saturation: 0.3 }),
      new f.HueRotation({ rotation: -0.06 }),
    ],
  },
  {
    id: 'gingham',
    label: 'Gingham',
    build: (f) => [
      new f.Saturation({ saturation: -0.25 }),
      new f.Contrast({ contrast: -0.08 }),
      new f.Brightness({ brightness: 0.05 }),
    ],
  },
  {
    id: 'cool',
    label: 'Cool',
    build: (f) => [new f.HueRotation({ rotation: -0.2 })],
  },
  {
    id: 'warm',
    label: 'Warm',
    build: (f) => [new f.HueRotation({ rotation: 0.12 })],
  },
]

/** Filter-strip thumbnail render size (downscaled, so filtering is cheap). */
const THUMB_W = 160
const THUMB_H = 120

/** Compact muted label styling shared by the inspector's `FieldLabel`s. */
const FIELD_LABEL = 'text-muted-foreground text-xs font-normal'

/** Web-safe font family choices for the text annotation toolbar. */
const FONTS = [
  'sans-serif',
  'serif',
  'monospace',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
]

/** Text alignment cycle order (the toolbar button steps through these). */
const ALIGNS = ['left', 'center', 'right'] as const
const ALIGN_ICON = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
} as const

/** Crop aspect-ratio presets (`undefined` = free-form). */
const CROP_ASPECTS: { label: string; value: number | undefined }[] = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
]

/**
 * The active pointer tool. Each tool arms a single canvas pointer behaviour
 * (select / place-text / drag-a-shape / pen / mosaic / crop / pan), replacing the
 * old "tab = tool category" model.
 */
type Tool = 'select' | 'text' | 'shape' | 'draw' | 'redact' | 'crop' | 'hand'
const TOOLS: {
  value: Tool
  label: string
  Icon: React.ComponentType<{ className?: string }>
  hotkey: string
}[] = [
  { value: 'select', label: 'Select', Icon: MousePointer2, hotkey: 'v' },
  { value: 'text', label: 'Text', Icon: Type, hotkey: 't' },
  { value: 'shape', label: 'Shape', Icon: Shapes, hotkey: 'r' },
  { value: 'draw', label: 'Draw', Icon: Pencil, hotkey: 'p' },
  { value: 'redact', label: 'Redact', Icon: Grid3x3, hotkey: 'm' },
  { value: 'crop', label: 'Crop', Icon: CropIcon, hotkey: 'c' },
  { value: 'hand', label: 'Hand', Icon: Hand, hotkey: 'h' },
]

/** Shape kind drawn by the Shape tool (drag to size on the canvas). */
type ShapeKind = 'rect' | 'ellipse' | 'arrow'
const SHAPE_KINDS: {
  value: ShapeKind
  label: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  { value: 'rect', label: 'Rectangle', Icon: Square },
  { value: 'ellipse', label: 'Ellipse', Icon: Circle },
  { value: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
]

/**
 * Mosaic brush state shared between React and the canvas pointer handlers (which
 * are bound once at mount and therefore read live values through this ref).
 *
 * - `layerCanvas` is an offscreen canvas the brush paints onto; `layer` wraps it
 *   as a fabric image sitting on top of everything.
 * - `pixSrc` is a full-canvas pixelated copy of the background; each stroke
 *   reveals it through a round clip, so the mosaic always samples the original
 *   pixels rather than already-pixelated ones.
 */
interface MosaicState {
  on: boolean
  painting: boolean
  width: number
  block: number
  layer: FabricImage | null
  layerCanvas: HTMLCanvasElement | null
  pixSrc: HTMLCanvasElement | null
}

/**
 * One history frame: the fabric scene plus the canvas pixel size and derived
 * natural dims / fit scale (which `canvas.toJSON()` does not serialize).
 */
interface Snapshot {
  json: string
  width: number
  height: number
  dims: { w: number; h: number }
  fitScale: number
}

export interface ImageEditorProps {
  /** Base image to edit. Falls back to a bundled sample. */
  imageUrl?: string
  /** Fired with the exported file when the user downloads it. */
  onExport?: (file: File) => void
}

/** A row in the Layers panel — one fabric object (top-first in the list). */
interface Layer {
  id: string
  label: string
  /** User-given name (`obj.layerName`); undefined falls back to the type label. */
  name?: string
  Icon: React.ComponentType<{ className?: string }>
  visible: boolean
  active: boolean
  obj: FabricObject
}

/** Human label + icon for an object, by fabric type. */
function layerMeta(
  obj: FabricObject,
  fabric: FabricModule,
  mosaicLayer: FabricImage | null,
): { label: string; Icon: Layer['Icon'] } {
  if (obj === mosaicLayer) return { label: 'Mosaic', Icon: Grid3x3 }
  if (
    obj instanceof fabric.IText ||
    obj instanceof fabric.Textbox ||
    obj instanceof fabric.FabricText
  )
    return { label: 'Text', Icon: Type }
  if (obj instanceof fabric.Rect) return { label: 'Rectangle', Icon: Square }
  if (obj instanceof fabric.Ellipse) return { label: 'Ellipse', Icon: Circle }
  if (obj instanceof fabric.Group) return { label: 'Arrow', Icon: ArrowUpRight }
  if (obj instanceof fabric.Path) return { label: 'Drawing', Icon: Pencil }
  if (obj instanceof fabric.FabricImage)
    return { label: 'Image', Icon: ImageUp }
  return { label: 'Object', Icon: Square }
}

/** One sortable Layers-panel row. */
function LayerRow({
  layer,
  onSelect,
  onToggleVisible,
  onRename,
  onDuplicate,
  onForward,
  onBack,
  onDelete,
}: {
  layer: Layer
  onSelect: () => void
  onToggleVisible: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onForward: () => void
  onBack: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id })
  const { Icon } = layer
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const startEdit = () => {
    setDraft(layer.name ?? '')
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    onRename(draft)
  }
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-sm',
        layer.active
          ? 'border-primary bg-primary/5'
          : 'hover:bg-muted border-transparent',
        isDragging && 'opacity-60',
        !layer.visible && 'opacity-50',
      )}
    >
      <button
        type="button"
        onClick={onToggleVisible}
        className="text-muted-foreground hover:text-foreground"
        aria-label={layer.visible ? 'Hide' : 'Show'}
        title={layer.visible ? 'Hide' : 'Show'}
      >
        {layer.visible ? (
          <Eye className="size-4" />
        ) : (
          <EyeOff className="size-4" />
        )}
      </button>
      <button
        type="button"
        className="text-muted-foreground touch-none cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Icon className="size-4 shrink-0" />
      {editing ? (
        <input
          autoFocus
          value={draft}
          placeholder={layer.label}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setEditing(false)
          }}
          className="border-input min-w-0 flex-1 rounded border bg-transparent px-1 text-sm outline-none"
          aria-label="Layer name"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={startEdit}
          className="min-w-0 flex-1 truncate text-left"
          title="Double-click to rename"
        >
          {layer.label}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Layer actions"
              title="Actions"
            >
              <MoreHorizontal className="size-4" />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={startEdit}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onForward}>
            <BringToFront /> Bring forward
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onBack}>
            <SendToBack /> Send back
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Image editor — a full single-image editor built on fabric.js, wrapped in
 * ikui's Base UI toolbar. Annotate with text / shapes / arrows / image overlays,
 * free-draw, pixelate a region (mosaic), tune brightness / contrast / saturation,
 * apply filter presets, rotate / flip, undo / redo, and export to PNG or JPEG.
 *
 * fabric is browser-only, so the canvas is created from a lazily-imported module
 * inside an effect (never during render) — safe under Next's RSC / static export.
 */
export function ImageEditor({
  imageUrl = SAMPLE_IMAGE_URL,
  onExport,
}: ImageEditorProps) {
  const canvasElRef = React.useRef<HTMLCanvasElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const fabricRef = React.useRef<Canvas | null>(null)
  const modRef = React.useRef<FabricModule | null>(null)
  const mosaicRef = React.useRef<MosaicState>({
    on: false,
    painting: false,
    width: 28,
    block: 12,
    layer: null,
    layerCanvas: null,
    pixSrc: null,
  })
  // Drag-to-pan when zoomed in (filerobot-style). `spaceHeld` forces panning in
  // any tool; `prevDrawing` restores the pen after a space-pan in draw mode.
  const panRef = React.useRef({
    panning: false,
    spaceHeld: false,
    prevDrawing: false,
    lastX: 0,
    lastY: 0,
  })
  // History snapshots + cursor; `restoring` suppresses the change listener while
  // we re-load a snapshot. Each snapshot also stores the canvas pixel dimensions
  // and derived dims/fitScale — `toJSON()` omits canvas size, so without these a
  // crop could not be undone/reset correctly.
  const historyRef = React.useRef<{ stack: Snapshot[]; index: number }>({
    stack: [],
    index: -1,
  })
  const restoringRef = React.useRef(false)
  const overlayInputRef = React.useRef<HTMLInputElement>(null)
  // Mirrors of dims/fitScale state so `pushHistory` can read them without
  // entering the mount-effect deps (which would remount the canvas).
  const dimsRef = React.useRef<{ w: number; h: number } | null>(null)
  const fitScaleRef = React.useRef(1)
  // Latest undo/redo, kept current each render so the mount-bound key handler
  // calls them without needing them in its dependency array.
  const undoRef = React.useRef<() => void>(() => {})
  const redoRef = React.useRef<() => void>(() => {})
  // Reposition the floating selection toolbar; set in the mount effect, called
  // from component-scope code (e.g. after a button zoom).
  const selSyncRef = React.useRef<() => void>(() => {})
  // Rebuild the Layers list; set in the mount effect.
  const layersSyncRef = React.useRef<() => void>(() => {})
  // Transient per-object ids for the sortable layer list (rebuilt after history
  // loads, where fabric creates fresh object instances).
  const layerIdsRef = React.useRef(new WeakMap<FabricObject, string>())
  const layerSeqRef = React.useRef(0)
  // Live mirrors read by the mount-bound canvas pointer handlers (which capture
  // first-render closures, so they must read current tool / color / shape kind
  // through refs). `activateToolRef` lets a handler switch tools after a create;
  // `creatingRef` holds the object being drag-drawn.
  const toolRef = React.useRef<Tool>('select')
  const colorRef = React.useRef('#ef4444')
  const shapeKindRef = React.useRef<ShapeKind>('rect')
  const activateToolRef = React.useRef<(t: Tool) => void>(() => {})
  const creatingRef = React.useRef<{
    obj: FabricObject
    sx: number
    sy: number
    kind: ShapeKind
  } | null>(null)

  const [ready, setReady] = React.useState(false)
  const [resetOpen, setResetOpen] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [tool, setTool] = React.useState<Tool>('select')
  const [shapeKind, setShapeKind] = React.useState<ShapeKind>('rect')
  const [adjust, setAdjust] = React.useState<Adjust>(NEUTRAL)
  const [preset, setPreset] = React.useState('original')
  // Per-preset preview thumbnails (data URLs), rebuilt when the base changes.
  const [thumbs, setThumbs] = React.useState<Record<string, string>>({})
  const [color, setColor] = React.useState('#ef4444')
  const [penWidth, setPenWidth] = React.useState(6)
  const [mosaicBlock, setMosaicBlock] = React.useState(12)
  const [mosaicWidth, setMosaicWidth] = React.useState(28)
  const [canUndo, setCanUndo] = React.useState(false)
  const [canRedo, setCanRedo] = React.useState(false)
  // Natural (source-pixel) dimensions of the base image, shown in the top bar.
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null)
  // `fitScale` is displayed-over-natural at zoom 1; `zoom` is the user multiplier.
  const [fitScale, setFitScale] = React.useState(1)
  const [zoom, setZoom] = React.useState(1)
  // Output dimensions (source pixels) for the Resize tool; applied on export.
  const [resize, setResize] = React.useState({
    width: 0,
    height: 0,
    lock: true,
  })
  // Crop overlay: a snapshot of the canvas shown under the image-crop primitive.
  const [cropSnapshot, setCropSnapshot] = React.useState<string | null>(null)
  const [crop, setCrop] = React.useState<Crop>()
  const [cropAspect, setCropAspect] = React.useState<number | undefined>(
    undefined,
  )
  // The active object's editable props, driving the inspector's Object section.
  // Null when nothing is selected (inspector then shows the Canvas section).
  const [sel, setSel] = React.useState<{
    kind: 'text' | 'shape' | 'other'
    showColor: boolean
    strokeWidth: number
    fontFamily: string
    fontSize: number
    bold: boolean
    italic: boolean
    align: (typeof ALIGNS)[number]
    opacity: number
  } | null>(null)
  const [layers, setLayers] = React.useState<Layer[]>([])

  // Keep the handler-facing mirrors current each render.
  toolRef.current = tool
  colorRef.current = color
  shapeKindRef.current = shapeKind

  // --- history -------------------------------------------------------------
  const syncHistoryFlags = React.useCallback(() => {
    const h = historyRef.current
    setCanUndo(h.index > 0)
    setCanRedo(h.index < h.stack.length - 1)
  }, [])

  /** Fit `img` to fill the stage (contain), size the canvas to it, set as bg. */
  const fitBackground = React.useCallback(
    (canvas: Canvas, img: FabricImage) => {
      const stage = stageRef.current
      const boxW = (stage?.clientWidth || MAX_W) - 16
      const boxH = (stage?.clientHeight || MAX_H) - 16
      const scale = Math.min(boxW / img.width, boxH / img.height)
      img.scale(scale)
      img.set({ left: 0, top: 0, originX: 'left', originY: 'top' })
      // Size the canvas to the *scaled* image so there is no empty margin.
      canvas.setDimensions({
        width: img.getScaledWidth(),
        height: img.getScaledHeight(),
      })
      canvas.backgroundImage = img
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]) // reset zoom/pan to fit
      canvas.calcOffset() // refresh cached element offset for pointer mapping
      canvas.requestRenderAll()
      const w = Math.round(img.width)
      const h = Math.round(img.height)
      dimsRef.current = { w, h }
      fitScaleRef.current = scale
      setDims({ w, h })
      setResize({ width: w, height: h, lock: true })
      setFitScale(scale)
      setZoom(1)
    },
    [],
  )

  // Build a preview thumbnail per preset from a downscaled copy of the base
  // image, so the Filters strip shows the real effect. Cheap: filters run on a
  // 160×120 canvas, not the full-res image.
  const regenThumbs = React.useCallback(
    (el: CanvasImageSource | undefined, natW: number, natH: number) => {
      const fabric = modRef.current
      if (!fabric || !el || !natW || !natH) return
      const base = document.createElement('canvas')
      base.width = THUMB_W
      base.height = THUMB_H
      const bctx = base.getContext('2d')
      if (!bctx) return
      // Cover-crop the source into the thumbnail box.
      const s = Math.max(THUMB_W / natW, THUMB_H / natH)
      const dw = natW * s
      const dh = natH * s
      bctx.drawImage(el, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh)
      const out: Record<string, string> = {}
      for (const p of PRESETS) {
        const fi = new fabric.FabricImage(base, {
          originX: 'left',
          originY: 'top',
        })
        const list = p.build(fabric.filters)
        if (list.length) {
          fi.filters = list
          fi.applyFilters()
        }
        const c = new fabric.StaticCanvas(document.createElement('canvas'), {
          width: THUMB_W,
          height: THUMB_H,
          enableRetinaScaling: false,
        })
        c.add(fi)
        c.renderAll()
        out[p.id] = c.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 })
        c.dispose()
      }
      setThumbs(out)
    },
    [],
  )

  const pushHistory = React.useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || restoringRef.current) return
    const h = historyRef.current
    const json = JSON.stringify(canvas.toJSON())
    const top = h.stack[h.index]
    if (
      top &&
      top.json === json &&
      top.width === canvas.width &&
      top.height === canvas.height
    )
      return
    const snap: Snapshot = {
      json,
      width: canvas.width,
      height: canvas.height,
      dims: dimsRef.current ?? {
        w: Math.round(canvas.width),
        h: Math.round(canvas.height),
      },
      fitScale: fitScaleRef.current,
    }
    h.stack = h.stack.slice(0, h.index + 1)
    h.stack.push(snap)
    h.index = h.stack.length - 1
    syncHistoryFlags()
  }, [syncHistoryFlags])

  const restore = (snap: Snapshot) => {
    const canvas = fabricRef.current
    if (!canvas) return
    restoringRef.current = true
    setSel(null)
    // The live mosaic layer is replaced by the deserialized image; drop the refs
    // so the next stroke rebuilds a fresh layer (and pixel source) on top.
    const m = mosaicRef.current
    m.layer = null
    m.layerCanvas = null
    m.pixSrc = null
    void canvas.loadFromJSON(snap.json).then(() => {
      // toJSON omits canvas size — restore it (and the derived state) so a
      // cropped frame round-trips with objects aligned.
      canvas.setDimensions({ width: snap.width, height: snap.height })
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
      dimsRef.current = snap.dims
      fitScaleRef.current = snap.fitScale
      setDims(snap.dims)
      setResize((r) => ({
        width: snap.dims.w,
        height: snap.dims.h,
        lock: r.lock,
      }))
      setFitScale(snap.fitScale)
      setZoom(1)
      canvas.requestRenderAll()
      restoringRef.current = false
      syncHistoryFlags()
      layersSyncRef.current()
    })
  }
  const undo = () => {
    const h = historyRef.current
    if (h.index <= 0) return
    h.index -= 1
    restore(h.stack[h.index])
  }
  const redo = () => {
    const h = historyRef.current
    if (h.index >= h.stack.length - 1) return
    h.index += 1
    restore(h.stack[h.index])
  }
  undoRef.current = undo
  redoRef.current = redo

  // --- zoom ----------------------------------------------------------------
  // Zoom via the canvas viewportTransform (like filerobot scales its stage), so
  // the image can be panned when zoomed in. The bitmap and pointer mapping are
  // handled by fabric, so drawing stays aligned at any zoom. `at` is the
  // viewport point to keep fixed (the pointer for wheel, center for buttons).
  const applyZoom = React.useCallback(
    (z: number, at?: { x: number; y: number }) => {
      const fabric = modRef.current
      const canvas = fabricRef.current
      if (!fabric || !canvas) return
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
      if (next <= 1) {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
      } else {
        const pt = at ?? { x: canvas.width / 2, y: canvas.height / 2 }
        canvas.zoomToPoint(new fabric.Point(pt.x, pt.y), next)
        clampViewport(canvas)
      }
      canvas.defaultCursor =
        next > 1 && !canvas.isDrawingMode && !mosaicRef.current.on
          ? 'grab'
          : mosaicRef.current.on
            ? 'crosshair'
            : 'default'
      // Drag is reserved for panning once zoomed in, so suppress rubber-band
      // selection (single-object click selection still works).
      canvas.selection = next <= 1 && !mosaicRef.current.on
      setZoom(next)
      selSyncRef.current() // keep the selection toolbar anchored
    },
    [],
  )
  const zoomBy = (factor: number) => applyZoom(zoom * factor)

  // Reset every edit back to the freshly-loaded original (history frame 0).
  const reset = () => {
    const h = historyRef.current
    if (h.index <= 0) return
    h.index = 0
    setAdjust(NEUTRAL)
    setPreset('original')
    applyZoom(1)
    restore(h.stack[0])
  }

  // --- mount ---------------------------------------------------------------
  React.useEffect(() => {
    let cancelled = false
    let canvas: Canvas | null = null
    let cleanupKeys: (() => void) | null = null

    void (async () => {
      const fabric = await import('fabric')
      if (cancelled || !canvasElRef.current) return
      modRef.current = fabric
      // Match object selection styling to the image-crop primitive: teal border
      // with round, white-bordered handles. Applies to every object created.
      fabric.InteractiveFabricObject.ownDefaults = {
        ...fabric.InteractiveFabricObject.ownDefaults,
        borderColor: '#2dd4bf',
        cornerColor: '#2dd4bf',
        cornerStrokeColor: '#ffffff',
        cornerStyle: 'circle',
        transparentCorners: false,
        cornerSize: 12,
        borderScaleFactor: 1.5,
      }
      // Persist user-given layer names: customProperties are serialized by
      // toObject (and restored by loadFromJSON), so names survive undo/redo.
      fabric.FabricObject.customProperties = ['layerName']
      canvas = new fabric.Canvas(canvasElRef.current, {
        backgroundColor: '#fff',
        enableRetinaScaling: false,
        preserveObjectStacking: true,
        selectionColor: 'rgba(45,212,191,0.15)',
        selectionBorderColor: '#2dd4bf',
        selectionLineWidth: 1.5,
      })
      fabricRef.current = canvas
      const cv = canvas

      const img = await fabric.FabricImage.fromURL(imageUrl, {
        crossOrigin: 'anonymous',
      })
      if (cancelled) return
      fitBackground(cv, img)
      regenThumbs(img.getElement(), img.width, img.height)

      // Any object mutation snapshots history — except the live mosaic layer,
      // whose add/paint is committed as a single frame on mouse:up.
      const onChange = (e?: { target?: FabricObject }) => {
        if (e?.target && e.target === mosaicRef.current.layer) return
        // A drag-created object commits a single frame on mouse:up, so suppress
        // the intermediate add / modify churn while it is being drawn.
        if (creatingRef.current) return
        pushHistory()
      }
      cv.on('object:added', onChange)
      cv.on('object:removed', onChange)
      cv.on('object:modified', onChange)
      cv.on('path:created', () => pushHistory())

      // Floating selection toolbar: anchor it to the active object's bounding
      // box (in stage px) and mirror the object's colour into the picker.
      const syncSelection = () => {
        const obj = cv.getActiveObject()
        if (!obj || mosaicRef.current.on) {
          setSel(null)
          return
        }
        const isText =
          obj instanceof fabric.IText ||
          obj instanceof fabric.Textbox ||
          obj instanceof fabric.FabricText
        const t = obj as {
          strokeWidth?: number
          stroke?: unknown
          fill?: unknown
          fontFamily?: string
          fontSize?: number
          fontWeight?: string | number
          fontStyle?: string
          textAlign?: string
          opacity?: number
        }
        const hasStroke =
          !isText && typeof t.strokeWidth === 'number' && !!t.stroke
        const align = ALIGNS.includes(t.textAlign as (typeof ALIGNS)[number])
          ? (t.textAlign as (typeof ALIGNS)[number])
          : 'left'
        setSel({
          kind: isText ? 'text' : hasStroke ? 'shape' : 'other',
          showColor: isText || hasStroke,
          strokeWidth: t.strokeWidth ?? 1,
          fontFamily: t.fontFamily ?? 'sans-serif',
          fontSize: Math.round(t.fontSize ?? 28),
          bold: t.fontWeight === 'bold' || Number(t.fontWeight) >= 700,
          italic: t.fontStyle === 'italic',
          align,
          opacity: t.opacity ?? 1,
        })
        const col = isText ? t.fill : t.stroke
        if (typeof col === 'string') setColor(col)
      }
      cv.on('selection:created', syncSelection)
      cv.on('selection:updated', syncSelection)
      cv.on('selection:cleared', () => setSel(null))
      cv.on('object:modified', syncSelection)
      selSyncRef.current = syncSelection

      // Layers panel: rebuild the top-first object list on any structural or
      // selection change.
      const idFor = (obj: FabricObject) => {
        let id = layerIdsRef.current.get(obj)
        if (!id) {
          id = `layer-${(layerSeqRef.current += 1)}`
          layerIdsRef.current.set(obj, id)
        }
        return id
      }
      const rebuildLayers = () => {
        const objs = cv.getObjects()
        const activeObj = cv.getActiveObject()
        const list: Layer[] = []
        for (let i = objs.length - 1; i >= 0; i -= 1) {
          const o = objs[i]
          const meta = layerMeta(o, fabric, mosaicRef.current.layer)
          const name = (o as FabricObject & { layerName?: string }).layerName
          list.push({
            id: idFor(o),
            label: name || meta.label,
            name,
            Icon: meta.Icon,
            visible: o.visible !== false,
            active: o === activeObj,
            obj: o,
          })
        }
        setLayers(list)
      }
      cv.on('object:added', rebuildLayers)
      cv.on('object:removed', rebuildLayers)
      cv.on('selection:created', rebuildLayers)
      cv.on('selection:updated', rebuildLayers)
      cv.on('selection:cleared', rebuildLayers)
      layersSyncRef.current = rebuildLayers
      rebuildLayers()

      // Mosaic brush — reveal a pixelated copy of the background through a round
      // brush onto a live layer. Source + layer are (re)built lazily on the
      // first stroke and after any history load / dimension change nulls them.
      const buildPixSrc = () => {
        const m = mosaicRef.current
        const bg = cv.backgroundImage as FabricImage | undefined
        const el = bg?.getElement() as CanvasImageSource | undefined
        if (!el) return
        const w = cv.width
        const h = cv.height
        const block = Math.max(2, m.block)
        const src = m.pixSrc ?? document.createElement('canvas')
        src.width = w
        src.height = h
        const sctx = src.getContext('2d')
        const tiny = document.createElement('canvas')
        tiny.width = Math.max(1, Math.round(w / block))
        tiny.height = Math.max(1, Math.round(h / block))
        const tctx = tiny.getContext('2d')
        if (!sctx || !tctx) return
        tctx.drawImage(el, 0, 0, tiny.width, tiny.height)
        sctx.imageSmoothingEnabled = false
        sctx.clearRect(0, 0, w, h)
        sctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, 0, 0, w, h)
        m.pixSrc = src
      }
      const ensureLayer = () => {
        const fabric = modRef.current
        const m = mosaicRef.current
        if (!fabric) return
        const lc = m.layerCanvas ?? document.createElement('canvas')
        lc.width = cv.width
        lc.height = cv.height
        m.layerCanvas = lc
        // originX/originY must be top-left: fabric v7 defaults them to center,
        // which would offset the painted layer by half the canvas.
        const layer = new fabric.FabricImage(lc, {
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
          selectable: false,
          evented: false,
        })
        m.layer = layer
        cv.add(layer)
      }
      const stamp = (pt: { x: number; y: number }) => {
        const m = mosaicRef.current
        if (!m.pixSrc) buildPixSrc()
        if (!m.layer) ensureLayer()
        const lc = m.layerCanvas
        const pix = m.pixSrc
        const layer = m.layer
        const ctx = lc?.getContext('2d')
        if (!lc || !pix || !layer || !ctx) return
        ctx.save()
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, m.width / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(pix, 0, 0)
        ctx.restore()
        layer.dirty = true
        cv.requestRenderAll()
      }
      cv.on('mouse:down', (opt) => {
        const m = mosaicRef.current
        if (!m.on || panRef.current.spaceHeld) return
        m.painting = true
        stamp(cv.getScenePoint(opt.e))
      })
      cv.on('mouse:move', (opt) => {
        const m = mosaicRef.current
        if (!m.on || !m.painting) return
        stamp(cv.getScenePoint(opt.e))
      })
      cv.on('mouse:up', () => {
        const m = mosaicRef.current
        if (!m.painting) return
        m.painting = false
        pushHistory()
      })

      // Tool-create: the Text tool drops a text box where you click; the Shape
      // tool drags rect / ellipse / arrow to size at the pointer. Both return to
      // Select afterwards. Gated on the active tool so they never fire under
      // Select / pan / brush tools. `creatingRef` suppresses history until up.
      cv.on('mouse:down', (opt) => {
        if (panRef.current.spaceHeld) return
        const t = toolRef.current
        if (t === 'text') {
          const p = cv.getScenePoint(opt.e)
          const it = new fabric.IText('Text', {
            left: p.x,
            top: p.y,
            originX: 'left',
            originY: 'top',
            fontFamily: 'sans-serif',
            fontSize: 28,
            fill: colorRef.current,
          })
          cv.add(it)
          cv.setActiveObject(it)
          it.enterEditing()
          it.selectAll()
          cv.requestRenderAll()
          activateToolRef.current('select')
          return
        }
        if (t !== 'shape') return
        const p = cv.getScenePoint(opt.e)
        const kind = shapeKindRef.current
        const c = colorRef.current
        let obj: FabricObject
        if (kind === 'rect') {
          obj = new fabric.Rect({
            left: p.x,
            top: p.y,
            width: 1,
            height: 1,
            fill: 'transparent',
            stroke: c,
            strokeWidth: 3,
            originX: 'left',
            originY: 'top',
          })
        } else if (kind === 'ellipse') {
          obj = new fabric.Ellipse({
            left: p.x,
            top: p.y,
            rx: 1,
            ry: 1,
            fill: 'transparent',
            stroke: c,
            strokeWidth: 3,
            originX: 'left',
            originY: 'top',
          })
        } else {
          obj = new fabric.Line([p.x, p.y, p.x, p.y], {
            stroke: c,
            strokeWidth: 4,
          })
        }
        creatingRef.current = { obj, sx: p.x, sy: p.y, kind }
        cv.add(obj)
      })
      cv.on('mouse:move', (opt) => {
        const cr = creatingRef.current
        if (!cr) return
        const p = cv.getScenePoint(opt.e)
        const w = p.x - cr.sx
        const h = p.y - cr.sy
        if (cr.kind === 'rect') {
          cr.obj.set({
            left: Math.min(cr.sx, p.x),
            top: Math.min(cr.sy, p.y),
            width: Math.abs(w),
            height: Math.abs(h),
          })
        } else if (cr.kind === 'ellipse') {
          cr.obj.set({
            left: Math.min(cr.sx, p.x),
            top: Math.min(cr.sy, p.y),
            rx: Math.abs(w) / 2,
            ry: Math.abs(h) / 2,
          })
        } else {
          cr.obj.set({ x2: p.x, y2: p.y })
        }
        cr.obj.setCoords()
        cv.requestRenderAll()
      })
      cv.on('mouse:up', (opt) => {
        const cr = creatingRef.current
        if (!cr) return
        const p = cv.getScenePoint(opt.e)
        const dx = p.x - cr.sx
        const dy = p.y - cr.sy
        const tiny = Math.abs(dx) < 6 && Math.abs(dy) < 6
        if (cr.kind === 'arrow') {
          // Replace the temp drag line with a grouped line + head (still under
          // the creating guard, so the remove/add pair commits no extra frame).
          cv.remove(cr.obj)
          const ex = tiny ? cr.sx + 90 : p.x
          const ey = tiny ? cr.sy : p.y
          const line = new fabric.Line([cr.sx, cr.sy, ex, ey], {
            stroke: colorRef.current,
            strokeWidth: 4,
          })
          const head = new fabric.Triangle({
            width: 18,
            height: 18,
            fill: colorRef.current,
            left: ex,
            top: ey,
            angle: (Math.atan2(ey - cr.sy, ex - cr.sx) * 180) / Math.PI + 90,
            originX: 'center',
            originY: 'center',
          })
          const grp = new fabric.Group([line, head])
          cv.add(grp)
          cv.setActiveObject(grp)
        } else {
          if (tiny) {
            if (cr.kind === 'rect') cr.obj.set({ width: 120, height: 80 })
            else cr.obj.set({ rx: 60, ry: 40 })
          }
          cr.obj.setCoords()
          cv.setActiveObject(cr.obj)
        }
        creatingRef.current = null
        cv.requestRenderAll()
        pushHistory()
        activateToolRef.current('select')
      })

      // Drag-to-pan when zoomed in: hold space anywhere, use the Hand tool, or
      // just drag empty canvas in non-creating tools. Object dragging (a hit
      // target) and the brushes keep their own drag.
      const shouldPan = (opt: { target?: FabricObject }) => {
        if (panRef.current.spaceHeld || toolRef.current === 'hand')
          return cv.getZoom() > 1
        if (cv.getZoom() <= 1) return false
        if (toolRef.current === 'text' || toolRef.current === 'shape')
          return false
        return !cv.isDrawingMode && !mosaicRef.current.on && !opt.target
      }
      cv.on('mouse:down', (opt) => {
        if (!shouldPan(opt)) return
        const p = cv.getViewportPoint(opt.e)
        panRef.current.panning = true
        panRef.current.lastX = p.x
        panRef.current.lastY = p.y
        cv.selection = false
        cv.setCursor('grabbing')
      })
      cv.on('mouse:move', (opt) => {
        if (!panRef.current.panning) return
        const p = cv.getViewportPoint(opt.e)
        cv.relativePan(
          new fabric.Point(
            p.x - panRef.current.lastX,
            p.y - panRef.current.lastY,
          ),
        )
        clampViewport(cv)
        panRef.current.lastX = p.x
        panRef.current.lastY = p.y
      })
      cv.on('mouse:up', () => {
        if (!panRef.current.panning) return
        panRef.current.panning = false
        cv.selection = !mosaicRef.current.on && cv.getZoom() <= 1
        cv.setCursor(cv.defaultCursor)
      })

      // Wheel zooms toward the pointer.
      cv.on('mouse:wheel', (opt) => {
        const e = opt.e
        e.preventDefault()
        e.stopPropagation()
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
        applyZoom(cv.getZoom() * factor, cv.getViewportPoint(e))
      })

      // Space toggles a pan grab (suppressing the pen while held).
      const isTyping = () => {
        const el = document.activeElement
        const tag = el?.tagName
        return (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          (cv.getActiveObject() as { isEditing?: boolean } | null)
            ?.isEditing === true
        )
      }
      const onKeyDown = (e: KeyboardEvent) => {
        // Editing shortcuts (suppressed while typing in a field / IText).
        if (!isTyping()) {
          const metaKey = e.metaKey || e.ctrlKey
          if (metaKey && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault()
            if (e.shiftKey) redoRef.current()
            else undoRef.current()
            return
          }
          if (metaKey && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault()
            redoRef.current()
            return
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
            const obj = cv.getActiveObject()
            if (!obj) return
            e.preventDefault()
            cv.remove(obj)
            cv.discardActiveObject()
            cv.requestRenderAll()
            return
          }
          if (!metaKey) {
            const tk = TOOLS.find((t) => t.hotkey === e.key.toLowerCase())
            if (tk) {
              e.preventDefault()
              activateToolRef.current(tk.value)
              return
            }
          }
        }
        if (e.code !== 'Space' || e.repeat || isTyping()) return
        if (cv.getZoom() <= 1) return
        e.preventDefault()
        const pan = panRef.current
        pan.spaceHeld = true
        pan.prevDrawing = cv.isDrawingMode
        cv.isDrawingMode = false
        cv.defaultCursor = 'grab'
        cv.setCursor('grab')
      }
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code !== 'Space') return
        const pan = panRef.current
        if (!pan.spaceHeld) return
        pan.spaceHeld = false
        cv.isDrawingMode = pan.prevDrawing
        cv.defaultCursor =
          cv.getZoom() > 1 && !cv.isDrawingMode && !mosaicRef.current.on
            ? 'grab'
            : mosaicRef.current.on
              ? 'crosshair'
              : 'default'
        cv.setCursor(cv.defaultCursor)
      }
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      cleanupKeys = () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
      }

      // Seed the initial snapshot.
      historyRef.current = {
        stack: [
          {
            json: JSON.stringify(cv.toJSON()),
            width: cv.width,
            height: cv.height,
            dims: dimsRef.current ?? {
              w: Math.round(cv.width),
              h: Math.round(cv.height),
            },
            fitScale: fitScaleRef.current,
          },
        ],
        index: 0,
      }
      syncHistoryFlags()
      setReady(true)
    })()

    return () => {
      cancelled = true
      cleanupKeys?.()
      canvas?.dispose()
      fabricRef.current = null
      modRef.current = null
      const m = mosaicRef.current
      m.layer = null
      m.layerCanvas = null
      m.pixSrc = null
      setReady(false)
    }
  }, [
    imageUrl,
    pushHistory,
    fitBackground,
    syncHistoryFlags,
    applyZoom,
    regenThumbs,
  ])

  // --- adjust / filters ----------------------------------------------------
  const applyBackgroundFilters = React.useCallback(
    (next: Adjust, nextPreset: string) => {
      const fabric = modRef.current
      const canvas = fabricRef.current
      const img = canvas?.backgroundImage as FabricImage | undefined
      if (!fabric || !canvas || !img) return
      const f = fabric.filters
      const def = PRESETS.find((p) => p.id === nextPreset)
      img.filters = [
        ...(def ? def.build(f) : []),
        new f.Brightness({ brightness: next.brightness }),
        new f.Contrast({ contrast: next.contrast }),
        new f.Saturation({ saturation: next.saturation }),
      ] as FabricImage['filters']
      img.applyFilters()
      canvas.requestRenderAll()
    },
    [],
  )

  const onAdjust = (key: keyof Adjust, value: number) => {
    const next = { ...adjust, [key]: value }
    setAdjust(next)
    applyBackgroundFilters(next, preset)
  }
  const onPreset = (id: string) => {
    setPreset(id)
    applyBackgroundFilters(adjust, id)
    pushHistory()
  }

  // --- annotate ------------------------------------------------------------
  const add = (obj: FabricObject) => {
    const canvas = fabricRef.current
    if (!canvas) return
    if (canvas.isDrawingMode) setDraw(false) // adding an object exits the pen
    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }
  const center = () => {
    const canvas = fabricRef.current
    return {
      left: (canvas?.width ?? MAX_W) / 2,
      top: (canvas?.height ?? MAX_H) / 2,
    }
  }
  const addOverlay = (file: File) => {
    const fabric = modRef.current
    const canvas = fabricRef.current
    if (!fabric || !canvas) return
    const url = URL.createObjectURL(file)
    void fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then(
      (img) => {
        URL.revokeObjectURL(url)
        const scale = Math.min(1, 220 / (img.width ?? 1))
        img.set({
          ...center(),
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
        })
        add(img)
      },
    )
  }
  const addWatermarkText = () => {
    const fabric = modRef.current
    if (!fabric) return
    add(
      new fabric.IText('Watermark', {
        ...center(),
        originX: 'center',
        originY: 'center',
        fontFamily: 'sans-serif',
        fontSize: 40,
        fontWeight: 600,
        fill: '#ffffff',
        opacity: 0.6,
        stroke: 'rgba(0,0,0,0.25)',
        strokeWidth: 1,
      }),
    )
  }
  // Set props on the active object, re-sync the toolbar, optionally commit a
  // history frame (discrete edits commit immediately; sliders commit on release).
  const setActiveProp = (patch: Record<string, unknown>, commit = true) => {
    const canvas = fabricRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    obj.set(patch)
    obj.setCoords()
    canvas.requestRenderAll()
    selSyncRef.current()
    if (commit) pushHistory()
  }
  const changeStrokeWidth = (w: number) =>
    setActiveProp({ strokeWidth: w }, false)
  const changeOpacity = (o: number) => setActiveProp({ opacity: o }, false)
  const changeFontSize = (n: number) =>
    setActiveProp({ fontSize: Math.max(1, Math.round(n || 0)) })
  const changeFontFamily = (f: string) => setActiveProp({ fontFamily: f })
  const toggleBold = () =>
    setActiveProp({ fontWeight: sel?.bold ? 'normal' : 'bold' })
  const toggleItalic = () =>
    setActiveProp({ fontStyle: sel?.italic ? 'normal' : 'italic' })
  const cycleAlign = () => {
    const next =
      ALIGNS[(ALIGNS.indexOf(sel?.align ?? 'left') + 1) % ALIGNS.length]
    setActiveProp({ textAlign: next })
  }

  // --- layers --------------------------------------------------------------
  const layerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )
  const selectLayer = (obj: FabricObject) => {
    const canvas = fabricRef.current
    if (!canvas || obj === mosaicRef.current.layer || obj.selectable === false)
      return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }
  const toggleLayerVisible = (obj: FabricObject) => {
    const canvas = fabricRef.current
    if (!canvas) return
    obj.visible = !obj.visible
    canvas.requestRenderAll()
    layersSyncRef.current()
    pushHistory()
  }
  const deleteLayer = (obj: FabricObject) => {
    const canvas = fabricRef.current
    if (!canvas) return
    if (canvas.getActiveObject() === obj) canvas.discardActiveObject()
    canvas.remove(obj) // fires object:removed → history + rebuild
    canvas.requestRenderAll()
  }
  const duplicateLayer = (obj: FabricObject) => {
    const canvas = fabricRef.current
    if (!canvas) return
    void obj.clone().then((c) => {
      c.set({ left: (c.left ?? 0) + 16, top: (c.top ?? 0) + 16 })
      canvas.add(c) // fires object:added → history + rebuild
      canvas.setActiveObject(c)
      canvas.requestRenderAll()
    })
  }
  const moveLayer = (obj: FabricObject, dir: 'forward' | 'back') => {
    const canvas = fabricRef.current
    if (!canvas) return
    if (dir === 'forward') canvas.bringObjectForward(obj)
    else canvas.sendObjectBackwards(obj)
    canvas.requestRenderAll()
    layersSyncRef.current()
    pushHistory()
  }
  const renameLayer = (obj: FabricObject, name: string) => {
    const trimmed = name.trim()
    const o = obj as FabricObject & { layerName?: string }
    if ((o.layerName ?? '') === trimmed) return
    // Empty name reverts to the type label.
    o.layerName = trimmed || undefined
    layersSyncRef.current()
    pushHistory()
  }
  // `layers` is top-first; fabric stacking is bottom-first.
  const reorderLayers = (e: DragEndEvent) => {
    const canvas = fabricRef.current
    if (!canvas || !e.over || e.active.id === e.over.id) return
    const from = layers.findIndex((l) => l.id === e.active.id)
    const to = layers.findIndex((l) => l.id === e.over?.id)
    if (from < 0 || to < 0) return
    canvas.moveObjectTo(layers[from].obj, canvas.getObjects().length - 1 - to)
    canvas.requestRenderAll()
    layersSyncRef.current()
    pushHistory()
  }

  // --- draw ----------------------------------------------------------------
  const setDraw = (on: boolean) => {
    const fabric = modRef.current
    const canvas = fabricRef.current
    if (!fabric || !canvas) return
    canvas.isDrawingMode = on
    if (on) {
      const brush = new fabric.PencilBrush(canvas)
      brush.color = color
      brush.width = penWidth
      canvas.freeDrawingBrush = brush
    }
  }
  // Color applies live: to the pen brush and to the selected object (text fill /
  // shape stroke), not only to objects created afterwards.
  const changeColor = (c: string) => {
    setColor(c)
    const fabric = modRef.current
    const canvas = fabricRef.current
    if (!fabric || !canvas) return
    if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = c
    const obj = canvas.getActiveObject()
    if (obj) {
      const isText =
        obj instanceof fabric.IText ||
        obj instanceof fabric.Textbox ||
        obj instanceof fabric.FabricText
      obj.set(isText ? 'fill' : 'stroke', c)
      canvas.requestRenderAll()
      pushHistory()
    }
  }

  // --- mosaic --------------------------------------------------------------
  // Toggle the mosaic brush. While on, drag over the image to pixelate; object
  // selection is suppressed so strokes don't grab annotations. The actual paint
  // happens in the canvas mouse handlers wired at mount.
  const toggleMosaic = (on: boolean) => {
    const canvas = fabricRef.current
    if (!canvas) return
    if (on) {
      setDraw(false)
      canvas.discardActiveObject()
      setSel(null)
    }
    mosaicRef.current.on = on
    canvas.isDrawingMode = false
    canvas.selection = !on && canvas.getZoom() <= 1
    canvas.skipTargetFind = on
    canvas.defaultCursor = on
      ? 'crosshair'
      : canvas.getZoom() > 1
        ? 'grab'
        : 'default'
  }

  // --- transform -----------------------------------------------------------
  const flip = (axis: 'x' | 'y') => {
    const canvas = fabricRef.current
    const img = canvas?.backgroundImage as FabricImage | undefined
    if (!canvas || !img) return
    if (axis === 'x') img.flipX = !img.flipX
    else img.flipY = !img.flipY
    canvas.requestRenderAll()
    pushHistory()
  }
  // Bake a 90° turn: redraw the base element rotated, swap canvas dims, refit.
  const rotate = (dir: 'cw' | 'ccw') => {
    const fabric = modRef.current
    const canvas = fabricRef.current
    const img = canvas?.backgroundImage as FabricImage | undefined
    const el = img?.getElement() as HTMLImageElement | undefined
    if (!fabric || !canvas || !img || !el) return
    const w = el.naturalWidth
    const h = el.naturalHeight
    const off = document.createElement('canvas')
    off.width = h
    off.height = w
    const ctx = off.getContext('2d')
    if (!ctx) return
    ctx.translate(h / 2, w / 2)
    ctx.rotate(((dir === 'cw' ? 1 : -1) * Math.PI) / 2)
    ctx.drawImage(el, -w / 2, -h / 2)
    void fabric.FabricImage.fromURL(off.toDataURL()).then((rotated) => {
      fitBackground(canvas, rotated)
      regenThumbs(rotated.getElement(), rotated.width, rotated.height)
      applyBackgroundFilters(adjust, preset)
      mosaicRef.current.pixSrc = null // canvas dims changed
      pushHistory()
    })
  }

  // --- crop ----------------------------------------------------------------
  // Reuse the ikui `image-crop` primitive: snapshot the canvas into an <img>,
  // overlay ImageCrop for the selection, then on apply re-frame the fabric
  // canvas to the chosen region (shift the bg + every object, resize).
  const seedCrop = (a: number | undefined, w: number, h: number): PercentCrop =>
    centerCrop(
      a
        ? makeAspectCrop({ unit: '%', width: 80 }, a, w, h)
        : { unit: '%', x: 0, y: 0, width: 80, height: 80 },
      w,
      h,
    )
  const enterCrop = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    applyZoom(1) // crop math runs in canvas coords
    canvas.discardActiveObject()
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    const url = canvas.toDataURL({ format: 'png', multiplier: 1 })
    canvas.requestRenderAll()
    setCropSnapshot(url)
    setCrop(seedCrop(cropAspect, canvas.width, canvas.height))
  }
  const exitCrop = () => {
    setCropSnapshot(null)
    setCrop(undefined)
  }
  const reseedCrop = (a: number | undefined) => {
    const canvas = fabricRef.current
    setCropAspect(a)
    if (canvas) setCrop(seedCrop(a, canvas.width, canvas.height))
  }
  const applyCrop = () => {
    const canvas = fabricRef.current
    if (!canvas || !crop) return
    const pc = convertToPixelCrop(crop, canvas.width, canvas.height)
    const left = Math.max(0, pc.x)
    const top = Math.max(0, pc.y)
    const cw = Math.min(canvas.width - left, pc.width)
    const ch = Math.min(canvas.height - top, pc.height)
    if (cw < 8 || ch < 8) return
    // Shift the background + every object so the crop's top-left becomes (0,0).
    const bg = canvas.backgroundImage as FabricImage | undefined
    if (bg) {
      bg.set({ left: (bg.left ?? 0) - left, top: (bg.top ?? 0) - top })
      bg.setCoords()
    }
    for (const o of canvas.getObjects()) {
      o.set({ left: (o.left ?? 0) - left, top: (o.top ?? 0) - top })
      o.setCoords()
    }
    canvas.setDimensions({ width: cw, height: ch })
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    mosaicRef.current.pixSrc = null
    const s = fitScale || 1
    const nw = Math.round(cw / s)
    const nh = Math.round(ch / s)
    dimsRef.current = { w: nw, h: nh }
    setDims({ w: nw, h: nh })
    setResize({ width: nw, height: nh, lock: true })
    setZoom(1)
    canvas.requestRenderAll()
    exitCrop()
    pushHistory()
  }

  // --- resize --------------------------------------------------------------
  const onResize = (dim: 'width' | 'height', value: number) => {
    const v = Math.max(1, Math.round(value || 0))
    setResize((r) => {
      if (!r.lock || !dims) return { ...r, [dim]: v }
      const aspect = dims.w / dims.h
      return dim === 'width'
        ? { ...r, width: v, height: Math.max(1, Math.round(v / aspect)) }
        : { ...r, height: v, width: Math.max(1, Math.round(v * aspect)) }
    })
  }

  // --- io ------------------------------------------------------------------
  const replaceImage = (file: File) => {
    const fabric = modRef.current
    const canvas = fabricRef.current
    if (!fabric || !canvas) return
    const url = URL.createObjectURL(file)
    void fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then(
      (img) => {
        URL.revokeObjectURL(url)
        canvas.remove(...canvas.getObjects())
        const m = mosaicRef.current
        m.layer = null
        m.layerCanvas = null
        m.pixSrc = null
        setAdjust(NEUTRAL)
        setPreset('original')
        fitBackground(canvas, img)
        regenThumbs(img.getElement(), img.width, img.height)
        historyRef.current = {
          stack: [
            {
              json: JSON.stringify(canvas.toJSON()),
              width: canvas.width,
              height: canvas.height,
              dims: dimsRef.current ?? {
                w: Math.round(canvas.width),
                h: Math.round(canvas.height),
              },
              fitScale: fitScaleRef.current,
            },
          ],
          index: 0,
        }
        syncHistoryFlags()
      },
    )
  }
  const exportAs = async (format: 'png' | 'jpeg') => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.discardActiveObject()
    // Render the whole image at full (source) resolution, ignoring zoom/pan.
    const vpt = [...canvas.viewportTransform] as typeof canvas.viewportTransform
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    const fullUrl = canvas.toDataURL({
      format,
      quality: 0.95,
      multiplier: dims ? dims.w / canvas.width : 1,
    })
    canvas.setViewportTransform(vpt)
    canvas.requestRenderAll()
    // Scale to the chosen output size (Resize tool).
    const tw = resize.width || dims?.w || canvas.width
    const th = resize.height || dims?.h || canvas.height
    const out = document.createElement('canvas')
    out.width = tw
    out.height = th
    const octx = out.getContext('2d')
    if (!octx) return
    const im = new Image()
    im.src = fullUrl
    await im.decode()
    octx.drawImage(im, 0, 0, tw, th)
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
    const url = out.toDataURL(mime, 0.95)
    const blob = await (await fetch(url)).blob()
    const ext = format === 'jpeg' ? 'jpg' : 'png'
    const file = new File([blob], `image-edited.${ext}`, { type: blob.type })
    onExport?.(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
  }

  // Stroke/fill color — only shown by Annotate (objects + pen).
  const colorPicker = (
    <label className="border-input flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
      <span className="text-muted-foreground">Color</span>
      <input
        type="color"
        value={color}
        onChange={(e) => changeColor(e.target.value)}
        className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
        aria-label="Stroke color"
      />
    </label>
  )
  // Switch the active tool: tear down the tool being left (pen / mosaic / crop),
  // then arm the one being entered (pointer mode + cursor). One home for every
  // mode transition (replaces the old per-tab side effects).
  const activateTool = (next: Tool) => {
    if (!next || next === tool) return
    const canvas = fabricRef.current
    if (tool === 'draw') setDraw(false)
    if (tool === 'redact') toggleMosaic(false)
    if (tool === 'crop' && cropSnapshot) exitCrop()
    setTool(next)
    if (!canvas) return
    if (next === 'draw') {
      setDraw(true)
      return
    }
    if (next === 'redact') {
      toggleMosaic(true)
      return
    }
    if (next === 'crop') {
      enterCrop()
      return
    }
    // select / text / shape / hand: configure the pointer directly. text + shape
    // suppress hit-testing so a press starts a create instead of grabbing an
    // existing object.
    canvas.isDrawingMode = false
    const create = next === 'text' || next === 'shape'
    if (create || next === 'hand') canvas.discardActiveObject()
    canvas.skipTargetFind = create
    canvas.selection = next === 'select' && canvas.getZoom() <= 1
    canvas.defaultCursor =
      next === 'text'
        ? 'text'
        : next === 'shape'
          ? 'crosshair'
          : next === 'hand'
            ? 'grab'
            : canvas.getZoom() > 1
              ? 'grab'
              : 'default'
    canvas.requestRenderAll()
  }
  activateToolRef.current = activateTool

  // Layers panel — top-first, drag to reorder (dnd-kit), select / hide / delete.
  const layersPanel = (
    <div className="flex h-full flex-col">
      <div className="text-muted-foreground flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium">
        <LayersIcon className="size-3.5" /> Layers
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {layers.length === 0 ? (
          <p className="text-muted-foreground px-1 py-2 text-xs">
            No layers yet — add text, shapes, or drawings.
          </p>
        ) : (
          <DndContext
            sensors={layerSensors}
            collisionDetection={closestCenter}
            onDragEnd={reorderLayers}
          >
            <SortableContext
              items={layers.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {layers.map((l) => (
                <LayerRow
                  key={l.id}
                  layer={l}
                  onSelect={() => selectLayer(l.obj)}
                  onToggleVisible={() => toggleLayerVisible(l.obj)}
                  onRename={(name) => renameLayer(l.obj, name)}
                  onDuplicate={() => duplicateLayer(l.obj)}
                  onForward={() => moveLayer(l.obj, 'forward')}
                  onBack={() => moveLayer(l.obj, 'back')}
                  onDelete={() => deleteLayer(l.obj)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )

  // Inspector — Object section (active object's props) shown when something is
  // selected; otherwise the Canvas section (whole-image filters / adjust /
  // transform). One home for object actions — no more duplicate entry points.
  const objectSection = sel && (
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-0 text-xs">
        {sel.kind === 'text'
          ? 'Text'
          : sel.kind === 'shape'
            ? 'Shape'
            : 'Object'}
      </FieldLegend>
      {sel.showColor && (
        <Field orientation="horizontal">
          <FieldLabel className={FIELD_LABEL}>Color</FieldLabel>
          <input
            type="color"
            value={color}
            onChange={(e) => changeColor(e.target.value)}
            className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
            aria-label="Color"
          />
        </Field>
      )}
      {sel.kind === 'text' && (
        <>
          <Field orientation="horizontal">
            <FieldLabel className={FIELD_LABEL}>Font</FieldLabel>
            <Select
              value={sel.fontFamily}
              onValueChange={(v) => changeFontFamily(v as string)}
            >
              <SelectTrigger
                size="sm"
                className="w-40"
                aria-label="Font family"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel className={FIELD_LABEL}>Size</FieldLabel>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={sel.fontSize || ''}
                onChange={(e) => changeFontSize(e.target.valueAsNumber)}
                className="border-input h-7 w-16 rounded-md border bg-transparent px-1.5 text-sm tabular-nums outline-none"
                aria-label="Font size"
              />
              <Button
                size="icon-sm"
                variant={sel.bold ? 'secondary' : 'ghost'}
                aria-label="Bold"
                title="Bold"
                onClick={toggleBold}
              >
                <Bold />
              </Button>
              <Button
                size="icon-sm"
                variant={sel.italic ? 'secondary' : 'ghost'}
                aria-label="Italic"
                title="Italic"
                onClick={toggleItalic}
              >
                <Italic />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Align ${sel.align}`}
                title={`Align: ${sel.align}`}
                onClick={cycleAlign}
              >
                {React.createElement(ALIGN_ICON[sel.align])}
              </Button>
            </div>
          </Field>
        </>
      )}
      {sel.kind === 'shape' && (
        <Field orientation="horizontal">
          <FieldLabel className={FIELD_LABEL}>Stroke</FieldLabel>
          <Slider
            value={[sel.strokeWidth]}
            min={1}
            max={40}
            onValueChange={(v) => changeStrokeWidth((v as number[])[0])}
            onValueCommitted={pushHistory}
            aria-label="Stroke width"
          />
        </Field>
      )}
      <Field orientation="horizontal">
        <FieldLabel className={FIELD_LABEL}>Opacity</FieldLabel>
        <Slider
          value={[Math.round(sel.opacity * 100)]}
          min={10}
          max={100}
          onValueChange={(v) => changeOpacity((v as number[])[0] / 100)}
          onValueCommitted={pushHistory}
          aria-label="Opacity"
        />
      </Field>
      <FieldDescription className="text-xs">
        Duplicate, reorder, and delete from the layer's ··· menu.
      </FieldDescription>
    </FieldSet>
  )

  const canvasSection = (
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-0 text-xs">
        Whole image
      </FieldLegend>
      <ToggleGroup
        value={[preset]}
        onValueChange={(v) => onPreset(v[0] ?? preset)}
        className="w-full flex-wrap gap-3 pb-1"
      >
        {PRESETS.map((p) => {
          const active = preset === p.id
          return (
            <ToggleGroupItem
              key={p.id}
              value={p.id}
              aria-label={p.label}
              className="h-auto shrink-0 flex-col gap-1.5 bg-transparent p-0 hover:bg-transparent aria-pressed:bg-transparent"
            >
              <span
                className={`block overflow-hidden rounded-md border-2 transition-colors ${
                  active
                    ? 'border-primary'
                    : 'border-transparent group-hover/toggle:border-border'
                }`}
              >
                <span
                  className="bg-muted block h-15 w-20 bg-cover bg-center"
                  style={
                    thumbs[p.id]
                      ? { backgroundImage: `url(${thumbs[p.id]})` }
                      : undefined
                  }
                />
              </span>
              <span
                className={`text-xs ${
                  active ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {p.label}
              </span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      {(['brightness', 'contrast', 'saturation'] as const).map((k) => (
        <Field key={k} orientation="horizontal">
          <FieldLabel className={cn(FIELD_LABEL, 'capitalize')}>{k}</FieldLabel>
          <Slider
            value={[Math.round(adjust[k] * 100)]}
            min={-100}
            max={100}
            onValueChange={(v) => onAdjust(k, (v as number[])[0] / 100)}
            onValueCommitted={pushHistory}
          />
        </Field>
      ))}
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Rotate left"
          title="Rotate left"
          onClick={() => rotate('ccw')}
        >
          <RotateCcw />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Rotate right"
          title="Rotate right"
          onClick={() => rotate('cw')}
        >
          <RotateCw />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Flip horizontal"
          title="Flip horizontal"
          onClick={() => flip('x')}
        >
          <FlipHorizontal2 />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Flip vertical"
          title="Flip vertical"
          onClick={() => flip('y')}
        >
          <FlipVertical2 />
        </Button>
      </div>
    </FieldSet>
  )

  const toolOptions = (() => {
    if (tool === 'text')
      return (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            Click on the image to place text.
          </p>
          <div className="flex items-center gap-2">
            {colorPicker}
            <Button size="sm" variant="outline" onClick={addWatermarkText}>
              <Stamp /> Watermark
            </Button>
          </div>
        </div>
      )
    if (tool === 'shape')
      return (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            Drag on the image to draw.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              value={[shapeKind]}
              onValueChange={(v) =>
                setShapeKind((v[0] as ShapeKind) ?? shapeKind)
              }
              variant="outline"
              size="sm"
            >
              {SHAPE_KINDS.map((s) => (
                <ToggleGroupItem
                  key={s.value}
                  value={s.value}
                  aria-label={s.label}
                >
                  <s.Icon /> {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {colorPicker}
          </div>
        </div>
      )
    if (tool === 'draw')
      return (
        <div className="flex flex-col gap-3">
          {colorPicker}
          <Field orientation="horizontal">
            <FieldLabel className={FIELD_LABEL}>Size</FieldLabel>
            <Slider
              value={[penWidth]}
              min={1}
              max={40}
              onValueChange={(v) => {
                const n = (v as number[])[0]
                setPenWidth(n)
                const c = fabricRef.current
                if (c?.freeDrawingBrush) c.freeDrawingBrush.width = n
              }}
            />
          </Field>
        </div>
      )
    if (tool === 'redact')
      return (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            Drag over the image to pixelate.
          </p>
          <Field orientation="horizontal">
            <FieldLabel className={FIELD_LABEL}>Size</FieldLabel>
            <Slider
              value={[mosaicWidth]}
              min={8}
              max={80}
              onValueChange={(v) => {
                const n = (v as number[])[0]
                setMosaicWidth(n)
                mosaicRef.current.width = n
              }}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel className={FIELD_LABEL}>Block</FieldLabel>
            <Slider
              value={[mosaicBlock]}
              min={4}
              max={40}
              onValueChange={(v) => {
                const n = (v as number[])[0]
                setMosaicBlock(n)
                mosaicRef.current.block = n
                mosaicRef.current.pixSrc = null
              }}
            />
          </Field>
        </div>
      )
    if (tool === 'crop')
      return cropSnapshot ? (
        <div className="flex flex-col gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            className="flex-wrap"
            value={[
              CROP_ASPECTS.find((a) => a.value === cropAspect)?.label ?? 'Free',
            ]}
            onValueChange={(v) => {
              const found = CROP_ASPECTS.find((a) => a.label === v[0])
              if (found) reseedCrop(found.value)
            }}
          >
            {CROP_ASPECTS.map((a) => (
              <ToggleGroupItem key={a.label} value={a.label}>
                {a.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => activateTool('select')}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                applyCrop()
                activateTool('select')
              }}
            >
              <Check /> Apply
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={enterCrop}>
          <CropIcon /> Start crop
        </Button>
      )
    return null
  })()

  const inspector = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-2">
      {toolOptions}
      {sel
        ? objectSection
        : tool === 'select' || tool === 'hand'
          ? canvasSection
          : null}
    </div>
  )

  return (
    <Card className="w-full">
      <CardContent className="pt-(--card-spacing)">
        {/* Left tool rail + right stage. */}
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Left: pointer tools as a vertical toggle rail (single-select). */}
          <ToggleGroup
            value={[tool]}
            onValueChange={(v) => activateTool((v[0] as Tool) ?? tool)}
            orientation="vertical"
            variant="outline"
            className="w-full shrink-0 sm:w-28"
          >
            {TOOLS.map((t) => (
              <ToggleGroupItem
                key={t.value}
                value={t.value}
                aria-label={t.label}
                title={`${t.label} (${t.hotkey.toUpperCase()})`}
                className="h-auto flex-1 flex-col justify-center gap-1.5 py-2.5 text-xs aria-pressed:font-medium sm:flex-none [&_svg:not([class*='size-'])]:size-5"
              >
                <t.Icon />
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Right: top bar (dims/zoom + history), the contextual inspector,
              then the canvas stage. */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* Top bar: image dimensions + zoom on the left, history actions
                (reset / undo / redo) on the right. */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-muted-foreground flex items-center gap-1 text-sm">
                <span className="tabular-nums">
                  {dims ? `${dims.w} × ${dims.h} px` : '—'}
                </span>
                <span className="bg-border mx-1 h-4 w-px" />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Zoom out"
                  disabled={!ready || zoom <= ZOOM_MIN}
                  onClick={() => zoomBy(1 / ZOOM_STEP)}
                >
                  <Minus />
                </Button>
                <span className="text-foreground w-12 text-center tabular-nums">
                  {Math.round(fitScale * zoom * 100)}%
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Zoom in"
                  disabled={!ready || zoom >= ZOOM_MAX}
                  onClick={() => zoomBy(ZOOM_STEP)}
                >
                  <Plus />
                </Button>
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Reset"
                  title="Reset"
                  disabled={!canUndo}
                  onClick={() => setResetOpen(true)}
                >
                  <History />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Undo"
                  disabled={!canUndo}
                  onClick={undo}
                >
                  <Undo2 />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Redo"
                  disabled={!canRedo}
                  onClick={redo}
                >
                  <Redo2 />
                </Button>
              </div>
            </div>

            {/* Work area: canvas | resizable right panel (options + layers). */}
            <ResizablePanelGroup
              orientation="horizontal"
              className="h-[420px] overflow-hidden rounded-lg border"
            >
              <ResizablePanel
                defaultSize="62%"
                minSize="45%"
                className="min-w-0"
              >
                {/* Canvas stage — the image fills it (contain). */}
                <div
                  ref={stageRef}
                  className="bg-muted/40 relative flex h-full items-center justify-center overflow-hidden p-2"
                >
                  <canvas
                    ref={canvasElRef}
                    className="block rounded shadow-sm"
                  />
                  {/* Crop overlay — the image-crop primitive over a canvas snapshot. */}
                  {cropSnapshot && (
                    <div className="absolute inset-0 flex items-center justify-center p-2">
                      <ImageCrop
                        crop={crop}
                        aspect={cropAspect}
                        ruleOfThirds
                        minWidth={20}
                        minHeight={20}
                        onChange={(_pixel, percent) => setCrop(percent)}
                        className="max-h-full"
                      >
                        {/* biome-ignore lint/performance/noImgElement: registry component, no next/image */}
                        <img
                          src={cropSnapshot}
                          alt="Crop source"
                          className="max-h-[404px] rounded"
                        />
                      </ImageCrop>
                    </div>
                  )}
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                defaultSize="38%"
                minSize="26%"
                maxSize="55%"
                className="min-w-0"
              >
                <ResizablePanelGroup orientation="vertical">
                  <ResizablePanel
                    defaultSize="48%"
                    minSize="20%"
                    className="min-h-0"
                  >
                    {inspector}
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    defaultSize="52%"
                    minSize="20%"
                    className="min-h-0"
                  >
                    {layersPanel}
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button render={<label />} nativeButton={false} variant="outline">
          <Upload /> Load
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) replaceImage(f)
              e.target.value = ''
            }}
          />
        </Button>
        <Button render={<label />} nativeButton={false} variant="outline">
          <ImageUp /> Image
          <input
            ref={overlayInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) addOverlay(f)
              e.target.value = ''
            }}
          />
        </Button>
        {/* Export — output size (the former Resize tool) folds into this popover. */}
        <Popover open={exportOpen} onOpenChange={setExportOpen}>
          <PopoverTrigger
            render={
              <Button className="ml-auto" disabled={!ready}>
                <Download /> Export
              </Button>
            }
            nativeButton={false}
          />
          <PopoverContent side="top" className="w-64">
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium">Export</div>
              <div className="flex items-center gap-2">
                <label className="border-input flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                  <span className="text-muted-foreground text-xs">W</span>
                  <input
                    type="number"
                    min={1}
                    value={resize.width || ''}
                    onChange={(e) => onResize('width', e.target.valueAsNumber)}
                    className="w-14 bg-transparent tabular-nums outline-none"
                    aria-label="Output width"
                  />
                </label>
                <label className="border-input flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                  <span className="text-muted-foreground text-xs">H</span>
                  <input
                    type="number"
                    min={1}
                    value={resize.height || ''}
                    onChange={(e) => onResize('height', e.target.valueAsNumber)}
                    className="w-14 bg-transparent tabular-nums outline-none"
                    aria-label="Output height"
                  />
                </label>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Lock aspect ratio"
                  title="Lock aspect ratio"
                  onClick={() => setResize((r) => ({ ...r, lock: !r.lock }))}
                >
                  {resize.lock ? <Lock /> : <LockOpen />}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!ready}
                  onClick={() => {
                    void exportAs('jpeg')
                    setExportOpen(false)
                  }}
                >
                  <Code2 /> JPEG
                </Button>
                <Button
                  className="flex-1"
                  disabled={!ready}
                  onClick={() => {
                    void exportAs('png')
                    setExportOpen(false)
                  }}
                >
                  <Download /> PNG
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </CardFooter>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all edits?</AlertDialogTitle>
            <AlertDialogDescription>
              This reverts the image to the original and discards every edit.
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset()
                setResetOpen(false)
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export default ImageEditor
