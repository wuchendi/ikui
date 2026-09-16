'use client'

import { cn } from 'cn'
import { Pause, Play } from 'lucide-react'
import * as React from 'react'
import { AudioWaveform } from '@/components/audio-waveform'
import { Button } from '@/components/ui/button'

interface WaveformPlayerProps {
  /**
   * Audio blob to play and visualize. Takes precedence over `url`.
   */
  blob?: Blob
  /**
   * Audio URL to play and visualize.
   */
  url?: string
  /**
   * Width of the visualizer. Defaults to the container width.
   */
  width?: number
  /**
   * Height of the visualizer. Default: `84`
   */
  height?: number
  /**
   * Width of each individual bar. Default: `2`
   */
  barWidth?: number
  /**
   * Gap between each bar. Default: `1`
   */
  gap?: number
  /**
   * Color of the bars that have not yet been played.
   */
  barColor?: string
  /**
   * Color of the bars that have been played. Default: `"rgb(34, 197, 94)"`
   */
  barPlayedColor?: string
  /**
   * Additional CSS classes for the wrapper.
   */
  className?: string
  /**
   * Called whenever playback starts or stops.
   */
  onPlayStateChange?: (playing: boolean) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const WaveformPlayer = React.forwardRef<HTMLDivElement, WaveformPlayerProps>(
  (
    {
      blob,
      url,
      width,
      height = 84,
      barWidth = 2,
      gap = 1,
      barColor,
      barPlayedColor = 'rgb(34, 197, 94)',
      className,
      onPlayStateChange,
    },
    ref,
  ) => {
    const seekRef = React.useRef<HTMLDivElement | null>(null)
    const draggingRef = React.useRef(false)
    const onPlayStateChangeRef = React.useRef(onPlayStateChange)
    onPlayStateChangeRef.current = onPlayStateChange

    // A single decoded buffer feeds both playback (Web Audio) and the waveform.
    const audioContextRef = React.useRef<AudioContext | null>(null)
    const bufferRef = React.useRef<AudioBuffer | null>(null)
    const sourceRef = React.useRef<AudioBufferSourceNode | null>(null)
    // ctx time when the current segment started, and the buffer offset it plays from.
    const startedAtRef = React.useRef(0)
    const offsetRef = React.useRef(0)

    const [audioBuffer, setAudioBuffer] = React.useState<AudioBuffer>()
    const [decodeError, setDecodeError] = React.useState(false)
    const [isPlaying, setIsPlaying] = React.useState(false)
    const [currentTime, setCurrentTime] = React.useState(0)
    const [duration, setDuration] = React.useState(0)

    // Decode the source exactly once into a shared AudioBuffer.
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the source changes; stopSource reads refs and is stable
    React.useEffect(() => {
      if (!blob && !url) return

      let cancelled = false
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      setDecodeError(false)

      const load = async () => {
        const arrayBuffer = blob
          ? await blob.arrayBuffer()
          : url
            ? await (await fetch(url)).arrayBuffer()
            : null
        if (!arrayBuffer) return
        const decoded = await audioContext.decodeAudioData(arrayBuffer)
        if (cancelled) return
        bufferRef.current = decoded
        setAudioBuffer(decoded)
        setDuration(decoded.duration)
      }

      load().catch(() => {
        if (!cancelled) setDecodeError(true)
      })

      return () => {
        cancelled = true
        stopSource()
        void audioContext.close()
        audioContextRef.current = null
        bufferRef.current = null
        offsetRef.current = 0
        setAudioBuffer(undefined)
        setDuration(0)
        setCurrentTime(0)
        setIsPlaying(false)
      }
    }, [blob, url])

    // Advance the displayed time while playing.
    React.useEffect(() => {
      if (!isPlaying) return
      let raf = 0
      const tick = () => {
        const audioContext = audioContextRef.current
        const total = bufferRef.current?.duration ?? 0
        if (audioContext) {
          const t =
            offsetRef.current +
            (audioContext.currentTime - startedAtRef.current)
          setCurrentTime(Math.min(t, total))
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [isPlaying])

    // Play `buffer` from `offset` seconds; a fresh source node per segment.
    const startSource = (offset: number) => {
      const audioContext = audioContextRef.current
      const buffer = bufferRef.current
      if (!audioContext || !buffer) return
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)
      source.onended = () => {
        // Ignore the `onended` that a manual stop/seek triggers.
        if (source !== sourceRef.current) return
        sourceRef.current = null
        offsetRef.current = 0
        setCurrentTime(0)
        setIsPlaying(false)
        onPlayStateChangeRef.current?.(false)
      }
      startedAtRef.current = audioContext.currentTime
      offsetRef.current = offset
      source.start(0, offset)
      sourceRef.current = source
    }

    const stopSource = () => {
      const source = sourceRef.current
      if (!source) return
      sourceRef.current = null
      source.onended = null
      source.stop()
      source.disconnect()
    }

    const togglePlay = () => {
      const audioContext = audioContextRef.current
      const buffer = bufferRef.current
      if (!audioContext || !buffer) return

      if (isPlaying) {
        offsetRef.current = Math.min(
          offsetRef.current + (audioContext.currentTime - startedAtRef.current),
          buffer.duration,
        )
        stopSource()
        setIsPlaying(false)
        onPlayStateChange?.(false)
      } else {
        void audioContext.resume()
        if (offsetRef.current >= buffer.duration) offsetRef.current = 0
        startSource(offsetRef.current)
        setIsPlaying(true)
        onPlayStateChange?.(true)
      }
    }

    // Click or drag across the visualizer to seek to that position.
    const seekToClientX = (clientX: number) => {
      const el = seekRef.current
      const buffer = bufferRef.current
      if (!el || !buffer || !buffer.duration) return
      const rect = el.getBoundingClientRect()
      const fraction = Math.min(
        Math.max((clientX - rect.left) / rect.width, 0),
        1,
      )
      const time = fraction * buffer.duration
      if (isPlaying) {
        stopSource()
        startSource(time)
      } else {
        offsetRef.current = time
      }
      setCurrentTime(time)
    }

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex flex-col gap-3 rounded-lg w-full',
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="icon"
            className="size-9 rounded-full shrink-0"
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>

          <div
            ref={seekRef}
            className="relative cursor-pointer"
            style={{ width: width ?? '100%', height }}
            onPointerDown={(e) => {
              draggingRef.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              seekToClientX(e.clientX)
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) seekToClientX(e.clientX)
            }}
            onPointerUp={(e) => {
              draggingRef.current = false
              e.currentTarget.releasePointerCapture(e.pointerId)
            }}
          >
            {(audioBuffer || decodeError) && (
              <AudioWaveform
                audioBuffer={audioBuffer}
                width={width}
                height={height}
                barWidth={barWidth}
                gap={gap}
                barColor={barColor}
                barPlayedColor={barPlayedColor}
                progress={duration > 0 ? currentTime / duration : 0}
              />
            )}
          </div>
        </div>

        <div className="flex justify-between text-xs text-muted-foreground pl-12 px-0.5 select-none">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    )
  },
)

WaveformPlayer.displayName = 'WaveformPlayer'

export type { WaveformPlayerProps }
export { WaveformPlayer }
