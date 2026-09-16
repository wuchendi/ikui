'use client'

import { cn } from 'cn'
import { useState } from 'react'
import { ImageGrid } from '@/registry/ikui/image-grid'

const images = Array.from({ length: 9 }, (_, i) => ({
  src: `/seed/grid-${i + 1}.webp`,
  alt: '',
}))

export function Demo() {
  const [count, setCount] = useState(3)

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            className={cn(
              'h-8 w-8 rounded-md border text-sm transition-colors',
              count === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <ImageGrid images={images.slice(0, count)} />
    </div>
  )
}
