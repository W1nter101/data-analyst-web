'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStore } from '@/store/appStore';
import { applyChartConfig, type AIChartConfig } from '@/lib/chartConfigHandler';

// ── Types ───────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  chartType?: string;
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lmOnline, setLmOnline] = useState<boolean | null>(null); // null = checking

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
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schema: schemaForModel,
            user_query: query.trim(),
          }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: data.error || 'Lỗi không xác định',
              isError: true,
            },
          ]);
          return;
        }

        // Handle unknown intent — model says it can't help
        if (data.intent === 'unknown') {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: data.message || 'Tôi chỉ có thể giúp phân tích dữ liệu CSV.',
              isError: false,
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
            query.trim(), // Pass user query for keyword override (Fix 3)
          );

          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: result.message,
              isError: !result.success,
              chartType: result.chartType,
            },
          ]);
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
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Không thể kết nối đến AI. Hãy kiểm tra LM Studio.',
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
    <div className="flex h-full w-full flex-col border-r border-foreground/10 bg-background">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-foreground/10 px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-foreground/5">
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
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold text-foreground">
              Chat AI
            </span>

            {/* ── Online / offline indicator ─── */}
            {lmOnline !== null && (
              <div className="group relative">
                <span
                  className={`block size-2 rounded-full ${
                    lmOnline ? 'bg-green-500' : 'bg-red-500'
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

      {/* ── Chat area ──────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto">
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
            {lmOnline !== null && (
              <span
                className={`block size-2 rounded-full ${
                  lmOnline ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
            )}
          </div>
        ) : messages.length === 0 ? (
          /* Empty state: placeholder or suggested prompts */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-foreground/5">
              <svg
                className="size-7 text-foreground/30"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
            </div>

            {csv ? (
              <>
                <p className="text-sm font-medium text-foreground/50">
                  Hỏi AI để tạo biểu đồ
                </p>
                {suggestedPrompts.length > 0 && (
                  <div className="flex w-full flex-col gap-2">
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        disabled={sending || !lmOnline}
                        className="rounded-lg border border-foreground/10 px-3 py-2 text-left text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground/50">
                  AI Assistant
                </p>
                <p className="text-xs text-foreground/35">
                  Tải lên file CSV để bắt đầu
                </p>
              </>
            )}
          </div>
        ) : (
          /* Message list */
          <div className="flex flex-col gap-3 p-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-foreground text-background'
                      : msg.isError
                        ? 'border border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                        : 'border border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300'
                  }`}
                >
                  {msg.role === 'assistant' && !msg.isError && (
                    <span className="mr-1">✅</span>
                  )}
                  {msg.role === 'assistant' && msg.isError && (
                    <span className="mr-1">❌</span>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Sending indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3.5 py-2.5 text-sm text-foreground/50">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/50" />
                  Đang suy nghĩ...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ──────────────────────────────────── */}
      {!collapsed && (
        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-foreground/10 p-3"
        >
          <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
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
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/30 disabled:text-foreground/40"
            />
            <button
              type="submit"
              disabled={!csv || !lmOnline || sending || !input.trim()}
              className="flex size-7 items-center justify-center rounded-lg bg-foreground/10 text-foreground/50 transition-colors hover:bg-foreground/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Gửi"
            >
              {sending ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/50" />
              ) : (
                <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
