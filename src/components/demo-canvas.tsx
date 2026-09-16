'use client'

import { cn } from 'cn'
import { Loader2 } from 'lucide-react'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import RefreshAnticlockwise from './icons/refresh'
import { OpenInV0Button } from './open-in-v0-button'

export function DemoCanvas({
  children,
}: {
  children: ReactNode
  className?: string
  center?: boolean
}) {
  const [key, setKey] = useState(0)
  const [isRotating, setIsRotating] = useState(false)
  const pathname = usePathname()
  const v0Id = pathname?.split('/docs/')[1] || ''

  const handleRefresh = () => {
    setIsRotating(true)
    setKey((prev) => prev + 1)
    setTimeout(() => setIsRotating(false), 500)
  }

  return (
    <Tabs defaultValue="preview">
      <div className="flex items-center justify-between not-prose">
        <TabsList className="bg-transparent">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-1">
          {v0Id && <OpenInV0Button id={v0Id} />}
          <Button
            onClick={handleRefresh}
            variant="ghost"
            size="icon-sm"
            title="Refresh component"
          >
            <RefreshAnticlockwise
              className={cn(
                'transition-transform duration-500',
                isRotating && 'rotate-180',
              )}
            />
          </Button>
        </div>
      </div>
      <div key={key}>{children}</div>
    </Tabs>
  )
}

export function DemoPreview({
  children,
  center,
  className,
}: {
  children: ReactNode
  center?: boolean
  className?: string
}) {
  return (
    <TabsContent value="preview">
      <div
        className={cn(
          'flex w-full p-10 overflow-hidden border rounded-sm not-prose preview min-h-64 justify-center md:min-h-80 h-full items-center',
          center && 'flex items-center justify-center',
          className,
        )}
      >
        <Suspense
          fallback={
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          }
        >
          {children}
        </Suspense>
      </div>
    </TabsContent>
  )
}

export function DemoCode({ children }: { children: ReactNode }) {
  return (
    <TabsContent value="code" className="[&_pre]:my-0">
      {children}
    </TabsContent>
  )
}
