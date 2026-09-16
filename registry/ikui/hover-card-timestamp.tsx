'use client'

import { cn } from 'cn'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Check, Copy } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

type HoverCardContentProps = ComponentPropsWithoutRef<typeof HoverCardContent>

interface HoverCardTimestampProps {
  date: Date
  side?: HoverCardContentProps['side']
  sideOffset?: HoverCardContentProps['sideOffset']
  align?: HoverCardContentProps['align']
  alignOffset?: HoverCardContentProps['alignOffset']
  className?: string
}

/**
 * A timestamp that reveals the same instant in multiple forms (raw epoch, UTC,
 * local timezone, and relative) inside a hover card. Each row copies its value
 * on click.
 */
export function HoverCardTimestamp({
  date,
  side = 'right',
  align = 'start',
  alignOffset = -4,
  sideOffset,
  className,
}: HoverCardTimestampProps) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // Shift by the local offset so date-fns `format` renders UTC wall-clock time.
  const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000)

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={0}
        closeDelay={0}
        render={
          <div className={cn('font-mono whitespace-nowrap', className)}>
            {format(date, 'LLL dd, y HH:mm:ss')}
          </div>
        }
      />
      <HoverCardContent
        className="z-10 w-auto p-2"
        side={side}
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
      >
        <dl className="flex flex-col gap-1">
          <Row value={String(date.getTime())} label="Timestamp" />
          <Row value={format(utcDate, 'LLL dd, y HH:mm:ss')} label="UTC" />
          <Row value={format(date, 'LLL dd, y HH:mm:ss')} label={timezone} />
          <Row
            value={formatDistanceToNowStrict(date, { addSuffix: true })}
            label="Relative"
          />
        </dl>
      </HoverCardContent>
    </HoverCard>
  )
}

function Row({ value, label }: { value: string; label: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard()

  return (
    <div
      className="group flex items-center justify-between gap-4 text-sm"
      onClick={(e) => {
        e.stopPropagation()
        void copyToClipboard(value)
      }}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 truncate font-mono">
        <span className="invisible group-hover:visible">
          {!isCopied ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </span>
        {value}
      </dd>
    </div>
  )
}
