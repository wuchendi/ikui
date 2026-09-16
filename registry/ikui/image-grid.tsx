'use client'

import { cn } from 'cn'
import type { CSSProperties, ReactNode } from 'react'

export interface ImageGridItem {
  src: string
  alt?: string
}

export interface ImageGridProps {
  /** Images to lay out. Only the first 9 are rendered (nine-grid cap). */
  images: ImageGridItem[]
  /** Gap between cells, in pixels. */
  gap?: number
  className?: string
  /** Called with the cell index when a cell is clicked. */
  onImageClick?: (index: number) => void
  /**
   * Render a cell's content yourself (e.g. to wrap it in a lightbox trigger).
   * The returned node should fill its cell — `h-full w-full object-cover`.
   * Mutually exclusive with `onImageClick`: when that is set the cell is already
   * a `<button>`, so returning an interactive element here would nest controls.
   */
  renderImage?: (image: ImageGridItem, index: number) => ReactNode
}

const MAX_IMAGES = 9

interface Cell {
  /** 1-based column start and span on the 6×6 grid. */
  c: number
  cs: number
  /** 1-based row start and span on the 6×6 grid. */
  r: number
  rs: number
}

// Collage layouts on a single 6×6 grid, one per image count. Every layout tiles
// the whole square so the outer container always stays 1:1. 1–4 are the classic
// album mosaic; 5 is two over three; 6 is a hero with two down the side and
// three across the bottom; 7 is two tall on the left over two stacked on the
// right, with three across the bottom; 8 is one tall on the left, two stacked
// in the middle and two on the right, over three across the bottom; 9 is the
// uniform 3×3 grid expressed as 2×2 cells. No cell collapses into a thin strip.
const COLLAGE_LAYOUTS: Record<number, Cell[]> = {
  1: [{ c: 1, cs: 6, r: 1, rs: 6 }],
  2: [
    { c: 1, cs: 3, r: 1, rs: 6 },
    { c: 4, cs: 3, r: 1, rs: 6 },
  ],
  3: [
    { c: 1, cs: 3, r: 1, rs: 6 },
    { c: 4, cs: 3, r: 1, rs: 3 },
    { c: 4, cs: 3, r: 4, rs: 3 },
  ],
  4: [
    { c: 1, cs: 3, r: 1, rs: 3 },
    { c: 4, cs: 3, r: 1, rs: 3 },
    { c: 1, cs: 3, r: 4, rs: 3 },
    { c: 4, cs: 3, r: 4, rs: 3 },
  ],
  5: [
    { c: 1, cs: 3, r: 1, rs: 3 },
    { c: 4, cs: 3, r: 1, rs: 3 },
    { c: 1, cs: 2, r: 4, rs: 3 },
    { c: 3, cs: 2, r: 4, rs: 3 },
    { c: 5, cs: 2, r: 4, rs: 3 },
  ],
  6: [
    { c: 1, cs: 4, r: 1, rs: 4 },
    { c: 5, cs: 2, r: 1, rs: 2 },
    { c: 5, cs: 2, r: 3, rs: 2 },
    { c: 1, cs: 2, r: 5, rs: 2 },
    { c: 3, cs: 2, r: 5, rs: 2 },
    { c: 5, cs: 2, r: 5, rs: 2 },
  ],
  7: [
    { c: 1, cs: 2, r: 1, rs: 4 },
    { c: 3, cs: 2, r: 1, rs: 4 },
    { c: 5, cs: 2, r: 1, rs: 2 },
    { c: 5, cs: 2, r: 3, rs: 2 },
    { c: 1, cs: 2, r: 5, rs: 2 },
    { c: 3, cs: 2, r: 5, rs: 2 },
    { c: 5, cs: 2, r: 5, rs: 2 },
  ],
  8: [
    { c: 1, cs: 2, r: 1, rs: 4 },
    { c: 3, cs: 2, r: 1, rs: 2 },
    { c: 3, cs: 2, r: 3, rs: 2 },
    { c: 5, cs: 2, r: 1, rs: 2 },
    { c: 5, cs: 2, r: 3, rs: 2 },
    { c: 1, cs: 2, r: 5, rs: 2 },
    { c: 3, cs: 2, r: 5, rs: 2 },
    { c: 5, cs: 2, r: 5, rs: 2 },
  ],
  9: [
    { c: 1, cs: 2, r: 1, rs: 2 },
    { c: 3, cs: 2, r: 1, rs: 2 },
    { c: 5, cs: 2, r: 1, rs: 2 },
    { c: 1, cs: 2, r: 3, rs: 2 },
    { c: 3, cs: 2, r: 3, rs: 2 },
    { c: 5, cs: 2, r: 3, rs: 2 },
    { c: 1, cs: 2, r: 5, rs: 2 },
    { c: 3, cs: 2, r: 5, rs: 2 },
    { c: 5, cs: 2, r: 5, rs: 2 },
  ],
}

export function ImageGrid(props: ImageGridProps) {
  const { images, gap = 4, className, onImageClick, renderImage } = props

  const shown = images.slice(0, MAX_IMAGES)
  const layout = COLLAGE_LAYOUTS[shown.length]

  if (!layout) {
    return null
  }

  const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gridTemplateRows: 'repeat(6, 1fr)',
    aspectRatio: '1',
    gap,
  }

  return (
    <div className={cn('w-full', className)} style={containerStyle}>
      {shown.map((image, index) => {
        const cell = layout[index]
        const isClickable = !!onImageClick
        // A clickable cell must be keyboard-operable, so render a real
        // <button> (focusable, Enter/Space activated) instead of a div+onClick.
        const CellElement = isClickable ? 'button' : 'div'

        return (
          <CellElement
            // biome-ignore lint/suspicious/noArrayIndexKey: images are positional and have no stable id
            key={index}
            type={isClickable ? 'button' : undefined}
            // Give a clickable cell an accessible name when the image itself
            // carries none (decorative alt=""), so it isn't an unlabeled button.
            aria-label={
              isClickable && !image.alt ? `Image ${index + 1}` : undefined
            }
            className={cn(
              'block h-full w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              isClickable &&
                'cursor-pointer border-0 bg-transparent p-0 active:opacity-90',
            )}
            style={{
              gridColumn: `${cell.c} / span ${cell.cs}`,
              gridRow: `${cell.r} / span ${cell.rs}`,
            }}
            onClick={isClickable ? () => onImageClick(index) : undefined}
          >
            {renderImage ? (
              renderImage(image, index)
            ) : (
              // biome-ignore lint/performance/noImgElement: arbitrary user URLs, next/image would not fit
              <img
                src={image.src}
                alt={image.alt ?? ''}
                loading="lazy"
                decoding="async"
                className="block h-full w-full object-cover"
              />
            )}
          </CellElement>
        )
      })}
    </div>
  )
}
