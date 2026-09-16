import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { getStatusColor } from '@/lib/data-table-cell-utils'

export function DataTableCellStatusCode({
  value,
  color,
}: {
  value: number
  color?: string
}) {
  const colors = getStatusColor(value)
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-sm font-mono font-normal',
        !color && cn(colors.text, colors.bg, colors.border),
      )}
      style={
        color
          ? {
              color,
              backgroundColor: `${color}1a`,
              borderColor: `${color}33`,
            }
          : undefined
      }
    >
      {value}
    </Badge>
  )
}
