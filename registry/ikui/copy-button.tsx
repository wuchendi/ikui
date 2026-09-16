'use client'

import { cn } from 'cn'
import { CheckIcon, CopyIcon } from 'lucide-react'
import * as React from 'react'

type SizeVariant = 'sm' | 'default' | 'lg'

interface CopyButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'value' | 'onCopy'
  > {
  /** Text to copy, or a (possibly async) function resolving to it on click. */
  value?: string | (() => string | Promise<string>)
  size?: SizeVariant
  /** How long the copied state stays before resetting, in ms. */
  timeout?: number
  /** Icon shown in the idle state. Receives the resolved icon size. */
  copyIcon?: React.ReactNode
  /** Icon shown after a successful copy. */
  copiedIcon?: React.ReactNode
  /** Called with the copied text after it is written to the clipboard. */
  onCopy?: (value: string) => void
  /** Called when reading the value or writing to the clipboard fails. */
  onCopyError?: (error: unknown) => void
  /** Optional label rendered next to the icon, turning this into a text button. */
  children?: React.ReactNode
  /** Label shown after a successful copy. Falls back to children when omitted. */
  copiedChildren?: React.ReactNode
}

const sizeMap: Record<
  SizeVariant,
  { iconOnly: string; withLabel: string; icon: number }
> = {
  sm: {
    iconOnly: 'h-8 w-8',
    withLabel: 'h-8 px-2.5 gap-1.5 text-xs',
    icon: 14,
  },
  default: {
    iconOnly: 'h-9 w-9',
    withLabel: 'h-9 px-3 gap-2 text-sm',
    icon: 16,
  },
  lg: {
    iconOnly: 'h-12 w-12',
    withLabel: 'h-12 px-5 gap-2.5 text-base',
    icon: 20,
  },
}

const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      value,
      size = 'default',
      timeout = 1500,
      copyIcon,
      copiedIcon,
      onCopy,
      onCopyError,
      className,
      disabled,
      onClick,
      children,
      copiedChildren,
      ...props
    },
    ref,
  ) => {
    const [copied, setCopied] = React.useState<boolean>(false)

    const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      try {
        const text = typeof value === 'function' ? await value() : value
        if (text) {
          await navigator.clipboard.writeText(text)
          onCopy?.(text)
        }
        setCopied(true)
        setTimeout(() => setCopied(false), timeout)
      } catch (error) {
        onCopyError?.(error)
      }
    }

    const { iconOnly, withLabel, icon: iconSize } = sizeMap[size]
    const hasLabel = children != null && children !== false

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        disabled={copied || disabled}
        className={cn(
          'relative cursor-pointer active:scale-[0.97] transition-all ease-out duration-200 inline-flex items-center justify-center rounded-md text-neutral-900 disabled:pointer-events-none disabled:opacity-100 dark:text-neutral-50',
          hasLabel ? withLabel : iconOnly,
          className,
        )}
        {...props}
      >
        <span
          className="relative inline-flex shrink-0 items-center justify-center"
          style={{ width: iconSize, height: iconSize }}
        >
          <span
            className={cn(
              'inline-flex transition-all duration-200',
              copied
                ? 'scale-100 opacity-100 blur-none'
                : 'scale-70 opacity-0 blur-[2px]',
            )}
          >
            {copiedIcon ?? (
              <CheckIcon size={iconSize} strokeWidth={2} aria-hidden="true" />
            )}
          </span>
          <span
            className={cn(
              'absolute inset-0 inline-flex items-center justify-center transition-all duration-200',
              copied
                ? 'scale-0 opacity-0 blur-[2px]'
                : 'scale-100 opacity-100 blur-none',
            )}
          >
            {copyIcon ?? (
              <CopyIcon size={iconSize} strokeWidth={2} aria-hidden="true" />
            )}
          </span>
        </span>
        {hasLabel && (
          <span>{copied ? (copiedChildren ?? children) : children}</span>
        )}
      </button>
    )
  },
)

CopyButton.displayName = 'CopyButton'

export type { CopyButtonProps }
export { CopyButton }
