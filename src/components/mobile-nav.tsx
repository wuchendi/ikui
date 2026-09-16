'use client'

import { cn } from 'cn'
import type { LinkProps } from 'next/link'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { DocSchema } from '@/lib/types'

export function MobileNav({
  docSchema,
  className,
}: {
  docSchema: DocSchema
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      root.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <Button
        variant="outline"
        size="icon-lg"
        aria-expanded={open}
        aria-label="Toggle Menu"
        onClick={() => setOpen((value) => !value)}
        className={cn('border-none', className)}
      >
        <div className="relative flex h-8 w-4 items-center justify-center">
          <div className="relative size-4">
            <span
              className={cn(
                'bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-100',
                open ? 'top-[0.45rem] -rotate-45' : 'top-1',
              )}
            />
            <span
              className={cn(
                'bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-100',
                open ? 'top-[0.45rem] rotate-45' : 'top-2.5',
              )}
            />
          </div>
        </div>
      </Button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-x-0 top-14 bottom-0 z-40 bg-background animate-in fade-in-0 duration-100">
            <div className="no-scrollbar flex h-full flex-col gap-8 overflow-y-auto px-4 py-6">
              <div className="flex flex-col gap-4">
                <div className="text-muted-foreground text-sm font-medium">
                  Site
                </div>
                <div className="flex flex-col gap-3">
                  <MobileLink href="/docs/introduction" onOpenChange={setOpen}>
                    Docs
                  </MobileLink>
                  <MobileLink href="/docs/components" onOpenChange={setOpen}>
                    Components
                  </MobileLink>
                  <MobileLink href="/blocks" onOpenChange={setOpen}>
                    Blocks
                  </MobileLink>
                </div>
              </div>
              {docSchema.map((section) => (
                <div key={section.title} className="flex flex-col gap-4">
                  <div className="text-muted-foreground text-sm font-medium">
                    {section.title}
                  </div>
                  <div className="flex flex-col gap-3">
                    {section.items.map((item) =>
                      item.href ? (
                        <a
                          key={item.id}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setOpen(false)}
                          className="text-2xl font-medium transition-colors"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <MobileLink
                          key={item.id}
                          href={`/docs/${item.id}`}
                          onOpenChange={setOpen}
                        >
                          {item.title}
                        </MobileLink>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function MobileLink({
  href,
  onOpenChange,
  className,
  children,
  ...props
}: LinkProps & {
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isActive = pathname === href

  return (
    <Link
      href={href}
      onClick={() => {
        router.push(href.toString())
        onOpenChange?.(false)
      }}
      className={cn(
        'text-2xl font-medium transition-colors',
        isActive && 'text-primary',
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}

export default MobileNav
