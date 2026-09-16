import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Row, RowData } from '@tanstack/react-table'
import { FlexRender } from '@tanstack/react-table'
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual'
import { cn } from 'cn'
import { TableCell, TableRow } from '@/components/ui/table'
import type { DataTableFeatures } from '@/lib/data-table-utils'
import { getCommonPinningStyles } from '@/lib/data-table-utils'

interface DraggableRowProps<TData extends RowData> {
  row: Row<DataTableFeatures, TData>
  rowId: string
  isEditing?: boolean
  virtualRow?: VirtualItem
  rowVirtualizer?: Virtualizer<HTMLDivElement, Element>
}

export function DataTableDraggableRow<TData extends RowData>({
  row,
  rowId,
  isEditing,
  virtualRow,
  rowVirtualizer,
}: DraggableRowProps<TData>) {
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    setActivatorNodeRef,
    listeners,
    attributes,
  } = useSortable({
    id: rowId,
    animateLayoutChanges: () => false,
  })

  return (
    <TableRow
      ref={(node) => {
        setNodeRef(node)
        if (virtualRow && rowVirtualizer) {
          rowVirtualizer.measureElement(node)
        }
      }}
      data-state={row.getIsSelected() && 'selected'}
      data-dragging={isDragging}
      data-index={virtualRow?.index}
      className={cn(
        'relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80',
        isEditing && 'bg-muted/50',
        isDragging && 'z-50 opacity-50',
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 1 : 0,
        position: 'relative',
      }}
    >
      {row.getVisibleCells().map((cell) => {
        const isPinned = cell.column.getIsPinned()
        const isDragColumn = cell.column.id === 'drag'

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
            ref={isDragColumn ? setActivatorNodeRef : undefined}
            {...(isDragColumn ? { ...listeners, ...attributes } : {})}
          >
            <FlexRender cell={cell} />
          </TableCell>
        )
      })}
    </TableRow>
  )
}
