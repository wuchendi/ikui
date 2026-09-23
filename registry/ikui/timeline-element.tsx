'use client'

import * as React from 'react'

export interface TimelineElementResize {
  /** New start position in seconds. */
  startTime: number
  /** New visible length in seconds. */
  duration: number
}

export interface TimelineElementProps {
  /** Position on the track in seconds. */
  startTime: number
  /** Visible length in seconds. */
  duration: number
  /** Base pixels per second at zoom = 1. Match the ruler's value. Default: `50`. */
  pixelsPerSecond?: number
  /** Zoom multiplier applied to `pixelsPerSecond`. Default: `1`. */
  zoom?: number
  /** Height in CSS px. Default: `56`. */
  height?: number
  /** Clip fill color. Default: `"#915dbe"`. */
  color?: string
  /** Draws the selection border and (when `trimmable`) the trim handles. */
  selected?: boolean
  /** Show left/right trim handles while selected. Default: `true`. */
  trimmable?: boolean
  /** Allow dragging the body to slide the element along the track — keeps
   *  `duration`, clamped within `[0, maxEnd]`. Default: `false`. */
  movable?: boolean
  /** Minimum duration in seconds while trimming. Default: `0`. */
  minDuration?: number
  /** Maximum end (`startTime + duration`) in seconds — clamps the right handle
   *  so the clip can't extend past the track/source. Default: `Infinity`. */
  maxEnd?: number
  /** Keyboard nudge step in seconds. Default: `0.1`. */
  step?: number
  /** Fired on pointer down — select this clip. */
  onSelect?: () => void
  /** Fired continuously while trimming. */
  onResize?: (next: TimelineElementResize) => void
  /** Fired once when a trim drag ends. */
  onResizeEnd?: (next: TimelineElementResize) => void
  /** Clip content — a waveform, thumbnail strip, label, etc. */
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function TimelineElement({
  startTime,
  duration,
  pixelsPerSecond = 50,
  zoom = 1,
  height = 56,
  color = '#915dbe',
  selected = false,
  trimmable = true,
  movable = false,
  minDuration = 0,
  maxEnd = Number.POSITIVE_INFINITY,
  step = 0.1,
  onSelect,
  onResize,
  onResizeEnd,
  children,
  className,
  style,
}: TimelineElementProps) {
  const pps = pixelsPerSecond * zoom

  // Live geometry during a drag; falls back to the controlled props otherwise.
  const [live, setLive] = React.useState<TimelineElementResize | null>(null)
  const current = live ?? { startTime, duration }

  const currentRef = React.useRef(current)
  currentRef.current = current

  // Resolve a trim delta (seconds) on one side into clamped geometry.
  const trim = React.useCallback(
    (
      side: 'left' | 'right',
      origin: TimelineElementResize,
      dt: number,
    ): TimelineElementResize => {
      if (side === 'left') {
        // left edge moves startTime and duration inversely.
        // `-origin.startTime` is the hard track boundary (start can't go below
        // 0) and must take precedence: when the clip is already shorter than
        // minDuration, `origin.duration - minDuration` is negative and would
        // otherwise drag startTime past 0, inflating duration up to minDuration.
        const clamped = Math.max(
          -origin.startTime,
          Math.min(origin.duration - minDuration, dt),
        )
        return {
          startTime: origin.startTime + clamped,
          duration: origin.duration - clamped,
        }
      }
      // right edge changes duration only, capped so the end stays within maxEnd
      return {
        startTime: origin.startTime,
        duration: Math.min(
          maxEnd - origin.startTime,
          Math.max(minDuration, origin.duration + dt),
        ),
      }
    },
    [minDuration, maxEnd],
  )

  // Slide the whole element, keeping its duration; clamp within [0, maxEnd].
  const move = React.useCallback(
    (origin: TimelineElementResize, dt: number): TimelineElementResize => {
      const maxStart = Math.max(0, maxEnd - origin.duration)
      const startTime = Math.min(Math.max(0, origin.startTime + dt), maxStart)
      return { startTime, duration: origin.duration }
    },
    [maxEnd],
  )

  const rootRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<{
    side: 'left' | 'right' | 'move'
    startX: number
    origin: TimelineElementResize
  } | null>(null)

  /**
   * Screen pixels per layout pixel, from every transformed ancestor combined.
   *
   * The painted width over the laid-out width IS that factor, and reading it
   * at the start of each move keeps a drag correct even if the page zooms
   * mid-gesture. Falls back to 1 whenever the element has no width to divide
   * by — an unmounted root, or a clip of zero duration.
   */
  const elementScale = () => {
    const el = rootRef.current
    if (!el || el.offsetWidth <= 0) return 1
    const painted = el.getBoundingClientRect().width
    return painted > 0 ? painted / el.offsetWidth : 1
  }

  // Pointer-move/up are handled locally on the root and only matter while a drag
  // is live (guarded by `dragRef`). A drag captures the pointer to the root, so
  // these fire for the gesture's duration only — no window listeners kept for the
  // component's whole lifetime — and tracking continues outside the clip's bounds.
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    // Pointer coordinates are SCREEN pixels while `pps` is layout pixels per
    // second — the element is positioned with `left: startTime * pps`. Under a
    // scaled ancestor (a zoomed canvas, a `scale()` preview) the two differ by
    // exactly that scale, and the clip would trim by the wrong amount of time.
    const dt = (event.clientX - drag.startX) / (pps * elementScale())
    const next =
      drag.side === 'move'
        ? move(drag.origin, dt)
        : trim(drag.side, drag.origin, dt)
    setLive(next)
    onResize?.(next)
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    onResizeEnd?.(currentRef.current)
    setLive(null)
  }

  const startTrim = (side: 'left' | 'right') => (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    // Capture the pointer on the root so the drag keeps tracking even if it
    // leaves the 12px handle (fast drags, or the handle moving out from under
    // the cursor) and so move/up dispatch to the root for the drag's duration.
    rootRef.current?.setPointerCapture(event.pointerId)
    dragRef.current = {
      side,
      startX: event.clientX,
      origin: currentRef.current,
    }
  }

  const nudge = (side: 'left' | 'right') => (event: React.KeyboardEvent) => {
    const dir =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (dir === 0) return
    event.preventDefault()
    const next = trim(side, currentRef.current, dir * step)
    onResize?.(next)
    onResizeEnd?.(next)
  }

  // Body pointer-down: always selects; when `movable`, also starts a drag that
  // slides the whole element. Handles stop propagation, so grabbing an edge
  // trims instead of moving.
  const startMove = (event: React.PointerEvent) => {
    onSelect?.()
    if (!movable) return
    event.preventDefault()
    // Consume the gesture so it can't double as a parent seek/scrub.
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      side: 'move',
      startX: event.clientX,
      origin: currentRef.current,
    }
  }

  // A trim handle: a primary-colored edge bar with a contrasting grip, after a
  // video editor's clip handle. Theme-aware (works on light and dark tracks).
  // Returned from a plain function (not a nested component) so it keeps its
  // identity across renders and holds focus.
  const renderHandle = (side: 'left' | 'right') => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={side === 'left' ? 'Trim start' : 'Trim end'}
      aria-valuemin={0}
      aria-valuenow={
        side === 'left'
          ? current.startTime
          : current.startTime + current.duration
      }
      onPointerDown={startTrim(side)}
      onKeyDown={nudge(side)}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--primary)',
        cursor: side === 'left' ? 'w-resize' : 'e-resize',
        touchAction: 'none',
        // Sit above sibling overlays (e.g. a playhead) so the handle is always
        // the grab target — otherwise a line crossing the edge swallows the drag.
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 4,
          height: '45%',
          borderRadius: 9999,
          background: 'var(--primary-foreground)',
        }}
      />
    </div>
  )

  return (
    <div
      ref={rootRef}
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: current.startTime * pps,
        width: current.duration * pps,
        height,
        borderRadius: 8,
        overflow: 'hidden',
        background: color,
        cursor: movable ? 'grab' : 'pointer',
        touchAction: 'none',
        ...style,
      }}
    >
      {/* Clip content. */}
      <div style={{ position: 'absolute', inset: 0 }}>{children}</div>

      {/* Selection border. */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 8,
            boxShadow: 'inset 0 0 0 2px var(--primary)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Trim handles. */}
      {selected && trimmable && (
        <>
          {renderHandle('left')}
          {renderHandle('right')}
        </>
      )}
    </div>
  )
}
