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
import { useAuthStore } from '@/store/authStore';
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
        },
        body: JSON.stringify({ __rowid: rowId, column: columnId, value, fileId: useAppStore.getState().currentFileId }),
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
        className={`flex h-full min-h-[24px] w-full cursor-pointer items-center px-2 py-1 hover:bg-[var(--color-surface-2)] ${columnType === 'number' ? 'justify-end font-[family-name:var(--font-mono)]' : ''}`}
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
      className={`h-full w-full rounded-sm outline-2 outline-[var(--color-accent)] bg-[var(--color-accent-muted)] px-1.5 py-0.5 text-[var(--color-text)] focus:outline-none ${columnType === 'number' ? 'text-right font-[family-name:var(--font-mono)]' : ''}`}
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
      <div className="w-8 select-none text-center text-xs bg-[var(--color-surface)] text-[var(--color-text-faint)] font-[family-name:var(--font-mono)]">
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
          <span className="font-normal text-[var(--color-text-faint)] text-xs">
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
    <div className="w-full overflow-hidden rounded-xl border border-[var(--color-border)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="min-w-[120px] px-3 py-2">
                  <div className="h-4 w-24 skeleton rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[var(--color-bg)]">
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} className="border-b border-[var(--color-border)] last:border-0">
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="min-w-[120px] px-3 py-2">
                    <div className="h-4 w-full max-w-40 skeleton rounded" />
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

  const currentFileId = useAppStore((s) => s.currentFileId);
  const refreshTrigger = useAppStore((s) => s.refreshTrigger);

  const fetchRows = async (currentOffset: number, append = false) => {
    if (!currentFileId) return;
    if (append) setIsLoadingMore(true);
    else setIsInitialLoading(true);

    try {
      const res = await fetch(`/api/data?fileId=${currentFileId}&limit=100&offset=${currentOffset}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` }
      });
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
    if (csv && currentFileId) {
      fetchRows(0, false);
    } else {
      setDataTabRows([]);
      setOffset(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFileId, refreshTrigger]);

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
        className="flex min-h-[200px] w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm text-[var(--color-text-muted)]"
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
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <Fragment key={headerGroup.id}>
                  <tr>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={`px-3 py-2 font-medium ${header.id === '_rowIndex' ? 'w-12 bg-[var(--color-surface)]' : 'min-w-[120px]'}`}
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
                              <span className="text-[var(--color-text-faint)]" aria-hidden>
                                ▲
                              </span>
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <span className="text-[var(--color-text-faint)]" aria-hidden>
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
                        className={`px-3 pb-2 pt-0 ${header.id === '_rowIndex' ? 'w-12 bg-[var(--color-surface)]' : 'min-w-[120px]'}`}
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
                              className="w-full min-w-[120px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)] focus:outline-none"
                            />
                          </>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </thead>
            <tbody className="bg-[var(--color-bg)]">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={(csv?.headers.length || 0) + 1}
                    className="px-3 py-8 text-center text-[var(--color-text-muted)]"
                  >
                    No rows match the current filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`max-w-[320px] truncate p-0 align-top text-[var(--color-text)] ${cell.column.id === '_rowIndex' ? 'w-12 bg-[var(--color-surface)] px-2 py-2' : 'min-w-[120px]'}`}
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
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50 text-[var(--color-text)]"
              >
                {isLoadingMore ? 'Loading...' : 'Load More Rows'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-xs text-[var(--color-text-muted)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p>
          <span className="font-medium text-[var(--color-text)]">Total in file:</span>{' '}
          {totalInFile.toLocaleString()}
          <span className="text-[var(--color-text-faint)]"> · </span>
          <span className="font-medium text-[var(--color-text)]">Loaded:</span>{' '}
          {dataTabRows.length.toLocaleString()}
          {isFiltered ? (
            <>
              {' '}
              <span className="text-[var(--color-text-faint)]">·</span>{' '}
              <span className="font-medium text-[var(--color-text)]">
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

