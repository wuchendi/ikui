'use client'

import { cn } from 'cn'
import * as React from 'react'

const DEFAULT_PIXELS_PER_SECOND = 50
const DEFAULT_FPS = 30
const DEFAULT_HEIGHT = 24

/**
 * frame intervals for labels - starts at 2 so there's always at least
 * one tick between labels even at max zoom. pattern: 2, 3, 5, 10, 15.
 */
const LABEL_FRAME_INTERVALS = [2, 3, 5, 10, 15] as const
/** frame intervals for ticks - can go down to 1 for max granularity. */
const TICK_FRAME_INTERVALS = [1, 2, 3, 5, 10, 15] as const
/** second intervals for when we're zoomed out past frame-level detail. */
const SECOND_MULTIPLIERS = [
  1, 2, 3, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
] as const

const MIN_LABEL_SPACING_PX = 120
const MIN_TICK_SPACING_PX = 18

interface RulerConfig {
  /** time interval in seconds between each label */
  labelIntervalSeconds: number
  /** time interval in seconds between each tick */
  tickIntervalSeconds: number
}

function findOptimalInterval(
  pixelsPerFrame: number,
  pixelsPerSecond: number,
  fps: number,
  minSpacingPx: number,
  frameIntervals: readonly number[],
): number {
  for (const frameInterval of frameIntervals) {
    if (pixelsPerFrame * frameInterval >= minSpacingPx) {
      return frameInterval / fps
    }
  }
  for (const secondMultiplier of SECOND_MULTIPLIERS) {
    if (pixelsPerSecond * secondMultiplier >= minSpacingPx) {
      return secondMultiplier
    }
  }
  return 60
}

/**
 * adjusts the tick interval so it divides evenly into the label interval,
 * guaranteeing every label lands on a tick.
 */
function ensureTickDividesLabel(
  tickIntervalSeconds: number,
  labelIntervalSeconds: number,
  pixelsPerFrame: number,
  pixelsPerSecond: number,
  fps: number,
): number {
  const labelFrames = Math.round(labelIntervalSeconds * fps)
  const tickFrames = Math.round(tickIntervalSeconds * fps)

  if (labelFrames % tickFrames === 0) return tickIntervalSeconds

  for (const candidateFrames of TICK_FRAME_INTERVALS) {
    if (
      labelFrames % candidateFrames === 0 &&
      pixelsPerFrame * candidateFrames >= MIN_TICK_SPACING_PX
    ) {
      return candidateFrames / fps
    }
  }
  for (const candidateSeconds of SECOND_MULTIPLIERS) {
    const ratio = labelIntervalSeconds / candidateSeconds
    const isDivisor = Math.abs(ratio - Math.round(ratio)) < 0.0001
    if (
      isDivisor &&
      pixelsPerSecond * candidateSeconds >= MIN_TICK_SPACING_PX
    ) {
      return candidateSeconds
    }
  }
  return labelIntervalSeconds
}

/**
 * determines the optimal label and tick intervals for the current zoom level.
 * labels need wide spacing (~120px) to stay readable; ticks can be much
 * denser (~18px) to show finer subdivisions.
 */
function getRulerConfig(pixelsPerSecond: number, fps: number): RulerConfig {
  const pixelsPerFrame = pixelsPerSecond / fps
  const labelIntervalSeconds = findOptimalInterval(
    pixelsPerFrame,
    pixelsPerSecond,
    fps,
    MIN_LABEL_SPACING_PX,
    LABEL_FRAME_INTERVALS,
  )
  const rawTickIntervalSeconds = findOptimalInterval(
    pixelsPerFrame,
    pixelsPerSecond,
    fps,
    MIN_TICK_SPACING_PX,
    TICK_FRAME_INTERVALS,
  )
  const tickIntervalSeconds = ensureTickDividesLabel(
    rawTickIntervalSeconds,
    labelIntervalSeconds,
    pixelsPerFrame,
    pixelsPerSecond,
    fps,
  )
  return { labelIntervalSeconds, tickIntervalSeconds }
}

function shouldShowLabel(time: number, labelIntervalSeconds: number): boolean {
  const epsilon = 0.0001
  const remainder = time % labelIntervalSeconds
  return remainder < epsilon || remainder > labelIntervalSeconds - epsilon
}

function formatTimestamp(timeInSeconds: number): string {
  const totalSeconds = Math.round(timeInSeconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = minutes.toString().padStart(2, '0')
  const ss = seconds.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * formats a ruler tick label. on a second boundary it renders `MM:SS`
 * (or `H:MM:SS` past an hour); between seconds it renders the frame number
 * as `Xf`.
 */
function formatRulerLabel(timeInSeconds: number, fps: number): string {
  const epsilon = 0.0001
  const remainder = timeInSeconds % 1
  const onSecond = remainder < epsilon || remainder > 1 - epsilon
  if (onSecond) return formatTimestamp(timeInSeconds)
  const frame = Math.round((timeInSeconds % 1) * fps)
  return `${frame}f`
}

export interface TimelineRulerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Total timeline length in seconds. Determines the scrollable width. */
  duration: number
  /** Base pixels per second at `zoom` = 1. Default: 50. */
  pixelsPerSecond?: number
  /** Zoom multiplier applied to `pixelsPerSecond`. Default: 1. */
  zoom?: number
  /** Frames per second — controls sub-second `Xf` labels at high zoom. Default: 30. */
  fps?: number
  /** Ruler height in CSS pixels. Default: 24. */
  height?: number
  /** Tick mark and label color. Default: `"currentColor"` at reduced opacity. */
  tickColor?: string
  /**
   * External horizontal scroll container to virtualize against and stay in
   * sync with. Provide this to embed the ruler above timeline tracks that share
   * one scrollbar (the ruler then renders inline with no scrollbar of its own).
   * Omit it to let the ruler own its scroll.
   */
  scrollRef?: React.RefObject<HTMLElement | null>
}

/** Tracks an element's scrollLeft + clientWidth, reacting to scroll and resize. */
function useScrollMetrics(ref: React.RefObject<HTMLElement | null>) {
  const [metrics, setMetrics] = React.useState({
    scrollLeft: 0,
    viewportWidth: 0,
  })

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () =>
      setMetrics({ scrollLeft: el.scrollLeft, viewportWidth: el.clientWidth })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [ref])

  return metrics
}

export function TimelineRuler({
  duration,
  pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND,
  zoom = 1,
  fps = DEFAULT_FPS,
  height = DEFAULT_HEIGHT,
  tickColor = 'currentColor',
  scrollRef,
  className,
  style,
  ...rest
}: TimelineRulerProps) {
  const ownScrollRef = React.useRef<HTMLDivElement>(null)
  // `scrollRef` (external, shared with tracks) takes precedence; otherwise the
  // ruler virtualizes against its own scroll wrapper.
  const embedded = scrollRef !== undefined
  const activeScrollRef = scrollRef ?? ownScrollRef
  const { scrollLeft, viewportWidth } = useScrollMetrics(activeScrollRef)

  const pps = pixelsPerSecond * zoom
  const contentWidth = Math.max(0, duration) * pps

  const { labelIntervalSeconds, tickIntervalSeconds } = getRulerConfig(pps, fps)

  // viewport virtualization: only render ticks within the visible range
  // (plus a buffer) so very long timelines stay cheap.
  const bufferPx = 200
  const visibleStart = Math.max(0, (scrollLeft - bufferPx) / pps)
  const visibleEnd = (scrollLeft + viewportWidth + bufferPx) / pps

  const tickCount = Math.ceil(duration / tickIntervalSeconds) + 1
  const startIndex = Math.max(0, Math.floor(visibleStart / tickIntervalSeconds))
  const endIndex = Math.min(
    tickCount - 1,
    Math.ceil(visibleEnd / tickIntervalSeconds),
  )

  const ticks: React.ReactNode[] = []
  for (let i = startIndex; i <= endIndex; i += 1) {
    const time = i * tickIntervalSeconds
    if (time > duration) break
    const left = time * pps
    if (shouldShowLabel(time, labelIntervalSeconds)) {
      const label = formatRulerLabel(time, fps)
      // A label normally extends rightward from its tick, so one near the end
      // would spill its text past `contentWidth` and get clipped by the track's
      // overflow. When the estimated text width won't fit, flip it to extend
      // leftward from the same tick — the anchor stays at the label's real time
      // (unlike right-edge pinning), and the text grows into the gap before it.
      const estTextWidth = label.length * 6.5
      const overflowsRight = left + estTextWidth > contentWidth
      ticks.push(
        <span
          key={i}
          style={{
            position: 'absolute',
            bottom: 0,
            left,
            transform: overflowsRight
              ? 'translateX(calc(-100% - 1px))'
              : 'translateX(1px)',
            fontSize: 10,
            lineHeight: 1,
            color: tickColor,
            opacity: 0.85,
            fontVariantNumeric: 'tabular-nums',
            userSelect: 'none',
            fontFamily: 'system-ui, sans-serif',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>,
      )
    } else {
      // The final tick can land on the content's right edge, where its 1px body
      // would spill a pixel past the timeline; anchor it to `right: 0` instead.
      const atEnd = left >= contentWidth - 1
      ticks.push(
        <span
          key={i}
          style={{
            position: 'absolute',
            bottom: 2,
            ...(atEnd ? { right: 0 } : { left }),
            width: 1,
            height: 6,
            backgroundColor: tickColor,
            opacity: 0.25,
          }}
        />,
      )
    }
  }

  const content = (
    <div
      style={{
        position: 'relative',
        height: embedded ? height : '100%',
        width: contentWidth,
        minWidth: '100%',
        ...(embedded ? { color: tickColor, ...style } : null),
      }}
      className={embedded ? cn(className) : undefined}
      {...(embedded ? rest : {})}
    >
      {ticks}
    </div>
  )

  // Embedded: render inline so an outer container owns the scroll and the ruler
  // scrolls in lockstep with the tracks beneath it.
  if (embedded) return content

  return (
    <div
      ref={ownScrollRef}
      {...rest}
      className={cn(className)}
      style={{
        position: 'relative',
        width: '100%',
        height,
        overflowX: 'auto',
        overflowY: 'hidden',
        color: tickColor,
        ...style,
      }}
    >
      {content}
    </div>
  )
}
