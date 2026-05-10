/**
 * Auth layout — minimal wrapper for /signin and /signup pages.
 * Centered card on a gradient background, no navigation chrome.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 md:p-10">
      {/* Subtle radial gradient behind the form */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(125% 125% at 50% 10%, var(--background) 40%, hsl(262 83% 58% / 0.12) 100%)',
        }}
      />
      <div className="w-full max-w-sm md:max-w-4xl">{children}</div>
    </div>
  );
}
