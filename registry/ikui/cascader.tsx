'use client'

import { cn } from 'cn'
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'

export interface CascaderOption {
  value: string
  label: React.ReactNode
  textLabel?: string
  disabled?: boolean
  children?: CascaderOption[]
}

export interface CascaderProps {
  options: CascaderOption[]
  value?: string[]
  defaultValue?: string[]
  onChange?: (value: string[], selectedOptions: CascaderOption[]) => void
  placeholder?: string
  disabled?: boolean
  /** Trigger height, matching the Select component. */
  size?: 'sm' | 'default'
  allowClear?: boolean
  /**
   * When a value is selected, hide the dropdown arrow and show only the
   * clear button. Has no effect when `allowClear` is false.
   */
  clearReplacesArrow?: boolean
  className?: string
  popupClassName?: string
  expandTrigger?: 'click' | 'hover'
  displayRender?: (
    labels: string[],
    selectedOptions: CascaderOption[],
  ) => React.ReactNode
}

function getStringLabel(option: CascaderOption): string {
  if (option.textLabel) return option.textLabel
  if (typeof option.label === 'string') return option.label
  return option.value
}

const Cascader = React.forwardRef<HTMLDivElement, CascaderProps>(
  (
    {
      options,
      value,
      defaultValue,
      onChange,
      placeholder = 'Please select',
      disabled = false,
      size = 'default',
      allowClear = true,
      clearReplacesArrow = false,
      className,
      popupClassName,
      expandTrigger = 'click',
      displayRender,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false)
    const [internalValue, setInternalValue] = React.useState<string[]>(
      defaultValue || [],
    )
    const [expandedPath, setExpandedPath] = React.useState<string[]>([])
    const [focusedColumn, setFocusedColumn] = React.useState(0)
    const [focusedIndex, setFocusedIndex] = React.useState(0)
    const isMobile = useIsMobile()
    const scrollContainerRef = React.useRef<HTMLDivElement>(null)
    const columnRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
    // Deferred focus/scroll targets, flushed once the DOM has committed — avoids
    // the old magic setTimeout(50) that raced Popover/Drawer mount+paint.
    const pendingFocusRef = React.useRef<string | null>(null)
    const pendingScrollRef = React.useRef(false)

    React.useEffect(() => {
      if (!pendingFocusRef.current && !pendingScrollRef.current) return
      // rAF-after-commit: runs after the new column/popup content is laid out and
      // after Base UI's own open-focus, so our focus target reliably wins.
      const frame = requestAnimationFrame(() => {
        if (pendingScrollRef.current) {
          pendingScrollRef.current = false
          const el = scrollContainerRef.current
          if (el) {
            el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
          }
        }
        if (pendingFocusRef.current) {
          const key = pendingFocusRef.current
          pendingFocusRef.current = null
          columnRefs.current.get(key)?.focus()
        }
      })
      return () => cancelAnimationFrame(frame)
    })

    const selectedValue = value !== undefined ? value : internalValue

    const getColumns = React.useCallback(() => {
      const columns: CascaderOption[][] = [options]
      let currentOptions = options

      for (const val of expandedPath) {
        const found = currentOptions.find((opt) => opt.value === val)
        if (found?.children) {
          columns.push(found.children)
          currentOptions = found.children
        } else {
          break
        }
      }

      return columns
    }, [options, expandedPath])

    const getSelectedOptions = React.useCallback(
      (vals: string[]): CascaderOption[] => {
        const result: CascaderOption[] = []
        let currentOptions = options

        for (const val of vals) {
          const found = currentOptions.find((opt) => opt.value === val)
          if (found) {
            result.push(found)
            currentOptions = found.children || []
          } else {
            break
          }
        }

        return result
      },
      [options],
    )

    const selectedOptions = getSelectedOptions(selectedValue)
    const displayLabels = selectedOptions.map((opt) => getStringLabel(opt))

    const handleSelect = (
      option: CascaderOption,
      columnIndex: number,
      // Move focus into the child column's first item. Only keyboard expansion
      // does this (for arrow navigation); a mouse click leaves focus on the
      // clicked item so the child's first option isn't auto-highlighted.
      focusChild = false,
    ) => {
      if (option.disabled) return

      const newPath = [...expandedPath.slice(0, columnIndex), option.value]

      if (option.children && option.children.length > 0) {
        setExpandedPath(newPath)
        pendingScrollRef.current = true
        if (focusChild) {
          setFocusedColumn(columnIndex + 1)
          setFocusedIndex(0)
          pendingFocusRef.current = `${columnIndex + 1}-0`
        }
      } else {
        const newSelectedOptions = getSelectedOptions(newPath)
        if (value === undefined) {
          setInternalValue(newPath)
        }
        onChange?.(newPath, newSelectedOptions)
        setOpen(false)
        setExpandedPath([])
      }
    }

    const handleExpand = (option: CascaderOption, columnIndex: number) => {
      if (option.disabled) return
      const newPath = [...expandedPath.slice(0, columnIndex), option.value]
      setExpandedPath(newPath)
      pendingScrollRef.current = true
    }

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (value === undefined) {
        setInternalValue([])
      }
      onChange?.([], [])
      setExpandedPath([])
      setOpen(false)
    }

    const handleKeyDown = (
      e: React.KeyboardEvent,
      option: CascaderOption,
      columnIndex: number,
      itemIndex: number,
      columns: CascaderOption[][],
    ) => {
      const column = columns[columnIndex]
      const hasChildren = option.children && option.children.length > 0

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (itemIndex < column.length - 1) {
            const nextIndex = itemIndex + 1
            setFocusedIndex(nextIndex)
            const key = `${columnIndex}-${nextIndex}`
            columnRefs.current.get(key)?.focus()
          }
          break

        case 'ArrowUp':
          e.preventDefault()
          if (itemIndex > 0) {
            const prevIndex = itemIndex - 1
            setFocusedIndex(prevIndex)
            const key = `${columnIndex}-${prevIndex}`
            columnRefs.current.get(key)?.focus()
          }
          break

        case 'ArrowRight':
        case 'Enter':
          e.preventDefault()
          if (!option.disabled) {
            if (hasChildren) {
              handleSelect(option, columnIndex, true)
            } else if (e.key === 'Enter') {
              handleSelect(option, columnIndex)
            }
          }
          break

        case 'ArrowLeft':
        case 'Backspace':
          e.preventDefault()
          if (columnIndex > 0) {
            const newPath = expandedPath.slice(0, columnIndex - 1)
            setExpandedPath(newPath)
            setFocusedColumn(columnIndex - 1)
            const parentColumn = columns[columnIndex - 1]
            const parentValue = expandedPath[columnIndex - 1]
            const parentIndex = parentColumn.findIndex(
              (opt) => opt.value === parentValue,
            )
            setFocusedIndex(parentIndex >= 0 ? parentIndex : 0)
            pendingFocusRef.current = `${columnIndex - 1}-${parentIndex >= 0 ? parentIndex : 0}`
          }
          break

        case 'Escape':
          e.preventDefault()
          setOpen(false)
          setExpandedPath([])
          break

        case 'Tab':
          if (
            !e.shiftKey &&
            hasChildren &&
            expandedPath[columnIndex] === option.value
          ) {
            e.preventDefault()
            setFocusedColumn(columnIndex + 1)
            setFocusedIndex(0)
            const key = `${columnIndex + 1}-0`
            columnRefs.current.get(key)?.focus()
          } else if (e.shiftKey && columnIndex > 0) {
            e.preventDefault()
            const parentColumn = columns[columnIndex - 1]
            const parentValue = expandedPath[columnIndex - 1]
            const parentIndex = parentColumn.findIndex(
              (opt) => opt.value === parentValue,
            )
            setFocusedColumn(columnIndex - 1)
            setFocusedIndex(parentIndex >= 0 ? parentIndex : 0)
            const key = `${columnIndex - 1}-${parentIndex >= 0 ? parentIndex : 0}`
            columnRefs.current.get(key)?.focus()
          }
          break
      }
    }

    const displayValue =
      displayLabels.length > 0
        ? displayRender
          ? displayRender(displayLabels, selectedOptions)
          : displayLabels.join(' / ')
        : null

    const showClear = allowClear && !!displayValue && !disabled
    const showArrow = !clearReplacesArrow || !showClear

    const triggerElement = (
      <div
        ref={ref}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        data-size={size}
        className={cn(
          'flex w-[200px] cursor-pointer items-center justify-between gap-1.5 whitespace-nowrap rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm outline-none transition-colors select-none',
          'data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)]',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
          'dark:bg-input/30 dark:hover:bg-input/50',
          !displayValue && 'text-muted-foreground',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!disabled) setOpen(!open)
          }
        }}
      >
        <span className="flex-1 truncate text-left font-normal">
          {displayValue || placeholder}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {showClear && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="opacity-60 hover:opacity-100"
              onClick={handleClear}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="Clear selection"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
          {showArrow && (
            <ChevronDown
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    )

    const columns = getColumns()

    const columnsContent = (
      <div
        ref={scrollContainerRef}
        className={cn('flex', isMobile && 'overflow-x-auto')}
        role="listbox"
        aria-label={placeholder}
      >
        {columns.map((column, columnIndex) => (
          <div
            key={columnIndex === 0 ? 'root' : expandedPath[columnIndex - 1]}
            role="group"
            aria-label={`Level ${columnIndex + 1}`}
            className={cn(
              'max-h-[300px] min-w-[130px] shrink-0 overflow-auto p-1 space-y-0.5',
              columnIndex !== columns.length - 1 && 'border-r border-border',
            )}
          >
            {column.map((option, itemIndex) => {
              const isExpanded = expandedPath[columnIndex] === option.value
              // The whole parent path has to match: options under different
              // parents may share the same value, so comparing only the value at
              // this level would mark a sibling branch's child as selected.
              const isSelected =
                selectedValue[columnIndex] === option.value &&
                expandedPath
                  .slice(0, columnIndex)
                  .every((val, index) => val === selectedValue[index])
              const hasChildren = option.children && option.children.length > 0
              const isFocused =
                focusedColumn === columnIndex && focusedIndex === itemIndex
              const refKey = `${columnIndex}-${itemIndex}`

              return (
                <div
                  key={option.value}
                  ref={(el) => {
                    if (el) {
                      columnRefs.current.set(refKey, el)
                    } else {
                      columnRefs.current.delete(refKey)
                    }
                  }}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  tabIndex={isFocused && open ? 0 : -1}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-sm outline-hidden select-none',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:bg-accent focus:text-accent-foreground',
                    (isSelected || isExpanded) &&
                      'bg-accent text-accent-foreground',
                    option.disabled && 'pointer-events-none opacity-50',
                  )}
                  onClick={() => handleSelect(option, columnIndex)}
                  onKeyDown={(e) =>
                    handleKeyDown(e, option, columnIndex, itemIndex, columns)
                  }
                  onMouseEnter={() => {
                    if (expandTrigger !== 'hover') return
                    if (hasChildren) {
                      handleExpand(option, columnIndex)
                    } else if (expandedPath.length > columnIndex) {
                      // Leaf option: collapse the columns left over from the
                      // previously hovered parent, otherwise they keep hanging
                      // to the right as if this option had children.
                      setExpandedPath(expandedPath.slice(0, columnIndex))
                    }
                  }}
                  onFocus={() => {
                    setFocusedColumn(columnIndex)
                    setFocusedIndex(itemIndex)
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {hasChildren && (
                    <ChevronRight
                      className="h-4 w-4 shrink-0 opacity-50"
                      aria-hidden="true"
                    />
                  )}
                  {!hasChildren && isSelected && (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )

    const handleOpenChange = (newOpen: boolean) => {
      setOpen(newOpen)
      if (newOpen) {
        setExpandedPath(
          selectedValue.slice(0, -1).length > 0
            ? selectedValue.slice(0, -1)
            : selectedValue,
        )
        setFocusedColumn(0)
        // Start keyboard navigation on the selected root option instead of the
        // first one, so arrow keys continue from the current selection.
        const selectedRootIndex = options.findIndex(
          (option) => option.value === selectedValue[0],
        )
        setFocusedIndex(selectedRootIndex >= 0 ? selectedRootIndex : 0)
      } else {
        setExpandedPath([])
      }
    }

    if (isMobile) {
      return (
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerTrigger asChild>{triggerElement}</DrawerTrigger>
          <DrawerContent className={cn('px-0', popupClassName)}>
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-sm font-medium">
                {placeholder}
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6">{columnsContent}</div>
          </DrawerContent>
        </Drawer>
      )
    }

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger render={triggerElement} nativeButton={false} />
        <PopoverContent
          className={cn('w-auto p-0', popupClassName)}
          align="start"
          // Only pre-focus (and thus highlight) the first option when opened via
          // keyboard, so arrow-key navigation works. Mouse/touch opens leave
          // focus put so nothing looks pre-selected.
          initialFocus={(type) => type === 'keyboard'}
        >
          {columnsContent}
        </PopoverContent>
      </Popover>
    )
  },
)

Cascader.displayName = 'Cascader'

export { Cascader }
