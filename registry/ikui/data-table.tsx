'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ReactTable, RowData } from '@tanstack/react-table'
import { FlexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from 'cn'
import * as React from 'react'
import { DataTableDraggableRow } from '@/components/data-table-draggable-row'
import { DataTablePagination } from '@/components/data-table-pagination'
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DataTableFeatures } from '@/lib/data-table-utils'
import { getCommonPinningStyles } from '@/lib/data-table-utils'

interface DataTableProps<TData extends RowData>
  extends Omit<React.ComponentProps<'div'>, 'onDragEnd'> {
  table: ReactTable<DataTableFeatures, TData>
  actionBar?: React.ReactNode
  editingRowId?: number | null
  getRowId?: (row: TData) => number | string
  enableVirtualization?: boolean
  estimateRowSize?: number
  pageSizeOptions?: number[]
  /**
   * Show the pagination footer. Defaults to whether the table registered a
   * `paginatedRowModel`: `rowPaginationFeature` alone gives the table pagination
   * state and page-count APIs but no row slicing, so a footer rendered without
   * the row model would page a table that never changes rows.
   */
  showPagination?: boolean
  totalCount?: number
  enableDragAndDrop?: boolean
  onDragEnd?: (event: DragEndEvent) => void
  footer?: React.ReactNode
  emptyState?: React.ReactNode
}

export function DataTable<TData extends RowData>({
  table,
  actionBar,
  editingRowId,
  getRowId,
  enableVirtualization = true,
  estimateRowSize = 80,
  pageSizeOptions,
  showPagination = 'paginatedRowModel' in table.options.features,
  totalCount,
  enableDragAndDrop = false,
  onDragEnd,
  footer,
  emptyState,
  className,
  children,
}: DataTableProps<TData>) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const { rows } = table.getRowModel()

  const shouldUseVirtualization = enableVirtualization && rows.length > 20

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateRowSize,
    measureElement:
      typeof window !== 'undefined' &&
      navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 5,
    enabled: shouldUseVirtualization,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)
      : 0

  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  )

  // Row ids used by the sortable context when drag-and-drop is enabled.
  const dataIds = rows.map((row) => {
    if (getRowId) {
      return String(getRowId(row.original))
    }
    return row.id
  })

  const renderTableBody = () => {
    if (!rows.length) {
      return (
        <TableRow>
          <TableCell
            colSpan={table.getVisibleLeafColumns().length}
            className="h-24 text-center"
          >
            {emptyState ?? (
              <span className="text-sm text-muted-foreground">No results.</span>
            )}
          </TableCell>
        </TableRow>
      )
    }

    // Virtualized rendering.
    if (shouldUseVirtualization) {
      return (
        <>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: `${paddingTop}px` }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index]
            const rowId = getRowId ? String(getRowId(row.original)) : row.id
            const isEditing =
              editingRowId !== null && editingRowId === Number(rowId)

            return enableDragAndDrop ? (
              <DataTableDraggableRow
                key={row.id}
                row={row}
                rowId={rowId}
                isEditing={isEditing}
                virtualRow={virtualRow}
                rowVirtualizer={rowVirtualizer}
              />
            ) : (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                data-index={virtualRow.index}
                ref={(node) => rowVirtualizer.measureElement(node)}
                className={cn(isEditing && 'bg-muted/50')}
              >
                {row.getVisibleCells().map((cell) => {
                  const isPinned = cell.column.getIsPinned()
                  return (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getCommonPinningStyles({
                          column: cell.column,
                          withBorder: true,
                        }),
                      }}
                      className={cn(isPinned && 'z-10 bg-background')}
                    >
                      <FlexRender cell={cell} />
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: `${paddingBottom}px` }} />
            </tr>
          )}
        </>
      )
    }

    // Standard rendering.
    return rows.map((row) => {
      const rowId = getRowId ? String(getRowId(row.original)) : row.id
      const isEditing = editingRowId !== null && editingRowId === Number(rowId)

      return enableDragAndDrop ? (
        <DataTableDraggableRow
          key={row.id}
          row={row}
          rowId={rowId}
          isEditing={isEditing}
        />
      ) : (
        <TableRow
          key={row.id}
          data-state={row.getIsSelected() && 'selected'}
          className={cn(isEditing && 'bg-muted/50')}
        >
          {row.getVisibleCells().map((cell) => {
            const isPinned = cell.column.getIsPinned()
            return (
              <TableCell
                key={cell.id}
                style={{
                  ...getCommonPinningStyles({
                    column: cell.column,
                    withBorder: true,
                  }),
                }}
                className={cn(isPinned && 'z-10 bg-background')}
              >
                <FlexRender cell={cell} />
              </TableCell>
            )
          })}
        </TableRow>
      )
    })
  }

  const tableContent = (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      {children}
      <div
        ref={scrollContainerRef}
        data-slot="table-container"
        className="relative min-h-0 flex-1 overflow-auto rounded-lg border"
      >
        <table
          data-slot="table"
          className={cn(
            'w-full caption-bottom border-separate border-spacing-0 text-sm',
            className,
          )}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="sticky top-0 z-30 border-b"
              >
                {headerGroup.headers.map((header) => {
                  const isPinned = header.column.getIsPinned()
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        ...getCommonPinningStyles({
                          column: header.column,
                          withBorder: true,
                          isHeader: true,
                        }),
                      }}
                      className={cn('bg-muted', isPinned && 'z-40 bg-muted')}
                    >
                      {header.isPlaceholder ? null : (
                        <FlexRender header={header} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {enableDragAndDrop ? (
              <SortableContext
                items={dataIds}
                strategy={verticalListSortingStrategy}
              >
                {renderTableBody()}
              </SortableContext>
            ) : (
              renderTableBody()
            )}
          </TableBody>
          {footer && rows.length > 0 && <TableFooter>{footer}</TableFooter>}
        </table>
      </div>
      {(showPagination || actionBar) && (
        <div className="flex flex-col gap-2.5">
          {showPagination && (
            <DataTablePagination
              table={table}
              totalCount={totalCount}
              pageSizeOptions={pageSizeOptions}
            />
          )}
          {actionBar &&
            table.getFilteredSelectedRowModel().rows.length > 0 &&
            actionBar}
        </div>
      )}
    </div>
  )

  if (enableDragAndDrop && onDragEnd) {
    return (
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
        sensors={sensors}
        id={sortableId}
      >
        {tableContent}
      </DndContext>
    )
  }

  return tableContent
}
