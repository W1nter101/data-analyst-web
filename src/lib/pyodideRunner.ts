"use client";

interface PyodideGlobals {
  set: (name: string, value: unknown) => void;
}

interface PyodideInstance {
  globals: PyodideGlobals;
  runPythonAsync: (code: string) => Promise<string>;
  loadPackage: (packages: string[]) => Promise<void>;
}

declare global {
  interface Window {
    loadPyodide?: () => Promise<PyodideInstance>;
  }
}

let pyodideInstance: PyodideInstance | null = null;

export type PyodideStatus = "idle" | "loading" | "ready" | "error";

export async function getPyodide(onStatusChange?: (status: PyodideStatus, error?: string) => void): Promise<PyodideInstance> {
  if (pyodideInstance) {
    onStatusChange?.("ready");
    return pyodideInstance;
  }
  
  try {
    onStatusChange?.("loading");
    // Load Pyodide from CDN
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js";
    document.head.appendChild(script);
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(new Error("Không thể tải Pyodide CDN"));
    });
    
    if (!window.loadPyodide) {
      throw new Error("window.loadPyodide không khả dụng sau khi tải script");
    }
    
    pyodideInstance = await window.loadPyodide();
    await pyodideInstance.loadPackage(["pandas", "numpy"]);
    onStatusChange?.("ready");
    return pyodideInstance;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onStatusChange?.("error", message);
    throw err;
  }
}

export interface PyodideRunResult {
  result?: unknown;
  error?: string;
}

export async function runPythonWithCSV(
  code: string,
  csvRawText: string
): Promise<PyodideRunResult> {
  try {
    const pyodide = await getPyodide();

    // Inject CSV into Python namespace
    pyodide.globals.set("_csv_raw", csvRawText);

    // Wrap code: load df + capture output
    const wrappedCode = `
import pandas as pd
import io
import json

# Check if we need to initialize or reload the original dataframe
if 'df_original' not in globals() or '_current_csv_raw' not in globals() or _current_csv_raw != _csv_raw:
    _csv_io = io.StringIO(_csv_raw)
    df_original = pd.read_csv(_csv_io)
    
    # Auto-convert date columns với dayfirst=True
    for col in df_original.columns:
        if df_original[col].dtype == object:
            try:
                df_original[col] = pd.to_datetime(df_original[col], dayfirst=True, format='mixed')
            except (ValueError, TypeError):
                pass
    _current_csv_raw = _csv_raw

df = df_original.copy()

_result = None

${code}

# Hỗ trợ chuyển đổi kiểu dữ liệu numpy/pandas sang kiểu python chuẩn để json.dumps hoạt động
class PythonEncoder(json.JSONEncoder):
    def default(self, obj):
        import numpy as np
        # Handle pandas Timestamp or other datetime objects
        if isinstance(obj, pd.Timestamp) or (hasattr(obj, 'strftime') and hasattr(obj, 'isoformat')):
            return obj.isoformat()
        if isinstance(obj, pd.DataFrame):
            return obj.to_dict(orient="records")
        if isinstance(obj, pd.Series):
            return obj.to_dict()
        if isinstance(obj, (np.integer, np.floating)):
            return obj.item()
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif pd.api.types.is_dict_like(obj):
            return dict(obj)
        elif pd.api.types.is_list_like(obj):
            return list(obj)
        return super().default(obj)

# Chuyển đổi DataFrame/Series sang dict/list trước khi clean_nan
import numpy as np
if isinstance(_result, pd.DataFrame):
    _result = _result.to_dict(orient="records")
elif isinstance(_result, pd.Series):
    _result = _result.to_dict()

def clean_nan(obj):
    import math
    if isinstance(obj, list):
        return [clean_nan(i) for i in obj]
    if isinstance(obj, dict):
        return {k: (None if isinstance(v, (float, np.floating)) and math.isnan(v) else clean_nan(v)) for k, v in obj.items()}
    if isinstance(obj, (float, np.floating)) and math.isnan(obj):
        return None
    return obj

_result = clean_nan(_result)

# Serialize output
_output = {"result": _result}
json.dumps(_output, cls=PythonEncoder)
`;
    const output = await pyodide.runPythonAsync(wrappedCode);
    const parsed = JSON.parse(output) as { result: unknown };
    return { result: parsed.result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
