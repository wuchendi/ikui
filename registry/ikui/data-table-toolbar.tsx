'use client'

import type { Column, ReactTable, RowData } from '@tanstack/react-table'
import { cn } from 'cn'
import { X as Cross2Icon } from 'lucide-react'
import * as React from 'react'
import { DataTableDateFilter } from '@/components/data-table-date-filter'
import { DataTableFacetedFilter } from '@/components/data-table-faceted-filter'
import { DataTableSliderFilter } from '@/components/data-table-slider-filter'
import { DataTableViewOptions } from '@/components/data-table-view-options'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import type { DataTableFeatures } from '@/lib/data-table-utils'

interface DataTableToolbarProps<TData extends RowData>
  extends React.ComponentProps<'div'> {
  table: ReactTable<DataTableFeatures, TData>
}

export function DataTableToolbar<TData extends RowData>({
  table,
  children,
  className,
  ...props
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.state.columnFilters.length > 0

  const columns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table],
  )

  const onReset = React.useCallback(() => {
    table.resetColumnFilters()
  }, [table])

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        'flex w-full items-start justify-between gap-2 p-1',
        className,
      )}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {columns.map((column) => (
          <DataTableToolbarFilter key={column.id} column={column} />
        ))}
        {isFiltered && (
          <Button
            aria-label="Reset filters"
            variant="outline"
            size="sm"
            className="border-dashed"
            onClick={onReset}
          >
            <Cross2Icon />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}

interface DataTableToolbarFilterProps<TData extends RowData> {
  column: Column<DataTableFeatures, TData>
}

function DataTableToolbarFilter<TData extends RowData>({
  column,
}: DataTableToolbarFilterProps<TData>) {
  const columnMeta = column.columnDef.meta

  const onFilterRender = React.useCallback(() => {
    if (!columnMeta?.variant) return null

    switch (columnMeta.variant) {
      case 'text':
        return (
          <Input
            placeholder={columnMeta.placeholder ?? columnMeta.label}
            value={(column.getFilterValue() as string) ?? ''}
            onChange={(event) => column.setFilterValue(event.target.value)}
            className="h-8 w-40 lg:w-56"
          />
        )

      case 'number':
        return (
          <InputGroup className="w-[120px]">
            <InputGroupInput
              type="number"
              inputMode="numeric"
              placeholder={columnMeta.placeholder ?? columnMeta.label}
              value={(column.getFilterValue() as string) ?? ''}
              onChange={(event) => column.setFilterValue(event.target.value)}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {columnMeta.unit && (
              <InputGroupAddon align="inline-end">
                <InputGroupText>{columnMeta.unit}</InputGroupText>
              </InputGroupAddon>
            )}
          </InputGroup>
        )

      case 'range':
        return (
          <DataTableSliderFilter
            column={column}
            title={columnMeta.label ?? column.id}
          />
        )

      case 'date':
      case 'dateRange':
        return (
          <DataTableDateFilter
            column={column}
            title={columnMeta.label ?? column.id}
            multiple={columnMeta.variant === 'dateRange'}
          />
        )

      case 'select':
      case 'multiSelect':
        return (
          <DataTableFacetedFilter
            column={column}
            title={columnMeta.label ?? column.id}
            options={columnMeta.options ?? []}
            multiple={columnMeta.variant === 'multiSelect'}
          />
        )

      default:
        return null
    }
  }, [column, columnMeta])

  return onFilterRender()
}
