"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Papa from "papaparse";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { getPyodide, runPythonWithCSV, type PyodideStatus } from "@/lib/pyodideRunner";
import { NotebookCell, type NotebookCellData } from "./NotebookCell";

interface SavedCell {
  id: string;
  question: string;
  code: string;
  result: Record<string, unknown>[];
  insight: string;
  timestamp: number;
}

function parseTraceback(traceback: string) {
  const lines = traceback.trim().split('\n');
  if (lines.length === 0) return { errorType: "RuntimeError", errorDetail: traceback };
  const lastLine = lines[lines.length - 1]; // Ví dụ: "KeyError: 'Total_Sales'"
  const colonIdx = lastLine.indexOf(':');
  if (colonIdx === -1) {
    return { errorType: "RuntimeError", errorDetail: lastLine };
  }
  return {
    errorType: lastLine.substring(0, colonIdx).trim(),
    errorDetail: lastLine.substring(colonIdx + 1).trim()
  };
}

export function NotebookPanel() {
  const csv = useAppStore((s) => s.csv);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const currentFileId = useAppStore((s) => s.currentFileId);
  const fileList = useAppStore((s) => s.fileList);

  const [cells, setCells] = useState<NotebookCellData[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [pyodideStatus, setPyodideStatus] = useState<PyodideStatus>("idle");
  const [pyodideError, setPyodideError] = useState<string | null>(null);
  const [useContext, setUseContext] = useState(false);

  const cellsEndRef = useRef<HTMLDivElement>(null);

  // Calculate storageKey reactively based on active user and active CSV filename
  const storageKey = useMemo(() => {
    const userId = user?._id || "guest";
    const activeFile = fileList.find((f) => f.id === currentFileId);
    const activeFileName = activeFile?.original_name || "default";

    let fileHash = "default";
    try {
      fileHash = btoa(encodeURIComponent(activeFileName)).slice(0, 12);
    } catch (e) {
      console.warn("Failed to btoa activeFileName, using fallback:", e);
    }
    return `notebook_history_${userId}_${fileHash}`;
  }, [user?._id, currentFileId, fileList]);

  // Save cells to localStorage helper (with QuotaExceededError protection)
  const saveCellsToStorage = (updatedCells: NotebookCellData[]) => {
    if (typeof window === "undefined" || !storageKey) return;

    const completed = updatedCells.filter((c) => c.status === "done");
    const getSavedCellsObj = (list: NotebookCellData[]): SavedCell[] =>
      list.map((c) => ({
        id: c.id,
        question: c.prompt,
        code: c.code || "",
        result: (c.result as Record<string, unknown>[]) || [],
        insight: c.insight || "",
        timestamp: c.timestamp ? c.timestamp.getTime() : Date.now(),
      }));

    const savedCells = getSavedCellsObj(completed);

    try {
      localStorage.setItem(storageKey, JSON.stringify(savedCells));
    } catch (err) {
      console.warn("Lỗi ghi localStorage (có thể vượt quota):", err);
      // QuotaExceededError: keep only 20 most recent cells
      if (savedCells.length > 20) {
        try {
          const slicedCells = savedCells.slice(-20);
          localStorage.setItem(storageKey, JSON.stringify(slicedCells));
        } catch (retryErr) {
          console.error("Lỗi ghi đè localStorage sau khi slice:", retryErr);
        }
      }
    }
  };

  // Load history from localStorage on storageKey change
  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SavedCell[];
        const mappedCells: NotebookCellData[] = parsed.map((item) => ({
          id: item.id,
          prompt: item.question,
          code: item.code,
          result: item.result,
          insight: item.insight,
          status: "done",
          timestamp: new Date(item.timestamp),
        }));
        setCells(mappedCells);
      } catch (err) {
        console.error("Lỗi khi load lịch sử Notebook:", err);
        setCells([]);
      }
    } else {
      setCells([]);
    }
  }, [storageKey]);

  // Initialize Pyodide on mount
  useEffect(() => {
    getPyodide((status, error) => {
      setPyodideStatus(status);
      if (error) {
        setPyodideError(error);
      }
    }).catch((err) => {
      setPyodideStatus("error");
      setPyodideError(err.message || String(err));
    });
  }, []);

  // Scroll to bottom when cells change or status updates
  useEffect(() => {
    cellsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cells, isRunning]);

  // Generate suggested prompts dynamically based on CSV schema
  const suggestedPrompts = useMemo(() => {
    if (!csv || !csv.schema || csv.schema.length === 0) return [];

    // Lọc bỏ các cột ID/index/key không có giá trị phân tích
    const meaningfulColumns = csv.schema.filter(
      (col) => !/(^id$|_id$|^index$|^row[\s_-]?id$|^key$)/i.test(col.name)
    );

    // Giới hạn 8 cột để prompt ngắn gọn
    const schemaForPrompt = meaningfulColumns.slice(0, 8);

    const numericCols = schemaForPrompt
      .filter((col) => col.type === "number")
      .map((col) => col.name);
    const categoryCols = schemaForPrompt
      .filter((col) => col.type === "category" || col.type === "string")
      .map((col) => col.name);

    const prompts: string[] = [];

    prompts.push("Đếm tổng số dòng dữ liệu và liệt kê tên các cột.");

    if (numericCols.length > 0) {
      prompts.push(`Tóm tắt các chỉ số thống kê (mean, min, max, std) cho cột ${numericCols[0]}.`);
    }

    if (categoryCols.length > 0 && numericCols.length > 0) {
      prompts.push(`Tính tổng ${numericCols[0]} gom nhóm theo ${categoryCols[0]}.`);
      prompts.push(`Vẽ biểu đồ cột thể hiện giá trị trung bình của ${numericCols[0]} theo ${categoryCols[0]}.`);
    } else if (categoryCols.length > 0) {
      prompts.push(`Đếm số lượng giá trị duy nhất trong cột ${categoryCols[0]} và hiển thị top 5.`);
    }

    return prompts.slice(0, 3);
  }, [csv]);

  // Handle prompt execution
  const handleRun = async (promptText: string) => {
    if (!promptText.trim() || !csv || pyodideStatus !== "ready" || isRunning) return;

    setIsRunning(true);
    const cellId = String(Date.now());
    const newCell: NotebookCellData = {
      id: cellId,
      prompt: promptText,
      status: "pending",
      timestamp: new Date(),
    };

    setCells((prev) => [...prev, newCell]);
    setInput("");

    try {
      // Lấy cell cuối cùng đã có kết quả
      const lastCell = cells[cells.length - 1];

      const previousContext =
        useContext && lastCell?.result !== undefined
          ? {
              question: lastCell.prompt,
              resultSummary: JSON.stringify(lastCell.result).slice(0, 600),
            }
          : undefined;

      // 1. Prepare Schema and columnNames for the API
      const schemaForModel = csv.schema.map((col) => ({
        column_name: col.name,
        data_type: col.type,
      }));
      const columnNames = csv.schema.map((col) => col.name);

      // 2. Call API to generate Python code
      setCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, status: "running" } : c))
      );

      const genRes = await fetch("/api/notebook/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          prompt: promptText,
          schema: schemaForModel,
          columnNames,
          previousContext
        }),
      });

      if (!genRes.ok) {
        const errData = await genRes.json();
        throw new Error(errData.error || "Không thể sinh mã Python từ Gemini.");
      }

      const genData = await genRes.json();
      let code = genData.code;

      setCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, code } : c))
      );

      // 3. Reconstruct CSV raw text with robust header fallback
      const headers = csv.headers ?? csv.schema?.map((c: { name: string }) => c.name);
      const csvText = Papa.unparse(csv.rows, { columns: headers });

      // 4. Run Python code using Pyodide
      let pyResult = await runPythonWithCSV(code, csvText);

      if (pyResult.error) {
        console.warn("[Self-Correction] Python crashed, parsing error to self-correct:", pyResult.error);
        
        const { errorType, errorDetail } = parseTraceback(pyResult.error);
        
        // Show status as correcting
        setCells((prev) =>
          prev.map((c) => (c.id === cellId ? { ...c, error: `Lỗi: ${errorType}. Đang tự sửa mã nguồn...` } : c))
        );
        
        const correctionRes = await fetch("/api/notebook/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            prompt: promptText,
            schema: schemaForModel,
            columnNames,
            previousContext,
            selfCorrection: {
              originalCode: code,
              errorType,
              errorDetail
            }
          }),
        });
        
        if (correctionRes.ok) {
          const correctionData = await correctionRes.json();
          code = correctionData.code;
          
          setCells((prev) =>
            prev.map((c) => (c.id === cellId ? { ...c, code } : c))
          );
          
          // Re-run the corrected code
          pyResult = await runPythonWithCSV(code, csvText);
        }
      }

      if (pyResult.error) {
        throw new Error(pyResult.error);
      }

      const executionResult = pyResult.result;

      setCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, result: executionResult } : c))
      );

      // 5. Call API to generate natural language insights
      const insightRes = await fetch("/api/notebook/insight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ prompt: promptText, result: executionResult, schema: schemaForModel }),
      });

      if (!insightRes.ok) {
        // Fallback if insight fails but code execution succeeded
        setCells((prev) => {
          const updated = prev.map((c) => (c.id === cellId ? { ...c, status: "done" as const, insight: "Không thể tải insight tự động từ AI." } : c));
          saveCellsToStorage(updated);
          return updated;
        });
        return;
      }

      const { insight } = await insightRes.json();

      setCells((prev) => {
        const updated = prev.map((c) => (c.id === cellId ? { ...c, status: "done" as const, insight } : c));
        saveCellsToStorage(updated);
        return updated;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setCells((prev) =>
        prev.map((c) =>
          c.id === cellId ? { ...c, status: "error", error: message } : c
        )
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleDeleteCell = (id: string) => {
    setCells((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveCellsToStorage(updated);
      return updated;
    });
  };

  const handleClearHistory = () => {
    if (typeof window !== "undefined" && storageKey) {
      localStorage.removeItem(storageKey);
    }
    setCells([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleRun(input);
    }
  };

  // If no CSV file is loaded in store
  if (!csv) {
    return (
      <div className="flex h-[450px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <svg className="size-12 text-[var(--color-text-muted)] mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--color-text)]">Chưa có dữ liệu CSV</h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)] max-w-sm">
          Vui lòng tải lên file CSV tại tab **Board** trước khi sử dụng tính năng Notebook phân tích nâng cao.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Header section with Title and Clear History */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3 mb-4 shrink-0">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Notebook</h2>
        {cells.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:border-[var(--color-error)]/30 transition-colors cursor-pointer"
            title="Xóa toàn bộ lịch sử Notebook cho file này"
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <span>Xóa lịch sử</span>
          </button>
        )}
      </div>
      {/* Pyodide Initialization Banner */}
      {pyodideStatus === "loading" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-3 text-sm text-[var(--color-primary)]">
          <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Đang khởi tạo môi trường tính toán Python (Pyodide WASM)...</span>
        </div>
      )}

      {pyodideStatus === "error" && (
        <div className="mb-4 flex flex-col gap-1 rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 p-3 text-sm text-[var(--color-error)]">
          <div className="font-semibold flex items-center gap-2">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>Lỗi tải môi trường Python</span>
          </div>
          <span>{pyodideError || "Không thể tải Pyodide. Vui lòng kiểm tra kết nối mạng hoặc thử lại."}</span>
        </div>
      )}

      {/* Cells List area */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-6 pb-24">
        {cells.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[280px] text-center px-4">
            <div className="text-[var(--color-text-muted)] text-sm mb-4">
              Hãy nhập câu hỏi phân tích để bắt đầu phiên làm việc Notebook của bạn.
            </div>
            {suggestedPrompts.length > 0 && (
              <div className="w-full max-w-lg space-y-2">
                <div className="text-xs font-semibold text-[var(--color-text-muted)] text-left px-1 mb-1">
                  GỢI Ý CÂU HỎI CHO BẠN:
                </div>
                {suggestedPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInput(p)}
                    disabled={pyodideStatus !== "ready" || isRunning}
                    className="w-full text-left text-xs bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3 rounded-lg text-[var(--color-text)] transition-colors line-clamp-1 disabled:opacity-50"
                  >
                    💡 {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          cells.map((cell) => <NotebookCell key={cell.id} cell={cell} onDelete={handleDeleteCell} />)
        )}
        <div ref={cellsEndRef} />
      </div>

      {/* Bottom Fixed Input Box */}
      <div className="sticky bottom-0 bg-[var(--color-bg)] pt-4 pb-2 border-t border-[var(--color-border)] flex flex-col gap-2">
        {cells.length > 0 && cells.some((c) => c.result !== undefined) && (
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer select-none mb-2">
            <input
              type="checkbox"
              checked={useContext}
              onChange={(e) => setUseContext(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 accent-indigo-500 cursor-pointer"
            />
            <span>Dùng kết quả trước làm ngữ cảnh</span>
          </label>
        )}
        {cells.length > 0 && suggestedPrompts.length > 0 && !isRunning && (
          <div className="flex flex-wrap gap-2 mb-1 px-1">
            {suggestedPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setInput(p)}
                disabled={pyodideStatus !== "ready"}
                className="text-[10px] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-1.5 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors max-w-xs truncate"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={pyodideStatus !== "ready" || isRunning}
            placeholder={
              pyodideStatus !== "ready"
                ? "Đang tải môi trường Python..."
                : isRunning
                ? "Đang phân tích..."
                : "Nhập câu hỏi, ví dụ: Nhóm dữ liệu và vẽ biểu đồ cột..."
            }
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => handleRun(input)}
            disabled={!input.trim() || pyodideStatus !== "ready" || isRunning}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-[var(--color-primary)]/95 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <div className="flex items-center gap-1.5">
                <svg className="size-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Đang chạy...</span>
              </div>
            ) : (
              "Chạy (Run)"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
