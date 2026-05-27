'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { applyChartConfig, type AIChartConfig } from '@/lib/chartConfigHandler';
import { ConversationSidebar } from '@/components/dashboard/ConversationSidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Types ───────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  chartType?: string;
  isNarrative?: boolean;
  isAnomaly?: boolean;
  isPending?: boolean;
  transformConfig?: {
    operation: 'add_column' | 'rename_column' | 'delete_column' | 'fill_empty';
    column_name: string;
    expression?: string;
    new_name?: string;
    data_type?: string;
    description?: string;
  };
}

interface LeftPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobileDrawer?: boolean;
}

// ── Component ───────────────────────────────────────────────────────

export function LeftPanel({
  collapsed,
  onToggleCollapse,
  isMobileDrawer = false,
}: LeftPanelProps) {
  const csv = useAppStore((s) => s.csv);
  const currentFileId = useAppStore((s) => s.currentFileId);
  const currentConversationId = useAppStore((s) => s.currentConversationId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [anomalyMessages, setAnomalyMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lmOnline, setLmOnline] = useState<boolean | null>(null); // null = checking
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'history'>('chat');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Health check ────────────────────────────────────────────────

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/lm-health');
      const data = await res.json();
      setLmOnline(data.status === 'ok');
    } catch {
      setLmOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // ── Scroll to bottom on new messages ────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load messages when conversation changes ─────────────────────

  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      return;
    }
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) return;

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/conversations/${currentConversationId}/messages`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setMessages(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data.messages ?? []).map((m: any) => {
            let content = m.content;
            if (m.intent === 'visualize' && !content && m.chart_config) {
              const type = (m.chart_config.type || 'bar').toLowerCase();
              const title = m.chart_config.title || `${m.chart_config.y_axis} theo ${m.chart_config.x_axis}`;
              content = `Đã vẽ biểu đồ ${type} "${title}" cho bạn`;
            }
            return {
              id: m.id,
              role: m.role,
              content,
              isError: false,
              chartType: m.intent === 'visualize' ? (m.chart_config?.type || 'bar').toLowerCase() : undefined,
              isNarrative: m.intent === 'narrative',
            };
          }),
        );
      } catch {
        /* ignore */
      }
    };
    loadMessages();
  }, [currentConversationId]);

  // ── Anomaly detection when file changes ─────────────────────────

  useEffect(() => {
    if (!currentFileId) {
      setAnomalyMessages([]);
      return;
    }
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) return;

    // Clear previous anomaly results
    setAnomalyMessages([]);

    let cancelled = false;

    const runAnomalyDetection = async () => {
      try {
        const res = await fetch('/api/anomaly', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ fileId: currentFileId }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        const results = data.results as {
          column: string;
          outliers: { rowIndex: number; value: number; zscore: number }[];
          stats: { mean: number; std: number; q1: number; q3: number; iqr: number; min: number; max: number };
          method: string;
        }[];

        if (!results || results.length === 0) return;

        // Format anomaly results into a chat message
        let content = `**⚠️ Phát hiện dữ liệu bất thường (${results.length} cột)**\n\n`;

        for (const r of results) {
          const count = r.outliers.length;
          const topOutliers = r.outliers.slice(0, 3);
          content += `**${r.column}** — ${count} giá trị ngoại lai\n`;
          content += `📊 Thống kê: trung bình=${r.stats.mean.toFixed(1)}, `;
          content += `σ=${r.stats.std.toFixed(1)}, `;
          content += `khoảng=[${r.stats.min}–${r.stats.max}]\n`;
          content += topOutliers
            .map(
              (o) =>
                `  • Dòng ${o.rowIndex + 1}: **${o.value}** (z-score: ${o.zscore})`,
            )
            .join('\n');
          if (count > 3) {
            content += `\n  • ...và ${count - 3} giá trị khác`;
          }
          content += '\n\n';
        }

        content += `_Phương pháp: Z-score (ngưỡng > 3σ)_`;

        setAnomalyMessages([{
          id: `anomaly-${currentFileId}-${Date.now()}`,
          role: 'assistant',
          content,
          isAnomaly: true,
        }]);
      } catch {
        // Silently fail — anomaly detection is non-critical
      }
    };

    runAnomalyDetection();
    return () => { cancelled = true; };
  }, [currentFileId]);

  // ── Close message menu on outside click ─────────────────────────

  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  // ── Delete single message ───────────────────────────────────────

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!currentConversationId) return;
      const accessToken = useAuthStore.getState().accessToken;
      if (!accessToken) return;

      try {
        const res = await fetch(
          `/api/conversations/${currentConversationId}/messages/${messageId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (res.ok) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      } catch {
        /* ignore */
      }
      setOpenMenuId(null);
    },
    [currentConversationId],
  );
 
  // ── Handle applying transform ─────────────────────────────────────
  const handleApplyTransform = useCallback(
    async (messageId: string, transformConfig: any) => {
      if (!currentFileId) return;
      const accessToken = useAuthStore.getState().accessToken;
 
      try {
        const res = await fetch('/api/transform', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            fileId: currentFileId,
            transform_config: transformConfig,
          }),
        });
        const data = await res.json();
 
        if (res.ok && data.success) {
          // Replace bubble with success message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    id: m.id,
                    role: 'assistant',
                    content: `✅ ${data.message || 'Đã áp dụng thay đổi thành công'}`,
                  }
                : m
            )
          );
 
          // Fetch updated file schema
          if (accessToken) {
            const fileRes = await fetch(`/api/files/${currentFileId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const fileData = await fileRes.json();
            if (fileData.success) {
              useAppStore.getState().setCSV({
                headers: fileData.file.schema.map((s: any) => s.name),
                rowCount: fileData.file.row_count,
                schema: fileData.file.schema,
                rows: [],
              });
            }
          }
 
          // Reload row data
          useAppStore.getState().triggerRefresh();
        } else {
          // Replace bubble with error message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    id: m.id,
                    role: 'assistant',
                    content: `❌ Thất bại: ${data.message || 'Lỗi không xác định'}`,
                    isError: true,
                  }
                : m
            )
          );
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  id: m.id,
                  role: 'assistant',
                  content: `❌ Thất bại: ${err instanceof Error ? err.message : 'Lỗi kết nối'}`,
                  isError: true,
                }
              : m
          )
        );
      }
    },
    [currentFileId],
  );
 
  // ── Handle cancelling transform ───────────────────────────────────
  const handleCancelTransform = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              id: m.id,
              role: 'assistant',
              content: `↩️ Đã huỷ thao tác`,
            }
          : m
      )
    );
  }, []);

  // ── Schema for model input ──────────────────────────────────────

  const schemaForModel = useMemo(() => {
    if (!csv?.schema) return null;
    return csv.schema.map((col) => ({
      column_name: col.name,
      data_type: col.type,
      description: `${col.uniqueCount} giá trị duy nhất, ${col.nullCount} nulls`,
    }));
  }, [csv]);

  // ── Suggested prompts ───────────────────────────────────────────

  const suggestedPrompts = useMemo(() => {
    if (!csv?.schema || csv.schema.length === 0) return [];

    const xCandidate = csv.schema.find(
      (c) => c.type === 'date' || c.type === 'string' || c.type === 'category',
    );
    const yCandidate = csv.schema.find((c) => c.type === 'number');

    if (!xCandidate || !yCandidate) return [];

    const x = xCandidate.name;
    const y = yCandidate.name;

    return [
      `Vẽ biểu đồ đường ${y} theo ${x}`,
      `So sánh ${y} giữa các ${x}`,
      `Tỷ lệ ${y} theo ${x}`,
    ];
  }, [csv]);

  // ── Send message ────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || !schemaForModel || sending) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: query.trim(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        const store = useAppStore.getState();
        const { currentFileId, currentConversationId } = store;
        const accessToken = useAuthStore.getState().accessToken;

        // Step 1: Enqueue job — returns immediately with jobId
        const enqueueRes = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            fileId: currentFileId,
            conversationId: currentConversationId,
            schema: schemaForModel,
            user_query: query.trim(),
          }),
        });

        if (enqueueRes.status === 429) {
          const data = await enqueueRes.json();
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: data.error || 'Quá nhiều yêu cầu. Vui lòng đợi 1 phút.',
              isError: true,
            },
          ]);
          setSending(false);
          return;
        }

        const enqueueData = await enqueueRes.json();

        if (!enqueueRes.ok || enqueueData.error) {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: enqueueData.error || 'Lỗi không xác định',
              isError: true,
            },
          ]);
          return;
        }

        const { jobId } = enqueueData;

        // Step 2: Poll for result every 1.5s, timeout after 60s
        const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const pollInterval = setInterval(async () => {
            try {
              const pollRes = await fetch(`/api/job/${jobId}`, {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
              });

              if (pollRes.status === 429) {
                const pollData = await pollRes.json();
                clearInterval(pollInterval);
                clearTimeout(timeout);
                reject(new Error(pollData.error || 'Yêu cầu thăm dò bị giới hạn tốc độ.'));
                return;
              }

              const pollData = await pollRes.json();

              if (pollData.status === 'completed') {
                clearInterval(pollInterval);
                clearTimeout(timeout);
                resolve(pollData.result as Record<string, unknown>);
              } else if (pollData.status === 'failed') {
                clearInterval(pollInterval);
                clearTimeout(timeout);
                reject(new Error(pollData.error || 'Job failed'));
              }
              // else: still 'waiting' or 'active' — keep polling
            } catch {
              // Network error during poll — keep trying
            }
          }, 1500);

          const timeout = setTimeout(() => {
            clearInterval(pollInterval);
            reject(new Error('Timeout: AI không phản hồi sau 60 giây'));
          }, 60000);
        });

        // Step 3: Handle result (same logic as before)
 
        // Handle transform intent
        if (data.intent === 'transform' && data.transform_config) {
          const config = data.transform_config as any;
          setMessages((prev) => [
            ...prev,
            {
              id: `transform-pending-${Date.now()}`,
              role: 'assistant',
              content: config.description || 'Yêu cầu thay đổi dữ liệu cột.',
              isPending: true,
              transformConfig: config,
            },
          ]);
          return;
        }
 
        // Handle unknown intent
        if (data.intent === 'unknown') {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: (data.message as string) || 'Tôi chỉ có thể giúp phân tích dữ liệu CSV.',
              isError: false,
            },
          ]);
          return;
        }

        // Handle analyze intent
        if (data.intent === 'analyze' && data.markdownTable) {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: (data.finalContent as string) || (data.markdownTable as string),
              isError: false,
            },
          ]);
          return;
        }

        // Handle analyze message (error/empty result from worker)
        if (data.intent === 'analyze' && data.message) {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: data.message as string,
              isError: true,
            },
          ]);
          return;
        }

        // Apply chart config to the dashboard
        if (data.intent === 'visualize' && data.chart_config) {
          const store = useAppStore.getState();
          const result = applyChartConfig(
            data.chart_config as AIChartConfig,
            store,
            query.trim(),
          );

          setMessages((prev) => {
            const list = [
              ...prev,
              {
                id: `ai-${Date.now()}`,
                role: 'assistant' as const,
                content: result.message,
                isError: !result.success,
                chartType: result.chartType,
              },
            ];

            if (data.narrative) {
              list.push({
                id: `narrative-${Date.now()}`,
                role: 'assistant' as const,
                content: `💡 ${data.narrative}`,
                isError: false,
                isNarrative: true,
              });
            }

            return list;
          });
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: '❌ Không thể hiểu yêu cầu. Hãy mô tả rõ hơn.',
              isError: true,
            },
          ]);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Không thể kết nối đến AI. Hãy kiểm tra LM Studio.';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: errorMessage,
            isError: true,
          },
        ]);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [schemaForModel, sending],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex h-full max-h-full w-full flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-foreground/5">
              {viewMode === 'history' ? (
                <svg
                  className="size-4 text-foreground/70"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              ) : (
                <svg
                  className="size-4 text-foreground/70"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                  />
                </svg>
              )}
            </div>
            <span className="text-sm font-semibold text-foreground">
              {viewMode === 'history' ? 'Lịch sử chat' : 'Chat AI'}
            </span>

            {/* ── Online / offline indicator ─── */}
            {viewMode === 'chat' && lmOnline !== null && (
              <div className="group relative">
                <span
                  className={`block size-2 rounded-full ${
                    lmOnline ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
                  }`}
                />
                {/* Tooltip */}
                <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {lmOnline
                    ? 'LM Studio đang hoạt động'
                    : 'Khởi động LM Studio để dùng AI'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {!collapsed && (
            <button
              type="button"
              onClick={() => setViewMode((v) => (v === 'chat' ? 'history' : 'chat'))}
              className="flex size-8 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/80"
              aria-label={viewMode === 'chat' ? 'Xem lịch sử' : 'Quay lại chat'}
              title={viewMode === 'chat' ? 'Lịch sử chat' : 'Chat hiện tại'}
            >
              {viewMode === 'chat' ? (
                <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              ) : (
                <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
              )}
            </button>
          )}

          {/* Collapse / close button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex size-8 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/80"
            aria-label={
              isMobileDrawer
                ? 'Đóng'
                : collapsed
                  ? 'Mở rộng'
                  : 'Thu gọn'
            }
          >
            {isMobileDrawer ? (
              <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : collapsed ? (
              <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            ) : (
              <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

       {/* ── Main Area ──────────────────────────────────── */}
      {!collapsed && viewMode === 'history' ? (
        <div className="flex-1 overflow-hidden">
          <ConversationSidebar onSelectChat={() => setViewMode('chat')} />
        </div>
      ) : (
        <>
          {/* ── Chat area ──────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth custom-scrollbar">
            {collapsed ? (
              /* Collapsed: just an icon */
              <div className="flex flex-col items-center gap-4 pt-4">
                <div className="flex size-10 items-center justify-center rounded-xl bg-foreground/5">
                  <svg
                    className="size-5 text-foreground/40"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                    />
                  </svg>
                </div>
              </div>
            ) : (messages.length === 0 && anomalyMessages.length === 0) ? (
              /* Empty state */
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="rounded-full bg-foreground/5 p-4 text-foreground/40">
                  <svg
                    className="size-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Tôi có thể giúp gì?
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                    Hãy hỏi tôi về dữ liệu hoặc yêu cầu tạo biểu đồ
                  </p>
                </div>
              </div>
            ) : (
              /* Message list */
              <div className="flex flex-col gap-3 p-4">
                {[...anomalyMessages, ...messages].map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`group/msg relative flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* ── 3-dot menu button ── */}
                      <button
                        type="button"
                        className={`absolute top-1 z-10 rounded p-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 hover:bg-[var(--color-surface-2)] ${
                          isUser ? 'left-0' : 'right-0'
                        } ${openMenuId === msg.id ? '!opacity-100' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === msg.id ? null : msg.id);
                        }}
                        aria-label="Tùy chọn tin nhắn"
                      >
                        <svg
                          className="size-3.5 text-[var(--color-text-faint)]"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                          />
                        </svg>
                      </button>

                      {/* ── Dropdown ── */}
                      {openMenuId === msg.id && (
                        <div
                          className={`absolute top-6 z-50 min-w-[130px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)] ${
                            isUser ? 'left-0' : 'right-0'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                            onClick={() => handleDeleteMessage(msg.id)}
                          >
                            Xóa tin nhắn
                          </button>
                        </div>
                      )}

                      {/* ── Bubble ── */}
                      <div
                        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          isUser
                            ? 'bg-[var(--color-accent)] text-[var(--color-text)]'
                            : msg.isError
                              ? 'border border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
                              : msg.isAnomaly
                                ? 'border border-amber-500/40 bg-amber-500/10 border-l-4 border-l-amber-500 text-[var(--color-text-muted)]'
                                : msg.isNarrative
                                  ? 'bg-[var(--color-surface)] border border-[var(--color-border)] border-l-4 border-l-blue-400/50 italic text-[var(--color-text-muted)]'
                          : msg.isPending
                            ? 'border border-purple-500/40 bg-purple-500/5 border-l-4 border-l-purple-500 text-[var(--color-text-muted)]'
                            : msg.chartType
                              ? 'border border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'
                              : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]'
                        }`}
                      >
                        {msg.role === 'assistant' && !msg.isError && !msg.isNarrative && !msg.isAnomaly && !msg.isPending && (
                          <span className="mr-1">✅</span>
                        )}
                        {msg.role === 'assistant' && msg.isError && (
                          <span className="mr-1">❌</span>
                        )}
                        <div className="[&>table]:w-full [&>table]:border-collapse [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-2 [&_td]:py-1 [&_p]:my-1 overflow-x-auto whitespace-normal">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                        {msg.isPending && msg.transformConfig && (
                          <div className="mt-3 flex items-center gap-2 border-t border-purple-500/20 pt-2.5">
                            <button
                              type="button"
                              onClick={() => handleApplyTransform(msg.id, msg.transformConfig)}
                              className="rounded bg-purple-600 hover:bg-purple-700 px-3 py-1 text-xs font-semibold text-white transition-colors cursor-pointer"
                            >
                              ✅ Áp dụng
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelTransform(msg.id)}
                              className="rounded border border-purple-500/40 hover:bg-purple-500/10 px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)] transition-colors cursor-pointer"
                            >
                              ❌ Huỷ
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Sending indicator */}
                {sending && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text-faint)]">
                      <span className="animate-pulse">Đang suy nghĩ...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── Input ──────────────────────────────────────── */}
          {!collapsed && (
            <div className="shrink-0 p-4 pt-0">
              <form
                onSubmit={handleSubmit}
                className="relative flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 transition-colors focus-within:border-[var(--color-border-hover)]"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    !csv
                      ? 'Tải lên CSV trước...'
                      : !lmOnline
                        ? 'LM Studio chưa sẵn sàng...'
                        : 'Hỏi AI về dữ liệu...'
                  }
                  disabled={!csv || !lmOnline || sending}
                  className="flex-1 bg-transparent py-2 pl-3 pr-10 text-sm text-foreground outline-none placeholder:text-foreground/30 disabled:text-foreground/40"
                />
                <button
                  type="submit"
                  disabled={!csv || !lmOnline || sending || !input.trim()}
                  className="absolute bottom-3 right-3 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-text)] transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Gửi"
                >
                  {sending ? (
                    <span className="size-3.5 animate-spin rounded-full border-2 border-[var(--color-text-faint)] border-t-[var(--color-text)]" />
                  ) : (
                    <svg
                      className="size-4 -translate-y-px translate-x-px"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                      />
                    </svg>
                  )}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
