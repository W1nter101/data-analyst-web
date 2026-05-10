import { AuthGuard } from '@/components/auth/AuthGuard';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

/**
 * Dashboard layout — wraps all /dashboard/* routes with:
 * 1. AuthGuard (outermost — redirects unauthenticated users)
 * 2. DashboardShell (two-column layout with left panel + right panel)
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
