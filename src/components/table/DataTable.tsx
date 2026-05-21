'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import { Fragment, useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';

import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';
import type { ColumnType, ColumnSchema } from '@/types';

type RowData = Record<string, string>;

function EditableCell({
  initialValue,
  rowId,
  columnId,
  columnType,
}: {
  initialValue: string;
  rowId: number;
  columnId: string;
  columnType: ColumnType;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateDataTabRow = useAppStore((s) => s.updateDataTabRow);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = async () => {
    setIsEditing(false);
    if (value === initialValue) return;

    // Optimistic update
    updateDataTabRow(rowId, columnId, value);

    try {
      const res = await fetch('/api/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ __rowid: rowId, column: columnId, value }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch (err) {
      // Rollback
      updateDataTabRow(rowId, columnId, initialValue);
      setValue(initialValue);
      toast.error('Ghi dữ liệu thất bại');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setValue(initialValue);
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <div
        className={`flex h-full min-h-[24px] w-full cursor-pointer items-center px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 ${columnType === 'number' ? 'justify-end' : ''}`}
        onClick={() => setIsEditing(true)}
      >
        {value}
      </div>
    );
  }

  const typeMap: Record<string, string> = {
    number: 'number',
    date: 'date',
    string: 'text',
    category: 'text',
    boolean: 'text',
  };

  return (
    <input
      ref={inputRef}
      type={typeMap[columnType] || 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      className={`h-full w-full rounded-sm border-2 border-blue-500 bg-background px-1.5 py-0.5 text-foreground focus:outline-none ${columnType === 'number' ? 'text-right' : ''}`}
    />
  );
}

function buildColumns(headers: string[], schema: ColumnSchema[]): ColumnDef<RowData>[] {
  const cols: ColumnDef<RowData>[] = [];

  // 1. Row number column
  cols.push({
    id: '_rowIndex',
    header: '',
    cell: (info) => (
      <div className="w-8 select-none text-center text-xs text-foreground/50">
        {info.row.index + 1}
      </div>
    ),
    enableSorting: false,
    enableColumnFilter: false,
  });

  // 2. Data columns
  headers.forEach((header) => {
    const colSchema = schema.find((s) => s.name === header);
    const colType = colSchema?.type || 'string';

    cols.push({
      id: header,
      accessorFn: (row) => row[header] ?? '',
      header: () => (
        <div className="flex items-center gap-2">
          <span>{header}</span>
          <span className="font-normal text-foreground/40 text-xs">
            {colType === 'number' ? '123' : colType === 'date' ? '📅' : 'Abc'}
          </span>
        </div>
      ),
      enableSorting: true,
      filterFn: (row, columnId, filterValue) => {
        const raw = filterValue as string | undefined;
        if (raw == null || String(raw).trim() === '') return true;
        const cell = String(row.getValue(columnId) ?? '').toLowerCase();
        return cell.includes(String(raw).toLowerCase());
      },
      cell: (info) => {
        const val = info.getValue() as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowId = (info.row.original as any).__rowid as number;
        if (rowId === undefined) return val; // Fallback if no __rowid
        return (
          <EditableCell
            initialValue={val}
            rowId={rowId}
            columnId={header}
            columnType={colType}
          />
        );
      },
    });
  });

  return cols;
}

function TableSkeleton({ columnCount }: { columnCount: number }) {
  const cols = Math.max(columnCount, 6);
  return (
    <div className="w-full overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <thead className="border-b border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/5">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="min-w-[120px] px-3 py-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-black/10 dark:bg-white/15" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} className="border-b border-black/5 last:border-0 dark:border-white/10">
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="min-w-[120px] px-3 py-2">
                    <div className="h-4 w-full max-w-40 animate-pulse rounded bg-black/10 dark:bg-white/10" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DataTable() {
  const { csv, isLoading: isUploadLoading } = useCSVData();
  const dataTabRows = useAppStore((s) => s.dataTabRows);
  const setDataTabRows = useAppStore((s) => s.setDataTabRows);
  const appendDataTabRows = useAppStore((s) => s.appendDataTabRows);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchRows = async (currentOffset: number, append = false) => {
    if (append) setIsLoadingMore(true);
    else setIsInitialLoading(true);

    try {
      const res = await fetch(`/api/data?limit=100&offset=${currentOffset}`);
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      if (append) {
        appendDataTabRows(data.rows);
      } else {
        setDataTabRows(data.rows);
      }
      setOffset(currentOffset + data.rows.length);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    if (csv) {
      fetchRows(0, false);
    } else {
      setDataTabRows([]);
      setOffset(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csv?.rowCount]);

  const columns = useMemo(
    () => (csv ? buildColumns(csv.headers, csv.schema) : []),
    [csv],
  );

  const table = useReactTable({
    data: dataTabRows,
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!csv && !isUploadLoading) {
    return (
      <div
        className="flex min-h-[200px] w-full items-center justify-center rounded-xl border border-dashed border-black/15 bg-black/2 text-sm text-foreground/60 dark:border-white/20 dark:bg-white/4"
        role="status"
      >
        No data
      </div>
    );
  }

  if (isUploadLoading || isInitialLoading) {
    return <TableSkeleton columnCount={csv?.headers.length ?? 0} />;
  }

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalInFile = csv!.rowCount;
  const isFiltered = filteredCount !== dataTabRows.length;
  const hasMore = offset < totalInFile;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-black/10 bg-background dark:border-white/15">
              {table.getHeaderGroups().map((headerGroup) => (
                <Fragment key={headerGroup.id}>
                  <tr>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={`px-3 py-2 font-medium text-foreground ${header.id === '_rowIndex' ? 'w-12 bg-black/5 dark:bg-white/5' : 'min-w-[120px]'}`}
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            className="inline-flex w-full items-center gap-1 text-left hover:underline"
                            onClick={header.column.getToggleSortingHandler()}
                            disabled={!header.column.getCanSort()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getIsSorted() === 'asc' ? (
                              <span className="text-foreground/50" aria-hidden>
                                ▲
                              </span>
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <span className="text-foreground/50" aria-hidden>
                                ▼
                              </span>
                            ) : null}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={`${header.id}-filter`}
                        className={`px-3 pb-2 pt-0 ${header.id === '_rowIndex' ? 'w-12 bg-black/5 dark:bg-white/5' : 'min-w-[120px]'}`}
                      >
                        {header.column.getCanFilter() ? (
                          <>
                            <label className="sr-only" htmlFor={`filter-${header.id}`}>
                              Filter {String(header.column.columnDef.header)}
                            </label>
                            <input
                              id={`filter-${header.id}`}
                              type="search"
                              value={(header.column.getFilterValue() as string) ?? ''}
                              onChange={(e) =>
                                header.column.setFilterValue(e.target.value)
                              }
                              placeholder="Filter…"
                              className="w-full min-w-[120px] rounded-md border border-black/15 bg-background px-2 py-1 text-xs text-foreground placeholder:text-foreground/40 focus:border-black/30 focus:outline-none dark:border-white/20 dark:focus:border-white/40"
                            />
                          </>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={(csv?.headers.length || 0) + 1}
                    className="px-3 py-8 text-center text-foreground/60"
                  >
                    No rows match the current filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-black/5 last:border-0 hover:bg-black/2 dark:border-white/10 dark:hover:bg-white/2"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`max-w-[320px] truncate p-0 align-top text-foreground/90 ${cell.column.id === '_rowIndex' ? 'w-12 bg-black/5 dark:bg-white/5 px-2 py-2' : 'min-w-[120px]'}`}
                        title={String(cell.getValue() ?? '')}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {hasMore && !isFiltered && (
            <div className="flex w-full items-center justify-center p-4">
              <button
                type="button"
                onClick={() => fetchRows(offset, true)}
                disabled={isLoadingMore}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
              >
                {isLoadingMore ? 'Loading...' : 'Load More Rows'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-xs text-foreground/70 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p>
          <span className="font-medium text-foreground/80">Total in file:</span>{' '}
          {totalInFile.toLocaleString()}
          <span className="text-foreground/50"> · </span>
          <span className="font-medium text-foreground/80">Loaded:</span>{' '}
          {dataTabRows.length.toLocaleString()}
          {isFiltered ? (
            <>
              {' '}
              <span className="text-foreground/50">·</span>{' '}
              <span className="font-medium text-foreground/80">
                Matches filter:
              </span>{' '}
              {filteredCount.toLocaleString()}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

