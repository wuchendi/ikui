'use client'

import { cn } from 'cn'
import * as React from 'react'
import { ThumbnailStrip } from '@/components/thumbnail-strip'
import type { VideoThumbnailCache } from '@/lib/video-thumbnail-cache'

const DEFAULT_HEIGHT = 64
const DEFAULT_TILE_WIDTH = 36
const LABEL_HEIGHT = 16

export interface TimelineSegment {
  /** Stable identifier — used as the React key. */
  id: string | number
  /** Cache providing frames for this segment's underlying video. Segments may share one instance. */
  cache: VideoThumbnailCache
  /** Segment duration in seconds. Width = `(duration / totalDuration) * containerWidth`. */
  duration: number
  /** Seconds skipped at the start of the cache's video for this segment. Default: 0. */
  startOffset?: number
  /** Optional poster URL tiled beneath the canvas as an instant fallback before tiles decode. */
  fallbackUrl?: string
  /** Optional short text drawn in a bottom label bar over the segment. */
  label?: string
}

export interface SegmentedTimelineStripProps
  extends React.HTMLAttributes<HTMLDivElement> {
  segments: TimelineSegment[]
  /** Active segment index. Gets the accent border; others get a dim mask. */
  currentIndex?: number
  /** Playback time within the current segment in seconds. Drives the playhead position. */
  currentTime?: number
  /** Click-to-seek handler. */
  onSeek?: (params: { segmentIndex: number; timeWithinSegment: number }) => void
  /** Strip height in CSS pixels. Default: 64. */
  height?: number
  /** Width of each thumbnail tile in CSS pixels. Default: 36. */
  tileWidth?: number
  /** Show a small "Ns" badge in the top-right with the total duration. Default: true. */
  showTotalDurationBadge?: boolean
  /** Auto-generate a tiled fallback poster per segment (unless it sets its own `fallbackUrl`) so segments are never blank before tiles load. Default: true. */
  autoFallback?: boolean
  /** Background color drawn beneath unloaded tiles. Default: `"#111827"`. */
  placeholderColor?: string
  /** Accent color for the active border and playhead. Default: `"#6366f1"`. */
  accentColor?: string
}

export function SegmentedTimelineStrip({
  segments,
  currentIndex,
  currentTime = 0,
  onSeek,
  height = DEFAULT_HEIGHT,
  tileWidth = DEFAULT_TILE_WIDTH,
  showTotalDurationBadge = true,
  autoFallback = true,
  placeholderColor = '#111827',
  accentColor = '#6366f1',
  className,
  style,
  ...rest
}: SegmentedTimelineStripProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = React.useState(0)

  React.useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const totalDuration = segments.reduce(
    (sum, seg) => sum + (seg.duration ?? 0),
    0,
  )

  const layout = React.useMemo(() => {
    const widths: number[] = []
    const offsets: number[] = []
    let offset = 0
    for (const seg of segments) {
      const w =
        totalDuration > 0
          ? (seg.duration / totalDuration) * containerWidth
          : containerWidth / Math.max(segments.length, 1)
      widths.push(w)
      offsets.push(offset)
      offset += w
    }
    return { widths, offsets }
  }, [segments, totalDuration, containerWidth])

  const playheadX = React.useMemo(() => {
    if (currentIndex === undefined) return null
    const seg = segments[currentIndex]
    if (!seg || seg.duration <= 0) return null
    const ratio = Math.min(Math.max(currentTime, 0) / seg.duration, 1)
    return layout.offsets[currentIndex] + ratio * layout.widths[currentIndex]
  }, [currentIndex, currentTime, segments, layout])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    for (let i = 0; i < segments.length; i++) {
      const left = layout.offsets[i]
      const w = layout.widths[i]
      if (clickX < left + w) {
        const timeWithinSegment =
          w > 0 ? Math.max(0, ((clickX - left) / w) * segments[i].duration) : 0
        onSeek({ segmentIndex: i, timeWithinSegment })
        return
      }
    }
  }

  return (
    <div
      ref={wrapperRef}
      {...rest}
      className={cn(className)}
      onClick={(e) => {
        rest.onClick?.(e)
        handleClick(e)
      }}
      style={{
        position: 'relative',
        width: '100%',
        height,
        overflow: 'hidden',
        backgroundColor: placeholderColor,
        cursor: onSeek ? 'pointer' : 'default',
        ...style,
      }}
    >
      {containerWidth > 0 &&
        segments.map((seg, i) => {
          const w = layout.widths[i]
          const left = layout.offsets[i]
          const isActive = i === currentIndex
          return (
            <div
              key={seg.id}
              style={{
                position: 'absolute',
                top: 0,
                left,
                width: w,
                height,
              }}
            >
              <ThumbnailStrip
                cache={seg.cache}
                duration={seg.duration}
                startOffset={seg.startOffset ?? 0}
                totalWidth={w}
                tileWidth={tileWidth}
                tileHeight={height}
                fallbackUrl={seg.fallbackUrl}
                autoFallback={autoFallback}
              />
              {currentIndex !== undefined && !isActive && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: `2px solid ${accentColor}`,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {seg.label !== undefined && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: LABEL_HEIGHT,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    fontSize: 10,
                    lineHeight: `${LABEL_HEIGHT}px`,
                    textAlign: 'center',
                    pointerEvents: 'none',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  {seg.label}
                </div>
              )}
              {i < segments.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 1,
                    height,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          )
        })}

      {showTotalDurationBadge && totalDuration > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            height: LABEL_HEIGHT,
            padding: '0 6px',
            borderRadius: 3,
            backgroundColor: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontSize: 10,
            lineHeight: `${LABEL_HEIGHT}px`,
            fontFamily: 'system-ui, sans-serif',
            pointerEvents: 'none',
          }}
        >
          {Math.round(totalDuration)}s
        </div>
      )}

      {playheadX !== null && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: playheadX,
            width: 2,
            backgroundColor: accentColor,
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 0 4px rgba(0,0,0,0.6)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 2,
              left: -4,
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: accentColor,
              boxShadow: '0 0 4px rgba(0,0,0,0.6)',
            }}
          />
        </div>
      )}
    </div>
  )
}
