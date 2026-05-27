'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAuthStore } from '@/store/authStore';

// ── Zod schema ──────────────────────────────────────────────────────
const signInSchema = z.object({
  username: z.string().min(3, 'Tên đăng nhập ít nhất 3 ký tự'),
  password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự'),
});

type SignInFormValues = z.infer<typeof signInSchema>;

// ── Page component ──────────────────────────────────────────────────
export default function SignInPage() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInFormValues) => {
    setApiError(null);

    try {
      await signIn(data.username, data.password);

      // Check if sign-in actually succeeded (token was set)
      const { accessToken } = useAuthStore.getState();
      if (accessToken) {
        router.push('/dashboard');
      } else {
        setApiError('Tên đăng nhập hoặc mật khẩu không đúng');
      }
    } catch {
      setApiError('Đăng nhập không thành công. Vui lòng thử lại.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
        <div className="grid md:grid-cols-[1.2fr_0.8fr]">
          {/* Form column */}
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6">
              {/* Header */}
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold text-[var(--color-text)]">
                  Chào mừng quay lại
                </h1>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Đăng nhập tài khoản của bạn
                </p>
              </div>

              {/* API error */}
              {apiError && (
                <div className="rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]">
                  {apiError}
                </div>
              )}

              {/* Username */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-[var(--color-text)]"
                >
                  Tên đăng nhập
                </label>
                <input
                  type="text"
                  id="username"
                  placeholder="tên đăng nhập"
                  autoComplete="username"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
                  {...register('username')}
                />
                {errors.username && (
                  <p className="text-sm text-[var(--color-error)]">
                    {errors.username.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-[var(--color-text)]"
                >
                  Mật khẩu
                </label>
                <input
                  type="password"
                  id="password"
                  autoComplete="current-password"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-[var(--color-error)]">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting && (
                  <span className="size-4 animate-spin rounded-full border-2 border-[var(--color-text)]/30 border-t-[var(--color-text)]" />
                )}
                {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>

              {/* Link to signup */}
              <div className="text-center text-sm text-[var(--color-text-muted)]">
                Chưa có tài khoản?{' '}
                <Link
                  href="/signup"
                  className="font-medium text-[var(--color-accent)] underline underline-offset-4 transition-colors hover:text-[var(--color-accent-hover)]"
                >
                  Đăng ký
                </Link>
              </div>
            </div>
          </form>

          {/* Decorative column (hidden on mobile) */}
          <div className="relative hidden md:block">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(135deg, hsl(262 83% 58% / 0.15), hsl(320 100% 70% / 0.1))',
              }}
            />
            <div className="flex h-full items-center justify-center p-8">
              <div className="text-center">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[var(--color-surface-2)]">
                  <svg
                    className="size-8 text-[var(--color-text-faint)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--color-text-muted)]">
                  CSV Data Analyst
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                  Phân tích dữ liệu thông minh
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="px-6 text-center text-xs text-[var(--color-text-faint)]">
        Bằng cách tiếp tục, bạn đồng ý với{' '}
        <span className="underline underline-offset-4">
          Điều khoản dịch vụ
        </span>{' '}
        và{' '}
        <span className="underline underline-offset-4">
          Chính sách bảo mật
        </span>{' '}
        của chúng tôi
      </p>
    </div>
  );
}
