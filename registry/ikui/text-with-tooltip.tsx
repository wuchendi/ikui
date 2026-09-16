'use client'

import { cn } from 'cn'
import * as React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TextWithTooltipProps {
  text: string | number
  className?: string
  style?: React.CSSProperties
}

/**
 * Renders text truncated to its container and only shows a tooltip with the
 * full value when the text is actually clipped. A `ResizeObserver` tracks the
 * truncation state as the container resizes.
 */
export function TextWithTooltip({
  text,
  className,
  style,
}: TextWithTooltipProps) {
  const [isTruncated, setIsTruncated] = React.useState(false)
  const textRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = textRef.current
    if (!el) return

    const checkTruncation = () => {
      setIsTruncated(el.scrollWidth > el.clientWidth)
    }

    const resizeObserver = new ResizeObserver(checkTruncation)
    resizeObserver.observe(el)
    checkTruncation()

    return () => resizeObserver.disconnect()
  }, [])

  const content = (
    <div
      ref={textRef}
      className={cn(
        'truncate',
        !isTruncated && 'pointer-events-none',
        className,
      )}
      style={style}
    >
      {text}
    </div>
  )

  if (!isTruncated) return content

  return (
    <Tooltip>
      <TooltipTrigger delay={100} render={content} />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}
