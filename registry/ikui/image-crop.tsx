'use client'

import { cn } from 'cn'
import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from 'react'
import { useEffect, useId, useRef, useState } from 'react'

export type Ords = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'se' | 'sw'

export interface Crop {
  x: number
  y: number
  width: number
  height: number
  unit: 'px' | '%'
}

export interface PixelCrop extends Crop {
  unit: 'px'
}

export interface PercentCrop extends Crop {
  unit: '%'
}

const defaultCrop: PixelCrop = { x: 0, y: 0, width: 0, height: 0, unit: 'px' }

const NUDGE_STEP = 1
const NUDGE_STEP_MEDIUM = 10
const NUDGE_STEP_LARGE = 100

// ---------------------------------------------------------------------------
// Geometry helpers (pure). Ported from react-image-crop — battle-tested math.
// ---------------------------------------------------------------------------

const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max)

const areCropsEqual = (a: Partial<Crop>, b: Partial<Crop>) =>
  a === b ||
  (a.width === b.width &&
    a.height === b.height &&
    a.x === b.x &&
    a.y === b.y &&
    a.unit === b.unit)

export function convertToPercentCrop(
  crop: Partial<Crop>,
  containerWidth: number,
  containerHeight: number,
): PercentCrop {
  if (crop.unit === '%') {
    return { ...defaultCrop, ...crop, unit: '%' }
  }

  return {
    unit: '%',
    x: crop.x ? (crop.x / containerWidth) * 100 : 0,
    y: crop.y ? (crop.y / containerHeight) * 100 : 0,
    width: crop.width ? (crop.width / containerWidth) * 100 : 0,
    height: crop.height ? (crop.height / containerHeight) * 100 : 0,
  }
}

export function convertToPixelCrop(
  crop: Partial<Crop>,
  containerWidth: number,
  containerHeight: number,
): PixelCrop {
  if (!crop.unit || crop.unit === 'px') {
    return { ...defaultCrop, ...crop, unit: 'px' }
  }

  return {
    unit: 'px',
    x: crop.x ? (crop.x * containerWidth) / 100 : 0,
    y: crop.y ? (crop.y * containerHeight) / 100 : 0,
    width: crop.width ? (crop.width * containerWidth) / 100 : 0,
    height: crop.height ? (crop.height * containerHeight) / 100 : 0,
  }
}

export function makeAspectCrop(
  crop: Pick<PercentCrop, 'unit'> & Partial<Omit<PercentCrop, 'unit'>>,
  aspect: number,
  containerWidth: number,
  containerHeight: number,
): PercentCrop
export function makeAspectCrop(
  crop: Pick<PixelCrop, 'unit'> & Partial<Omit<PixelCrop, 'unit'>>,
  aspect: number,
  containerWidth: number,
  containerHeight: number,
): PixelCrop
export function makeAspectCrop(
  crop: Partial<Crop>,
  aspect: number,
  containerWidth: number,
  containerHeight: number,
) {
  const pixelCrop = convertToPixelCrop(crop, containerWidth, containerHeight)

  if (crop.width) {
    pixelCrop.height = pixelCrop.width / aspect
  }

  if (crop.height) {
    pixelCrop.width = pixelCrop.height * aspect
  }

  if (pixelCrop.y + pixelCrop.height > containerHeight) {
    pixelCrop.height = containerHeight - pixelCrop.y
    pixelCrop.width = pixelCrop.height * aspect
  }

  if (pixelCrop.x + pixelCrop.width > containerWidth) {
    pixelCrop.width = containerWidth - pixelCrop.x
    pixelCrop.height = pixelCrop.width / aspect
  }

  return crop.unit === '%'
    ? convertToPercentCrop(pixelCrop, containerWidth, containerHeight)
    : pixelCrop
}

export function centerCrop(
  crop: Pick<PercentCrop, 'unit'> & Partial<Omit<PercentCrop, 'unit'>>,
  containerWidth: number,
  containerHeight: number,
): PercentCrop
export function centerCrop(
  crop: Pick<PixelCrop, 'unit'> & Partial<Omit<PixelCrop, 'unit'>>,
  containerWidth: number,
  containerHeight: number,
): PixelCrop
export function centerCrop(
  crop: Partial<Crop>,
  containerWidth: number,
  containerHeight: number,
) {
  const pixelCrop = convertToPixelCrop(crop, containerWidth, containerHeight)

  pixelCrop.x = (containerWidth - pixelCrop.width) / 2
  pixelCrop.y = (containerHeight - pixelCrop.height) / 2

  return crop.unit === '%'
    ? convertToPercentCrop(pixelCrop, containerWidth, containerHeight)
    : pixelCrop
}

function containCrop(
  pixelCrop: PixelCrop,
  aspect: number,
  ord: Ords,
  containerWidth: number,
  containerHeight: number,
  minWidth = 0,
  minHeight = 0,
  maxWidth = containerWidth,
  maxHeight = containerHeight,
): PixelCrop {
  const next = { ...pixelCrop }
  let minW = Math.min(minWidth, containerWidth)
  let minH = Math.min(minHeight, containerHeight)
  let maxW = Math.min(maxWidth, containerWidth)
  let maxH = Math.min(maxHeight, containerHeight)

  if (aspect) {
    if (aspect > 1) {
      // Landscape — drive off width.
      minW = minHeight ? minHeight * aspect : minW
      minH = minW / aspect
      maxW = maxWidth * aspect
    } else {
      // Portrait — drive off height.
      minH = minWidth ? minWidth / aspect : minH
      minW = minH * aspect
      maxH = maxHeight / aspect
    }
  }

  // Stop underflow on top / left.
  if (next.y < 0) {
    next.height = Math.max(next.height + next.y, minH)
    next.y = 0
  }
  if (next.x < 0) {
    next.width = Math.max(next.width + next.x, minW)
    next.x = 0
  }

  // Stop overflow on right / bottom.
  const xOverflow = containerWidth - (next.x + next.width)
  if (xOverflow < 0) {
    next.x = Math.min(next.x, containerWidth - minW)
    next.width += xOverflow
  }
  const yOverflow = containerHeight - (next.y + next.height)
  if (yOverflow < 0) {
    next.y = Math.min(next.y, containerHeight - minH)
    next.height += yOverflow
  }

  // Respect min / max, anchoring the opposite edge when the dragged edge hits a limit.
  if (next.width < minW) {
    if (ord === 'sw' || ord === 'nw') next.x -= minW - next.width
    next.width = minW
  }
  if (next.height < minH) {
    if (ord === 'nw' || ord === 'ne') next.y -= minH - next.height
    next.height = minH
  }
  if (next.width > maxW) {
    if (ord === 'sw' || ord === 'nw') next.x -= maxW - next.width
    next.width = maxW
  }
  if (next.height > maxH) {
    if (ord === 'nw' || ord === 'ne') next.y -= maxH - next.height
    next.height = maxH
  }

  // Re-apply aspect after the size fixes above.
  if (aspect) {
    const currAspect = next.width / next.height
    if (currAspect < aspect) {
      const newHeight = Math.max(next.width / aspect, minH)
      if (ord === 'nw' || ord === 'ne') next.y -= newHeight - next.height
      next.height = newHeight
    } else if (currAspect > aspect) {
      const newWidth = Math.max(next.height * aspect, minW)
      if (ord === 'sw' || ord === 'nw') next.x -= newWidth - next.width
      next.width = newWidth
    }
  }

  return next
}

function nudgeCrop(
  pixelCrop: PixelCrop,
  key: string,
  offset: number,
  ord: Ords,
): PixelCrop {
  const next = { ...pixelCrop }

  if (key === 'ArrowLeft') {
    if (ord === 'nw') {
      next.x -= offset
      next.y -= offset
      next.width += offset
      next.height += offset
    } else if (ord === 'w') {
      next.x -= offset
      next.width += offset
    } else if (ord === 'sw') {
      next.x -= offset
      next.width += offset
      next.height += offset
    } else if (ord === 'ne') {
      next.y += offset
      next.width -= offset
      next.height -= offset
    } else if (ord === 'e') {
      next.width -= offset
    } else if (ord === 'se') {
      next.width -= offset
      next.height -= offset
    }
  } else if (key === 'ArrowRight') {
    if (ord === 'nw') {
      next.x += offset
      next.y += offset
      next.width -= offset
      next.height -= offset
    } else if (ord === 'w') {
      next.x += offset
      next.width -= offset
    } else if (ord === 'sw') {
      next.x += offset
      next.width -= offset
      next.height -= offset
    } else if (ord === 'ne') {
      next.y -= offset
      next.width += offset
      next.height += offset
    } else if (ord === 'e') {
      next.width += offset
    } else if (ord === 'se') {
      next.width += offset
      next.height += offset
    }
  } else if (key === 'ArrowUp') {
    if (ord === 'nw') {
      next.x -= offset
      next.y -= offset
      next.width += offset
      next.height += offset
    } else if (ord === 'n') {
      next.y -= offset
      next.height += offset
    } else if (ord === 'ne') {
      next.y -= offset
      next.width += offset
      next.height += offset
    } else if (ord === 'sw') {
      next.x += offset
      next.width -= offset
      next.height -= offset
    } else if (ord === 's') {
      next.height -= offset
    } else if (ord === 'se') {
      next.width -= offset
      next.height -= offset
    }
  } else if (key === 'ArrowDown') {
    if (ord === 'nw') {
      next.x += offset
      next.y += offset
      next.width -= offset
      next.height -= offset
    } else if (ord === 'n') {
      next.y += offset
      next.height -= offset
    } else if (ord === 'ne') {
      next.y += offset
      next.width -= offset
      next.height -= offset
    } else if (ord === 'sw') {
      next.x -= offset
      next.width += offset
      next.height += offset
    } else if (ord === 's') {
      next.height += offset
    } else if (ord === 'se') {
      next.width += offset
      next.height += offset
    }
  }

  return next
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface DragData {
  startClientX: number
  startClientY: number
  startCropX: number
  startCropY: number
  clientX: number
  clientY: number
  isResize: boolean
  ord?: Ords
}

export interface ImageCropState {
  cropIsActive: boolean
  newCropIsBeingDrawn: boolean
}

export interface ImageCropProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    | 'onChange'
    | 'onDragStart'
    | 'onDragEnd'
    | 'tabIndex'
    | 'onPointerMove'
    | 'onPointerUp'
    | 'onPointerCancel'
  > {
  /** The element to crop, e.g. an `<img>` or `<video>`. */
  children?: ReactNode
  /** The current crop. Omit entirely for no crop. This is a controlled value:
   *  set it from `onChange` and pass it back in. */
  crop?: Crop
  /** The aspect ratio of the crop, e.g. `1` (square) or `16 / 9` (landscape). */
  aspect?: number
  /** Render the crop area as a circle (warps to an oval if `aspect` is not 1). */
  circularCrop?: boolean
  /** Disable all interaction. */
  disabled?: boolean
  /** Prevent creating or resizing a crop, but still allow dragging it around. */
  locked?: boolean
  /** Prevent the crop from being cleared when clicking outside it. */
  keepSelection?: boolean
  /** Minimum crop width, in pixels. */
  minWidth?: number
  /** Minimum crop height, in pixels. */
  minHeight?: number
  /** Maximum crop width, in pixels. */
  maxWidth?: number
  /** Maximum crop height, in pixels. */
  maxHeight?: number
  /** Show rule-of-thirds guide lines inside the crop. */
  ruleOfThirds?: boolean
  /** Fired on every crop change. Set the crop to state and pass it back. */
  onChange: (crop: PixelCrop, percentCrop: PercentCrop) => void
  /** Fired after a resize, drag, or keyboard nudge completes. */
  onComplete?: (crop: PixelCrop, percentCrop: PercentCrop) => void
  /** Fired when the user starts dragging or resizing. */
  onDragStart?: (e: PointerEvent<HTMLDivElement>) => void
  /** Fired when the user releases after dragging or resizing. */
  onDragEnd?: (e: PointerEvent<HTMLDivElement>) => void
  /** Render a custom element inside the crop selection. */
  renderSelectionAddon?: (state: ImageCropState) => ReactNode
  className?: string
  style?: CSSProperties
  /** Classes merged onto the crop selection box — override the border, etc. */
  selectionClassName?: string
  /** Classes merged onto each resize handle — override the size, color, etc. */
  handleClassName?: string
}

const HANDLE_CLASSES: Record<Ords, string> = {
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-n-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-e-resize',
  s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-s-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-w-resize',
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-se-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize',
}

const BAR_CLASSES: Record<'n' | 'e' | 's' | 'w', string> = {
  n: 'left-0 top-0 h-1.5 w-full -translate-y-1/2 cursor-n-resize',
  e: 'right-0 top-0 h-full w-1.5 translate-x-1/2 cursor-e-resize',
  s: 'bottom-0 left-0 h-1.5 w-full translate-y-1/2 cursor-s-resize',
  w: 'left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-w-resize',
}

const ORD_LABEL: Record<Ords, string> = {
  n: 'north',
  e: 'east',
  s: 'south',
  w: 'west',
  nw: 'north-west',
  ne: 'north-east',
  se: 'south-east',
  sw: 'south-west',
}

const CORNER_ORDS = ['nw', 'ne', 'se', 'sw'] as const
const EDGE_ORDS = ['n', 'e', 's', 'w'] as const
const xOrds: Ords[] = ['e', 'w']
const yOrds: Ords[] = ['n', 's']
const xyOrds: Ords[] = ['nw', 'ne', 'se', 'sw']

export function ImageCrop(props: ImageCropProps) {
  const {
    children,
    crop,
    aspect = 0,
    circularCrop,
    disabled,
    locked,
    keepSelection,
    minWidth = 0,
    minHeight = 0,
    maxWidth,
    maxHeight,
    ruleOfThirds,
    onChange,
    onComplete,
    onDragStart,
    onDragEnd,
    renderSelectionAddon,
    className,
    style,
    selectionClassName,
    handleClassName,
    ...rest
  } = props

  const componentRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<HTMLDivElement>(null)
  const maskId = useId()

  const dragData = useRef<DragData>({
    startClientX: 0,
    startClientY: 0,
    startCropX: 0,
    startCropY: 0,
    clientX: 0,
    clientY: 0,
    isResize: true,
  })
  const mouseDownOnCrop = useRef(false)
  const dragStarted = useRef(false)
  const pointerId = useRef<number | null>(null)

  const [cropIsActive, setCropIsActive] = useState(false)
  const [newCropIsBeingDrawn, setNewCropIsBeingDrawn] = useState(false)

  // Fire onComplete once when a crop is set programmatically (no crop -> crop),
  // so a preview can render without any user interaction.
  const prevCrop = useRef(crop)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire onComplete only on the no-crop -> crop transition
  useEffect(() => {
    if (onComplete && !prevCrop.current && crop) {
      const box = getBox()
      if (box.width && box.height) {
        onComplete(
          convertToPixelCrop(crop, box.width, box.height),
          convertToPercentCrop(crop, box.width, box.height),
        )
      }
    }
    prevCrop.current = crop
  }, [crop])

  function getBox(): Rect {
    const el = mediaRef.current
    if (!el) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
    const { x, y, width, height } = el.getBoundingClientRect()
    return { x, y, width, height }
  }

  function makePixelCrop(box: Rect) {
    return convertToPixelCrop(
      { ...defaultCrop, ...(crop ?? {}) },
      box.width,
      box.height,
    )
  }

  function capture(e: PointerEvent<HTMLDivElement>) {
    componentRef.current?.setPointerCapture(e.pointerId)
    pointerId.current = e.pointerId
  }

  function release() {
    const id = pointerId.current
    if (id !== null && componentRef.current?.hasPointerCapture(id)) {
      componentRef.current.releasePointerCapture(id)
    }
    pointerId.current = null
  }

  function onCropPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || !crop) {
      return
    }
    const box = getBox()
    const pixelCrop = convertToPixelCrop(crop, box.width, box.height)

    if (e.cancelable) e.preventDefault()
    capture(e)
    selectionRef.current?.focus({ preventScroll: true })

    const ord = (e.target as HTMLElement).dataset.ord as Ords | undefined
    const isResize = Boolean(ord)
    let startClientX = e.clientX
    let startClientY = e.clientY
    let startCropX = pixelCrop.x
    let startCropY = pixelCrop.y

    // Anchor the drag to the opposite corner of the one being resized.
    if (ord) {
      const relativeX = e.clientX - box.x
      const relativeY = e.clientY - box.y
      let fromCornerX = 0
      let fromCornerY = 0

      if (ord === 'ne' || ord === 'e') {
        fromCornerX = relativeX - (pixelCrop.x + pixelCrop.width)
        fromCornerY = relativeY - pixelCrop.y
        startCropX = pixelCrop.x
        startCropY = pixelCrop.y + pixelCrop.height
      } else if (ord === 'se' || ord === 's') {
        fromCornerX = relativeX - (pixelCrop.x + pixelCrop.width)
        fromCornerY = relativeY - (pixelCrop.y + pixelCrop.height)
        startCropX = pixelCrop.x
        startCropY = pixelCrop.y
      } else if (ord === 'sw' || ord === 'w') {
        fromCornerX = relativeX - pixelCrop.x
        fromCornerY = relativeY - (pixelCrop.y + pixelCrop.height)
        startCropX = pixelCrop.x + pixelCrop.width
        startCropY = pixelCrop.y
      } else if (ord === 'nw' || ord === 'n') {
        fromCornerX = relativeX - pixelCrop.x
        fromCornerY = relativeY - pixelCrop.y
        startCropX = pixelCrop.x + pixelCrop.width
        startCropY = pixelCrop.y + pixelCrop.height
      }

      startClientX = startCropX + box.x + fromCornerX
      startClientY = startCropY + box.y + fromCornerY
    }

    dragData.current = {
      startClientX,
      startClientY,
      startCropX,
      startCropY,
      clientX: e.clientX,
      clientY: e.clientY,
      isResize,
      ord,
    }
    mouseDownOnCrop.current = true
    setCropIsActive(true)
  }

  function onMediaPointerDown(e: PointerEvent<HTMLDivElement>) {
    const box = getBox()
    if (disabled || locked || (keepSelection && crop)) {
      return
    }

    if (e.cancelable) e.preventDefault()
    capture(e)
    componentRef.current?.focus({ preventScroll: true })

    const cropX = e.clientX - box.x
    const cropY = e.clientY - box.y
    const nextCrop: PixelCrop = {
      unit: 'px',
      x: cropX,
      y: cropY,
      width: 0,
      height: 0,
    }

    dragData.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCropX: cropX,
      startCropY: cropY,
      clientX: e.clientX,
      clientY: e.clientY,
      isResize: true,
    }
    mouseDownOnCrop.current = true

    onChange(
      convertToPixelCrop(nextCrop, box.width, box.height),
      convertToPercentCrop(nextCrop, box.width, box.height),
    )
    setCropIsActive(true)
    setNewCropIsBeingDrawn(true)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (
      disabled ||
      !crop ||
      !mouseDownOnCrop.current ||
      e.pointerId !== pointerId.current
    ) {
      return
    }
    if (e.cancelable) e.preventDefault()

    if (!dragStarted.current) {
      dragStarted.current = true
      onDragStart?.(e)
    }

    const data = dragData.current
    data.clientX = e.clientX
    data.clientY = e.clientY

    const box = getBox()
    const nextCrop = data.isResize ? resizeCrop(box) : dragCrop(box)

    if (!areCropsEqual(crop, nextCrop)) {
      onChange(
        convertToPixelCrop(nextCrop, box.width, box.height),
        convertToPercentCrop(nextCrop, box.width, box.height),
      )
    }
  }

  function onPointerDone(e: PointerEvent<HTMLDivElement>) {
    release()
    if (disabled || !crop || !mouseDownOnCrop.current) {
      return
    }
    mouseDownOnCrop.current = false
    dragStarted.current = false

    onDragEnd?.(e)
    const box = getBox()
    onComplete?.(
      convertToPixelCrop(crop, box.width, box.height),
      convertToPercentCrop(crop, box.width, box.height),
    )
    setCropIsActive(false)
    setNewCropIsBeingDrawn(false)
  }

  function dragCrop(box: Rect) {
    const data = dragData.current
    const nextCrop = makePixelCrop(box)
    const xDiff = data.clientX - data.startClientX
    const yDiff = data.clientY - data.startClientY

    nextCrop.x = clamp(data.startCropX + xDiff, 0, box.width - nextCrop.width)
    nextCrop.y = clamp(data.startCropY + yDiff, 0, box.height - nextCrop.height)

    return nextCrop
  }

  function getPointRegion(
    box: Rect,
    origOrd: Ords | undefined,
    minW: number,
    minH: number,
  ): Ords {
    const data = dragData.current
    const relativeX = data.clientX - box.x
    const relativeY = data.clientY - box.y

    const topHalf =
      minH && origOrd
        ? origOrd === 'nw' || origOrd === 'n' || origOrd === 'ne'
        : relativeY < data.startCropY
    const leftHalf =
      minW && origOrd
        ? origOrd === 'nw' || origOrd === 'w' || origOrd === 'sw'
        : relativeX < data.startCropX

    if (leftHalf) {
      return topHalf ? 'nw' : 'sw'
    }
    return topHalf ? 'ne' : 'se'
  }

  function resolveMinDimensions(box: Rect): [number, number] {
    const mw = Math.min(minWidth, box.width)
    const mh = Math.min(minHeight, box.height)

    if (!aspect || (!mw && !mh)) {
      return [mw, mh]
    }
    if (aspect > 1) {
      return mw ? [mw, mw / aspect] : [mh * aspect, mh]
    }
    return mh ? [mh * aspect, mh] : [mw, mw / aspect]
  }

  function resizeCrop(box: Rect) {
    const data = dragData.current
    const [minW, minH] = resolveMinDimensions(box)
    let nextCrop = makePixelCrop(box)
    const area = getPointRegion(box, data.ord, minW, minH)
    const ord = data.ord ?? area
    let xDiff = data.clientX - data.startClientX
    let yDiff = data.clientY - data.startClientY

    // With min dimensions set, stop the crop being dragged past the far side.
    if ((minW && ord === 'nw') || ord === 'w' || ord === 'sw') {
      xDiff = Math.min(xDiff, -minW)
    }
    if ((minH && ord === 'nw') || ord === 'n' || ord === 'ne') {
      yDiff = Math.min(yDiff, -minH)
    }

    const tmpCrop: PixelCrop = { unit: 'px', x: 0, y: 0, width: 0, height: 0 }

    if (area === 'ne') {
      tmpCrop.x = data.startCropX
      tmpCrop.width = xDiff
      tmpCrop.height = aspect ? tmpCrop.width / aspect : Math.abs(yDiff)
      tmpCrop.y = data.startCropY - tmpCrop.height
    } else if (area === 'se') {
      tmpCrop.x = data.startCropX
      tmpCrop.y = data.startCropY
      tmpCrop.width = xDiff
      tmpCrop.height = aspect ? tmpCrop.width / aspect : yDiff
    } else if (area === 'sw') {
      tmpCrop.x = data.startCropX + xDiff
      tmpCrop.y = data.startCropY
      tmpCrop.width = Math.abs(xDiff)
      tmpCrop.height = aspect ? tmpCrop.width / aspect : yDiff
    } else if (area === 'nw') {
      tmpCrop.x = data.startCropX + xDiff
      tmpCrop.width = Math.abs(xDiff)
      if (aspect) {
        tmpCrop.height = tmpCrop.width / aspect
        tmpCrop.y = data.startCropY - tmpCrop.height
      } else {
        tmpCrop.height = Math.abs(yDiff)
        tmpCrop.y = data.startCropY + yDiff
      }
    }

    const containedCrop = containCrop(
      tmpCrop,
      aspect,
      area,
      box.width,
      box.height,
      minW,
      minH,
      maxWidth,
      maxHeight,
    )

    // Apply only the axes relevant to the dragged ordinate (aspect locks both).
    if (aspect || xyOrds.indexOf(ord) > -1) {
      nextCrop = containedCrop
    } else if (xOrds.indexOf(ord) > -1) {
      nextCrop.x = containedCrop.x
      nextCrop.width = containedCrop.width
    } else if (yOrds.indexOf(ord) > -1) {
      nextCrop.y = containedCrop.y
      nextCrop.height = containedCrop.height
    }

    nextCrop.x = clamp(nextCrop.x, 0, box.width - nextCrop.width)
    nextCrop.y = clamp(nextCrop.y, 0, box.height - nextCrop.height)

    return nextCrop
  }

  function onSelectionKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled || !crop) {
      return
    }

    const box = getBox()
    const nextCrop = makePixelCrop(box)
    const step =
      e.metaKey || e.ctrlKey
        ? NUDGE_STEP_LARGE
        : e.shiftKey
          ? NUDGE_STEP_MEDIUM
          : NUDGE_STEP
    let nudged = true

    if (e.key === 'ArrowLeft') nextCrop.x -= step
    else if (e.key === 'ArrowRight') nextCrop.x += step
    else if (e.key === 'ArrowUp') nextCrop.y -= step
    else if (e.key === 'ArrowDown') nextCrop.y += step
    else nudged = false

    if (!nudged) {
      return
    }
    e.preventDefault()

    nextCrop.x = clamp(nextCrop.x, 0, box.width - nextCrop.width)
    nextCrop.y = clamp(nextCrop.y, 0, box.height - nextCrop.height)

    const pixelCrop = convertToPixelCrop(nextCrop, box.width, box.height)
    const percentCrop = convertToPercentCrop(nextCrop, box.width, box.height)
    onChange(pixelCrop, percentCrop)
    onComplete?.(pixelCrop, percentCrop)
  }

  function onHandleKeyDown(e: KeyboardEvent<HTMLDivElement>, ord: Ords) {
    if (disabled || !crop) {
      return
    }
    if (
      e.key !== 'ArrowUp' &&
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowRight'
    ) {
      return
    }

    // Keep the event from bubbling to the selection's move handler.
    e.stopPropagation()
    e.preventDefault()

    const box = getBox()
    const offset =
      e.metaKey || e.ctrlKey
        ? NUDGE_STEP_LARGE
        : e.shiftKey
          ? NUDGE_STEP_MEDIUM
          : NUDGE_STEP
    const pixelCrop = convertToPixelCrop(crop, box.width, box.height)
    const nudged = nudgeCrop(pixelCrop, e.key, offset, ord)
    const contained = containCrop(
      nudged,
      aspect,
      ord,
      box.width,
      box.height,
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    )

    if (!areCropsEqual(crop, contained)) {
      const percentCrop = convertToPercentCrop(contained, box.width, box.height)
      onChange(contained, percentCrop)
      onComplete?.(contained, percentCrop)
    }
  }

  const cropStyle = crop
    ? {
        top: `${crop.y}${crop.unit}`,
        left: `${crop.x}${crop.unit}`,
        width: `${crop.width}${crop.unit}`,
        height: `${crop.height}${crop.unit}`,
      }
    : undefined

  // A freshly-started zero-size crop is hidden until the first drag move.
  const invisible = !dragStarted.current && crop && !crop.width && !crop.height
  const showHandles = !disabled && !locked && !newCropIsBeingDrawn

  const renderHandle = (ord: Ords, extra?: string) => (
    <div
      key={ord}
      data-ord={ord}
      role="button"
      tabIndex={0}
      aria-label={`Resize crop from the ${ORD_LABEL[ord]} corner`}
      onKeyDown={(e) => onHandleKeyDown(e, ord)}
      className={cn(
        'absolute box-border size-3.5 rounded-full border-2 border-white bg-[#2dd4bf] shadow-sm outline-none pointer-coarse:size-6 focus:bg-[#0d9488]',
        HANDLE_CLASSES[ord],
        extra,
        handleClassName,
      )}
    />
  )

  return (
    <div
      ref={componentRef}
      {...rest}
      tabIndex={-1}
      className={cn(
        'relative inline-block max-w-full select-none outline-none',
        !disabled && 'touch-none',
        disabled || locked ? 'cursor-default' : 'cursor-crosshair',
        className,
      )}
      style={style}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerDone}
      onPointerCancel={onPointerDone}
    >
      <div
        ref={mediaRef}
        className="max-h-[inherit] overflow-hidden [&>img]:block [&>img]:max-h-[inherit] [&>img]:max-w-full [&>video]:block [&>video]:max-h-[inherit] [&>video]:max-w-full"
        onPointerDown={onMediaPointerDown}
      >
        {children}
      </div>

      {crop && !invisible && (
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-[calc(100%+0.5px)] w-[calc(100%+0.5px)]"
          width="100%"
          height="100%"
        >
          <defs>
            <mask id={maskId}>
              <rect width="100%" height="100%" fill="white" />
              {circularCrop ? (
                <ellipse
                  cx={`${crop.x + crop.width / 2}${crop.unit}`}
                  cy={`${crop.y + crop.height / 2}${crop.unit}`}
                  rx={`${crop.width / 2}${crop.unit}`}
                  ry={`${crop.height / 2}${crop.unit}`}
                  fill="black"
                />
              ) : (
                <rect
                  x={`${crop.x}${crop.unit}`}
                  y={`${crop.y}${crop.unit}`}
                  width={`${crop.width}${crop.unit}`}
                  height={`${crop.height}${crop.unit}`}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            fill="black"
            fillOpacity={0.5}
            width="100%"
            height="100%"
            mask={`url(#${maskId})`}
          />
        </svg>
      )}

      {crop && !invisible && (
        <div
          ref={selectionRef}
          style={cropStyle}
          role="group"
          aria-label="Crop selection. Use the arrow keys to move it."
          tabIndex={0}
          onPointerDown={onCropPointerDown}
          onKeyDown={onSelectionKeyDown}
          className={cn(
            'absolute box-border cursor-move border-2 border-[#2dd4bf] outline-none focus-visible:border-white',
            disabled && 'cursor-[inherit]',
            circularCrop && 'rounded-full',
            selectionClassName,
          )}
        >
          {showHandles && (
            <>
              {!aspect &&
                EDGE_ORDS.map((ord) => (
                  <div
                    key={`bar-${ord}`}
                    data-ord={ord}
                    className={cn('absolute', BAR_CLASSES[ord])}
                  />
                ))}
              {CORNER_ORDS.map((ord) => renderHandle(ord))}
              {!aspect &&
                EDGE_ORDS.map((ord) =>
                  renderHandle(ord, 'pointer-coarse:hidden'),
                )}
            </>
          )}

          {renderSelectionAddon && (
            <div onPointerDown={(e) => e.stopPropagation()}>
              {renderSelectionAddon({ cropIsActive, newCropIsBeingDrawn })}
            </div>
          )}

          {ruleOfThirds && (
            <>
              <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/40" />
              <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/40" />
              <div className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/40" />
              <div className="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-white/40" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
