'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAuthStore } from '@/store/authStore';

// ── Zod schema ──────────────────────────────────────────────────────
const signUpSchema = z.object({
  firstname: z.string().min(1, 'Hãy nhập tên'),
  lastname: z.string().min(1, 'Hãy nhập họ'),
  username: z.string().min(3, 'Tên đăng nhập ít nhất 3 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự'),
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

// ── Page component ──────────────────────────────────────────────────
export default function SignUpPage() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormValues) => {
    setApiError(null);

    try {
      await signUp(
        data.username,
        data.password,
        data.email,
        data.firstname,
        data.lastname,
      );

      // signUp in authStore shows a toast on success. Redirect to signin.
      router.push('/signin');
    } catch {
      setApiError('Đăng ký không thành công. Vui lòng thử lại.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Card */}
      <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-lg">
        <div className="grid md:grid-cols-[1.2fr_0.8fr]">
          {/* Form column */}
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-5">
              {/* Header */}
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold text-foreground">
                  Tạo tài khoản
                </h1>
                <p className="text-sm text-foreground/60">
                  Hãy đăng ký để bắt đầu
                </p>
              </div>

              {/* API error */}
              {apiError && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {apiError}
                </div>
              )}

              {/* First & Last name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="lastname"
                    className="text-sm font-medium text-foreground"
                  >
                    Họ
                  </label>
                  <input
                    type="text"
                    id="lastname"
                    autoComplete="family-name"
                    className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10"
                    {...register('lastname')}
                  />
                  {errors.lastname && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {errors.lastname.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="firstname"
                    className="text-sm font-medium text-foreground"
                  >
                    Tên
                  </label>
                  <input
                    type="text"
                    id="firstname"
                    autoComplete="given-name"
                    className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10"
                    {...register('firstname')}
                  />
                  {errors.firstname && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {errors.firstname.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Username */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-foreground"
                >
                  Tên đăng nhập
                </label>
                <input
                  type="text"
                  id="username"
                  placeholder="tên đăng nhập"
                  autoComplete="username"
                  className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10"
                  {...register('username')}
                />
                {errors.username && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {errors.username.message}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  placeholder="m@gmail.com"
                  autoComplete="email"
                  className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  Mật khẩu
                </label>
                <input
                  type="password"
                  id="password"
                  autoComplete="new-password"
                  className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting && (
                  <span className="size-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                )}
                {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
              </button>

              {/* Link to signin */}
              <div className="text-center text-sm text-foreground/60">
                Đã có tài khoản?{' '}
                <Link
                  href="/signin"
                  className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
                >
                  Đăng nhập
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
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-foreground/5">
                  <svg
                    className="size-8 text-foreground/40"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground/50">
                  CSV Data Analyst
                </p>
                <p className="mt-1 text-xs text-foreground/35">
                  Bắt đầu phân tích dữ liệu
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="px-6 text-center text-xs text-foreground/40">
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
