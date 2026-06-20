"use client";

import { useState } from "react";
import Papa from "papaparse";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Legend,
} from "recharts";

export interface NotebookCellData {
  id: string;
  prompt: string;
  code?: string;
  result?: unknown;
  insight?: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
  timestamp?: Date;
}

interface NotebookCellProps {
  cell: NotebookCellData;
  onDelete?: (id: string) => void;
}

interface ChartDataPoint {
  name: string | number;
  value: number;
}

interface ChartResult {
  type: "chart";
  chartType: "bar" | "line" | "pie" | "area";
  data: ChartDataPoint[];
  xLabel?: string;
  yLabel?: string;
}

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"];

function exportToCsv(data: Record<string, unknown>[], filename: string) {
  const csvString = Papa.unparse(data);
  // Thêm BOM UTF-8 để Excel mở đúng tiếng Việt
  const blob = new Blob(["\ufeff" + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function FriendlyErrorDetails({ summary, fullTraceback }: { summary: string; fullTraceback: string }) {
  const [showTraceback, setShowTraceback] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-normal text-[var(--color-text)] leading-relaxed">
        Không thể hoàn thành phân tích. Mã Python gặp lỗi thực thi và tự động sửa đổi thất bại. Vui lòng thử mô tả câu hỏi rõ ràng hơn hoặc điều chỉnh tên cột.
      </p>
      <div className="flex items-center gap-2 rounded bg-red-950/20 px-3 py-2 font-mono text-xs border border-red-500/20 w-fit">
        <span className="font-semibold text-red-400">Chi tiết lỗi:</span>
        <span className="text-red-300">{summary}</span>
      </div>
      <div>
        <button
          type="button"
          onClick={() => setShowTraceback(!showTraceback)}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-red-400 hover:underline transition-colors font-medium cursor-pointer"
        >
          <svg
            className={`size-3 transition-transform duration-150 ${showTraceback ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {showTraceback ? "Ẩn Traceback kỹ thuật" : "Xem chi tiết Traceback kỹ thuật"}
        </button>
        {showTraceback && (
          <pre className="mt-2 overflow-x-auto rounded border border-red-500/20 bg-red-950/15 p-3 font-mono text-xs text-red-300/90 leading-relaxed whitespace-pre-wrap">
            {fullTraceback}
          </pre>
        )}
      </div>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString("vi-VN");
    return value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  }
  return String(value ?? "");
}

function TableRenderer({ data }: { data: unknown[] }) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const firstItem = data[0];
  if (typeof firstItem !== "object" || firstItem === null) {
    // If it's a flat array of primitives
    return (
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-text)]">
          {data.map((item, idx) => (
            <li key={idx}>{formatCellValue(item)}</li>
          ))}
        </ul>
      </div>
    );
  }

  const typedItem = firstItem as Record<string, unknown>;
  const headers = Object.keys(typedItem);
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      {data.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--color-text-muted)]">{data.length} dòng</span>
          <button
            onClick={() => exportToCsv(
              data as Record<string, unknown>[],
              `notebook_${Date.now()}.csv`
            )}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-indigo-400 hover:bg-indigo-400/10 hover:text-indigo-300 transition-colors cursor-pointer"
          >
            <span>↓</span>
            <span>Tải CSV</span>
          </button>
        </div>
      )}
      <table className="w-full text-left border-collapse text-sm text-[var(--color-text)]">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-3)]">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 font-semibold text-[var(--color-text)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 100).map((rowItem, idx) => {
            const row = rowItem as Record<string, unknown>;
            return (
              <tr
                key={idx}
                className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface)]/50 last:border-0"
              >
                {headers.map((h) => {
                  const val = row[h];
                  return (
                    <td key={h} className="px-4 py-2 font-normal">
                      {val === null || val === undefined
                        ? ""
                        : typeof val === "object"
                        ? JSON.stringify(val)
                        : formatCellValue(val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.length > 100 && (
        <div className="p-2 text-center text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)] bg-[var(--color-surface-3)]">
          Hiển thị 100 trên tổng số {data.length} dòng
        </div>
      )}
    </div>
  );
}

function renderChart(result: ChartResult) {
  const { chartType, data, xLabel = "", yLabel = "" } = result;

  const formattedData = data.map((item) => ({
    name: item.name !== undefined ? String(item.name) : "",
    value: Number(item.value) || 0,
  }));

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={formattedData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={110}
            label={({ name, percent }: { name?: string; percent?: number }) =>
              `${name ?? ""} (${((percent ?? 0) * 100).toFixed(1)}%)`
            }
          >
            {formattedData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: unknown) =>
              typeof v === "number"
                ? v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })
                : String(v ?? "")
            }
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const isLine = chartType === "line";
  const isArea = chartType === "area";
  const ChartComp = isLine ? LineChart : isArea ? AreaChart : BarChart;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ChartComp data={formattedData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          label={{ value: xLabel, position: "insideBottom", offset: -20, fill: "#9ca3af" }}
        />
        <YAxis
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "#9ca3af" }}
          tickFormatter={(v: number) =>
            v >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : v >= 1000
              ? `${(v / 1000).toFixed(0)}k`
              : String(v)
          }
        />
        <Tooltip
          formatter={(v: unknown) =>
            typeof v === "number"
              ? v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })
              : String(v ?? "")
          }
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "6px" }}
          labelStyle={{ color: "#f9fafb" }}
        />
        <Legend wrapperStyle={{ paddingTop: "16px" }} />
        {isLine && (
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ fill: "#6366f1", r: 4 }}
            activeDot={{ r: 6 }}
          />
        )}
        {isArea && (
          <Area
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            fill="#6366f1"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        )}
        {!isLine && !isArea && (
          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
        )}
      </ChartComp>
    </ResponsiveContainer>
  );
}

export function NotebookCell({ cell, onDelete }: NotebookCellProps) {
  const [showCode, setShowCode] = useState(false);

  // Determine how to render raw result
  const renderResult = () => {
    if (cell.result === null || cell.result === undefined) return null;

    // 1. Chart result
    if (typeof cell.result === "object" && !Array.isArray(cell.result)) {
      const obj = cell.result as Record<string, unknown>;
      if (obj.type === "chart") {
        return (
          <div className="mt-4 rounded-lg bg-gray-800/50 p-4">
            {renderChart(obj as unknown as ChartResult)}
          </div>
        );
      }
    }

    // 2. Table result (list of objects)
    if (Array.isArray(cell.result)) {
      return <TableRenderer data={cell.result as unknown[]} />;
    }

    // 3. Object result (not a chart or array)
    if (typeof cell.result === "object") {
      const obj = cell.result as Record<string, unknown>;
      // Check if it looks like a Series/dict
      const entries = Object.entries(obj);
      if (entries.length > 0 && typeof entries[0][1] !== "object") {
        // Render simple key-value table
        const tableData = entries.map(([k, v]) => ({ "Thuộc tính": k, "Giá trị": v }));
        return <TableRenderer data={tableData} />;
      }
      return (
        <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 font-mono text-xs text-[var(--color-text)]">
          <code>{JSON.stringify(cell.result, null, 2)}</code>
        </pre>
      );
    }

    // 4. Primitive result
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text)] font-semibold">
        {formatCellValue(cell.result)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all duration-200 hover:border-[var(--color-border)]/80">
      {/* Prompt Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold text-sm">
            Q
          </div>
          <div className="text-sm font-semibold text-[var(--color-text)] mt-0.5 break-words min-w-0">
            {cell.prompt}
          </div>
        </div>
        
        {/* Right side: Timestamp & Delete Button */}
        <div className="flex items-center gap-3 shrink-0">
          {cell.timestamp && (
            <span className="text-[11px] text-[var(--color-text-muted)] mt-0.5 font-medium">
              {cell.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(cell.id)}
              className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-error)] transition-colors cursor-pointer"
              title="Xóa cell"
              aria-label="Xóa cell"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Code Toggle & Collapsible Block */}
      {cell.code && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="flex w-fit items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-medium transition-colors"
          >
            <svg
              className={`size-3 transition-transform duration-150 ${showCode ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {showCode ? "Ẩn mã Python" : "Xem mã Python"}
          </button>
          {showCode && (
            <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] p-4 font-mono text-xs text-[var(--color-text)] leading-relaxed">
              <code>{cell.code}</code>
            </pre>
          )}
        </div>
      )}

      {/* Execution Results */}
      {cell.status === "running" && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] py-4">
          <svg className="size-4 animate-spin text-[var(--color-primary)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Đang thực thi Python và phân tích...</span>
        </div>
      )}

      {cell.status === "error" && (
        <div className="rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 p-4 text-sm text-[var(--color-error)] flex flex-col gap-1.5">
          <div className="font-semibold flex items-center gap-1.5 mb-1">
            <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>Lỗi thực thi</span>
          </div>
          {(() => {
            if (!cell.error) return null;
            const isTraceback = cell.error.includes("Traceback (most recent call last):");
            if (isTraceback) {
              const errorLines = cell.error.trim().split("\n");
              const summaryLine = errorLines[errorLines.length - 1] || "RuntimeError: Lỗi không xác định";
              return <FriendlyErrorDetails summary={summaryLine} fullTraceback={cell.error} />;
            }
            return (
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {cell.error}
              </pre>
            );
          })()}
        </div>
      )}

      {(cell.status === "done" || cell.result !== undefined) && (
        <div className="flex flex-col gap-4">
          {/* Render Pyodide returned data/chart */}
          {renderResult()}

          {/* AI Insight */}
          {cell.insight && (
            <div className="flex gap-2.5 rounded-lg border border-[var(--color-primary)]/10 bg-[var(--color-primary)]/5 p-4">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold text-xs mt-0.5">
                A
              </div>
              <div className="prose prose-sm prose-invert max-w-none text-sm text-[var(--color-text)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cell.insight}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
