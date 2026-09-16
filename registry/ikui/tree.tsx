'use client'

import { cn } from 'cn'
import { ChevronRight } from 'lucide-react'
import * as React from 'react'

export interface TreeDataItem {
  id: string
  name: string
  icon?: React.ComponentType<{ className?: string }>
  selectedIcon?: React.ComponentType<{ className?: string }>
  openIcon?: React.ComponentType<{ className?: string }>
  children?: TreeDataItem[]
  actions?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  /** Allow this node to be picked up as a drag source. */
  draggable?: boolean
  /** Allow this node to receive a drop. Defaults to true. */
  droppable?: boolean
  className?: string
}

export interface TreeRenderItemParams {
  item: TreeDataItem
  level: number
  isLeaf: boolean
  isSelected: boolean
  isOpen?: boolean
  hasChildren: boolean
}

export interface TreeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  data: TreeDataItem[] | TreeDataItem
  /** Controlled selected node id. */
  selectedId?: string
  /** Uncontrolled initial selected node id; its ancestors start expanded. */
  defaultSelectedId?: string
  /** @deprecated Use defaultSelectedId instead. */
  initialSelectedItemId?: string
  onSelectChange?: (item: TreeDataItem) => void
  expandAll?: boolean
  chevronPosition?: 'left' | 'right'
  defaultNodeIcon?: React.ComponentType<{ className?: string }>
  defaultLeafIcon?: React.ComponentType<{ className?: string }>
  renderItem?: (params: TreeRenderItemParams) => React.ReactNode
  /**
   * Fired when a `draggable` node is dropped onto another node (HTML5 native
   * drag-and-drop). Reorder / re-parent your `data` in the handler.
   */
  onDocumentDrag?: (source: TreeDataItem, target: TreeDataItem) => void
}

function collectExpandedIds(
  data: TreeDataItem[],
  selectedId: string | undefined,
  expandAll: boolean,
): Set<string> {
  const ids = new Set<string>()

  function walk(items: TreeDataItem[]): boolean {
    let found = false
    for (const item of items) {
      const hasChildren = !!item.children?.length
      const isTarget = item.id === selectedId
      const childMatch = hasChildren && walk(item.children!)
      if (expandAll && hasChildren) {
        ids.add(item.id)
      } else if (hasChildren && (childMatch || isTarget)) {
        ids.add(item.id)
      }
      if (isTarget || childMatch) found = true
    }
    return found
  }

  walk(data)
  return ids
}

interface FlatNode {
  item: TreeDataItem
  level: number
  parentId?: string
  hasChildren: boolean
}

/** Depth-first list of the currently visible nodes, in visual order. */
function flattenVisible(
  items: TreeDataItem[],
  expandedIds: Set<string>,
): FlatNode[] {
  const out: FlatNode[] = []

  function walk(list: TreeDataItem[], level: number, parentId?: string) {
    for (const item of list) {
      const hasChildren = !!item.children?.length
      out.push({ item, level, parentId, hasChildren })
      if (hasChildren && expandedIds.has(item.id)) {
        walk(item.children!, level + 1, item.id)
      }
    }
  }

  walk(items, 0, undefined)
  return out
}

function getIcon(
  item: TreeDataItem,
  isOpen: boolean,
  isSelected: boolean,
  fallback?: React.ComponentType<{ className?: string }>,
) {
  if (isSelected && item.selectedIcon) return item.selectedIcon
  if (isOpen && item.openIcon) return item.openIcon
  return item.icon ?? fallback
}

interface TreeContextValue {
  selectedItemId?: string
  tabbableId?: string
  expandedIds: Set<string>
  select: (item: TreeDataItem) => void
  setExpanded: (id: string, open: boolean) => void
  focusNode: (id: string) => void
  defaultNodeIcon?: React.ComponentType<{ className?: string }>
  defaultLeafIcon?: React.ComponentType<{ className?: string }>
  renderItem?: (params: TreeRenderItemParams) => React.ReactNode
  chevronPosition: 'left' | 'right'
  draggedId?: string
  startDrag: (item: TreeDataItem) => void
  dropOn: (item: TreeDataItem) => void
}

const TreeContext = React.createContext<TreeContextValue | null>(null)

function useTreeContext() {
  const ctx = React.useContext(TreeContext)
  if (!ctx) throw new Error('TreeNode must be used within a Tree')
  return ctx
}

interface TreeNodeProps {
  item: TreeDataItem
  level: number
}

function TreeNode({ item, level }: TreeNodeProps) {
  const {
    selectedItemId,
    tabbableId,
    expandedIds,
    select,
    setExpanded,
    focusNode,
    defaultNodeIcon,
    defaultLeafIcon,
    renderItem,
    chevronPosition,
    draggedId,
    startDrag,
    dropOn,
  } = useTreeContext()

  const [isDragOver, setIsDragOver] = React.useState(false)
  const hasChildren = !!item.children?.length
  const open = hasChildren && expandedIds.has(item.id)
  const isSelected = selectedItemId === item.id
  const isDroppable =
    item.droppable !== false &&
    !item.disabled &&
    !!draggedId &&
    draggedId !== item.id

  function handleDragStart(e: React.DragEvent) {
    if (!item.draggable || item.disabled) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', item.id)
    e.dataTransfer.effectAllowed = 'move'
    startDrag(item)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!isDroppable) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  function handleDrop(e: React.DragEvent) {
    if (!isDroppable) return
    e.preventDefault()
    setIsDragOver(false)
    dropOn(item)
  }
  const Icon = getIcon(
    item,
    open,
    isSelected,
    hasChildren ? defaultNodeIcon : defaultLeafIcon,
  )

  function handleClick() {
    if (item.disabled) return
    if (hasChildren) setExpanded(item.id, !open)
    select(item)
    focusNode(item.id)
    item.onClick?.()
  }

  const chevron = hasChildren ? (
    <ChevronRight
      className={cn(
        'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
        open && 'rotate-90',
        chevronPosition === 'left' ? 'mr-1' : 'ml-1',
      )}
    />
  ) : (
    chevronPosition === 'left' && <span className="mr-1 size-4 shrink-0" />
  )

  return (
    <li
      role="treeitem"
      data-tree-id={item.id}
      aria-selected={isSelected}
      aria-expanded={hasChildren ? open : undefined}
      aria-disabled={item.disabled || undefined}
      tabIndex={!item.disabled && tabbableId === item.id ? 0 : -1}
      className={cn(
        'outline-hidden',
        'focus-visible:[&>[data-tree-row]]:ring-2 focus-visible:[&>[data-tree-row]]:ring-ring/50',
      )}
    >
      <div
        data-tree-row
        onClick={handleClick}
        draggable={!!item.draggable && !item.disabled}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'group relative flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors',
          'hover:bg-accent/70',
          isSelected && 'bg-accent/70 text-accent-foreground',
          isDragOver && 'bg-primary/15 ring-1 ring-primary',
          item.disabled && 'pointer-events-none opacity-50',
          item.className,
        )}
      >
        {chevronPosition === 'left' && chevron}
        {renderItem ? (
          renderItem({
            item,
            level,
            isLeaf: !hasChildren,
            isSelected,
            isOpen: open,
            hasChildren,
          })
        ) : (
          <>
            {Icon && <Icon className="mr-2 size-4 shrink-0" />}
            <span className="grow truncate">{item.name}</span>
            {item.actions && (
              <span
                className={cn(
                  'ml-auto shrink-0 group-hover:opacity-100',
                  isSelected ? 'opacity-100' : 'opacity-0',
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {item.actions}
              </span>
            )}
          </>
        )}
        {chevronPosition === 'right' && chevron}
      </div>

      {hasChildren && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <ul className="ml-4 border-l border-border pl-1" role="group">
              {item.children!.map((child) => (
                <TreeNode key={child.id} item={child} level={level + 1} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  )
}

export function Tree({
  data,
  selectedId,
  defaultSelectedId,
  initialSelectedItemId,
  onSelectChange,
  expandAll = false,
  chevronPosition = 'left',
  defaultNodeIcon,
  defaultLeafIcon,
  renderItem,
  onDocumentDrag,
  className,
  ...props
}: TreeProps) {
  const items = React.useMemo(
    () => (Array.isArray(data) ? data : [data]),
    [data],
  )
  const [internalSelectedId, setInternalSelectedId] = React.useState(
    defaultSelectedId ?? initialSelectedItemId,
  )
  const currentSelectedId =
    selectedId !== undefined ? selectedId : internalSelectedId
  // Externally supplied selection intent: the controlled value, or the initial
  // uncontrolled default. Internal (uncontrolled) clicks deliberately do not
  // re-drive expansion, so this excludes `internalSelectedId`.
  const selectionSeed = selectedId ?? defaultSelectedId ?? initialSelectedItemId
  const [expandedIds, setExpandedIds] = React.useState(() =>
    collectExpandedIds(items, selectionSeed, expandAll),
  )
  const [activeId, setActiveId] = React.useState<string | undefined>(
    selectionSeed,
  )
  const [draggedItem, setDraggedItem] = React.useState<TreeDataItem | null>(
    null,
  )
  const rootRef = React.useRef<HTMLDivElement>(null)

  // Re-sync self-managed expansion whenever the driving inputs change, so a new
  // controlled `selectedId` / initial default, an `expandAll` toggle, or fresh
  // `data` takes effect on already-mounted nodes instead of being frozen at
  // first render.
  React.useEffect(() => {
    setExpandedIds(collectExpandedIds(items, selectionSeed, expandAll))
  }, [items, selectionSeed, expandAll])

  const visible = React.useMemo(
    () => flattenVisible(items, expandedIds),
    [items, expandedIds],
  )

  // Roving tabindex: exactly one node is tabbable. Prefer the active node while
  // it is still visible, otherwise fall back to the first focusable node.
  const tabbableId = React.useMemo(() => {
    if (
      activeId &&
      visible.some((v) => v.item.id === activeId && !v.item.disabled)
    )
      return activeId
    return visible.find((v) => !v.item.disabled)?.item.id
  }, [activeId, visible])

  const select = React.useCallback(
    (item: TreeDataItem) => {
      if (selectedId === undefined) setInternalSelectedId(item.id)
      onSelectChange?.(item)
    },
    [selectedId, onSelectChange],
  )

  const setExpanded = React.useCallback((id: string, open: boolean) => {
    setExpandedIds((prev) => {
      if (prev.has(id) === open) return prev
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const startDrag = React.useCallback((item: TreeDataItem) => {
    setDraggedItem(item)
  }, [])

  const dropOn = React.useCallback(
    (target: TreeDataItem) => {
      setDraggedItem((source) => {
        if (source && source.id !== target.id) {
          onDocumentDrag?.(source, target)
        }
        return null
      })
    },
    [onDocumentDrag],
  )

  const focusNode = React.useCallback((id: string) => {
    setActiveId(id)
    const root = rootRef.current
    if (!root) return
    const escaped = typeof CSS !== 'undefined' ? CSS.escape(id) : id
    root.querySelector<HTMLElement>(`[data-tree-id="${escaped}"]`)?.focus()
  }, [])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      const currentId = activeId ?? tabbableId
      const idx = visible.findIndex((v) => v.item.id === currentId)
      if (idx === -1) return
      const cur = visible[idx]

      const step = (from: number, dir: 1 | -1): FlatNode | undefined => {
        for (let i = from; i >= 0 && i < visible.length; i += dir) {
          if (!visible[i].item.disabled) return visible[i]
        }
        return undefined
      }

      switch (e.key) {
        case 'ArrowDown': {
          const next = step(idx + 1, 1)
          if (next) {
            e.preventDefault()
            focusNode(next.item.id)
          }
          break
        }
        case 'ArrowUp': {
          const prev = step(idx - 1, -1)
          if (prev) {
            e.preventDefault()
            focusNode(prev.item.id)
          }
          break
        }
        case 'ArrowRight': {
          if (cur.item.disabled) break
          e.preventDefault()
          if (cur.hasChildren && !expandedIds.has(cur.item.id)) {
            setExpanded(cur.item.id, true)
          } else if (cur.hasChildren) {
            const child = visible[idx + 1]
            if (child && !child.item.disabled) focusNode(child.item.id)
          }
          break
        }
        case 'ArrowLeft': {
          if (cur.item.disabled) break
          e.preventDefault()
          if (cur.hasChildren && expandedIds.has(cur.item.id)) {
            setExpanded(cur.item.id, false)
          } else if (cur.parentId) {
            focusNode(cur.parentId)
          }
          break
        }
        case 'Home': {
          const first = step(0, 1)
          if (first) {
            e.preventDefault()
            focusNode(first.item.id)
          }
          break
        }
        case 'End': {
          const last = step(visible.length - 1, -1)
          if (last) {
            e.preventDefault()
            focusNode(last.item.id)
          }
          break
        }
        case 'Enter':
        case ' ': {
          if (cur.item.disabled) break
          e.preventDefault()
          if (cur.hasChildren) {
            setExpanded(cur.item.id, !expandedIds.has(cur.item.id))
          }
          select(cur.item)
          cur.item.onClick?.()
          break
        }
      }
    },
    [
      activeId,
      tabbableId,
      visible,
      expandedIds,
      focusNode,
      setExpanded,
      select,
    ],
  )

  const contextValue = React.useMemo<TreeContextValue>(
    () => ({
      selectedItemId: currentSelectedId,
      tabbableId,
      expandedIds,
      select,
      setExpanded,
      focusNode,
      defaultNodeIcon,
      defaultLeafIcon,
      renderItem,
      chevronPosition,
      draggedId: draggedItem?.id,
      startDrag,
      dropOn,
    }),
    [
      currentSelectedId,
      tabbableId,
      expandedIds,
      select,
      setExpanded,
      focusNode,
      defaultNodeIcon,
      defaultLeafIcon,
      renderItem,
      chevronPosition,
      draggedItem,
      startDrag,
      dropOn,
    ],
  )

  return (
    <div ref={rootRef} className={cn('relative p-2', className)} {...props}>
      <TreeContext.Provider value={contextValue}>
        <ul role="tree" onKeyDown={handleKeyDown}>
          {items.map((item) => (
            <TreeNode key={item.id} item={item} level={0} />
          ))}
        </ul>
      </TreeContext.Provider>
    </div>
  )
}
