'use client'

import { cn } from 'cn'
import { X } from 'lucide-react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { CarouselApi } from '@/components/ui/carousel'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { WaveformPlayer } from '@/components/waveform-player'

const ANIMATION_MS = 200

export type MediaViewerType = 'IMAGE' | 'VIDEO' | 'AUDIO'

export interface MediaViewerItem {
  /** Stable key; falls back to the array index. */
  id?: string | number
  type: MediaViewerType
  url: string
  /** Video poster, or a cover image shown above the audio waveform. */
  poster?: string
}

/**
 * Audio slide: an optional cover that gently scales while playing, above a
 * compact waveform player.
 */
export function AudioPreview({
  url,
  poster,
}: {
  url: string
  poster?: string
}) {
  const [playing, setPlaying] = React.useState(false)

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-xl flex-col items-center gap-4 px-6">
        {poster && (
          // biome-ignore lint/performance/noImgElement: registry component stays framework-agnostic
          <img
            src={poster}
            alt=""
            className={cn(
              'aspect-square w-full rounded-lg object-cover transition-transform duration-500',
              playing ? 'scale-105' : 'scale-100',
            )}
          />
        )}
        <WaveformPlayer
          url={url}
          className="w-full"
          onPlayStateChange={setPlaying}
        />
      </div>
    </div>
  )
}

export interface MediaViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MediaViewerItem[]
  initialIndex?: number
  loop?: boolean
}

export function MediaViewer({
  open,
  onOpenChange,
  items,
  initialIndex = 0,
  loop = true,
}: MediaViewerProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  const [isAnimating, setIsAnimating] = React.useState(false)
  const [api, setApi] = React.useState<CarouselApi>()
  const [selectedIndex, setSelectedIndex] = React.useState(initialIndex)

  // Enter / exit fade.
  React.useEffect(() => {
    if (open) {
      setIsVisible(true)
      requestAnimationFrame(() => setIsAnimating(true))
      return
    }
    setIsAnimating(false)
    const timer = setTimeout(() => setIsVisible(false), ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [open])

  // Lock background scroll while open.
  React.useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  React.useEffect(() => {
    if (!api) return

    const handleSelect = () => {
      setSelectedIndex(api.selectedScrollSnap())
    }

    handleSelect()
    api.on('select', handleSelect)
    api.on('reInit', handleSelect)

    return () => {
      api.off('select', handleSelect)
      api.off('reInit', handleSelect)
    }
  }, [api])

  React.useEffect(() => {
    if (!open) return
    setSelectedIndex(initialIndex)
    api?.scrollTo(initialIndex, true)
  }, [api, initialIndex, open])

  if (!isVisible || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      className="fixed inset-0 z-[60]"
    >
      <div
        className={cn(
          'absolute inset-0 bg-background transition-opacity duration-200',
          isAnimating ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          isAnimating ? 'opacity-100' : 'opacity-0',
        )}
      >
        <Button
          variant="secondary"
          size="icon"
          aria-label="Close"
          className="absolute top-4 left-4 z-10"
          onClick={() => onOpenChange(false)}
        >
          <X className="size-4" />
        </Button>
        <div className="flex h-full w-full items-center justify-center">
          <Carousel
            setApi={setApi}
            opts={{
              align: 'start',
              startIndex: initialIndex,
              loop: loop && items.length > 1,
            }}
            className="size-4/5"
          >
            <style>{`
              [data-slot="carousel-content"],
              [data-slot="carousel-content"] > div {
                height: 100%;
              }
            `}</style>
            <CarouselContent>
              {items.map((item, index) => (
                <CarouselItem key={item.id ?? index}>
                  <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md">
                    {item.type === 'IMAGE' && item.url ? (
                      // biome-ignore lint/performance/noImgElement: registry component stays framework-agnostic
                      <img
                        src={item.url}
                        alt={`Item ${index + 1}`}
                        className="h-full w-full object-contain"
                      />
                    ) : item.type === 'VIDEO' && item.url ? (
                      <video
                        src={item.url}
                        poster={item.poster}
                        controls
                        playsInline
                        autoPlay={selectedIndex === index}
                        className="h-full w-full object-contain"
                      >
                        <track kind="captions" />
                      </video>
                    ) : item.type === 'AUDIO' && item.url ? (
                      <AudioPreview url={item.url} poster={item.poster} />
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Nothing to preview
                      </div>
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {items.length > 1 && (
              <>
                <CarouselPrevious className="size-8" />
                <CarouselNext className="size-8" />
              </>
            )}
          </Carousel>
        </div>
        {items.length > 1 && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-center text-white mix-blend-difference">
            {selectedIndex + 1} / {items.length}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default MediaViewer
