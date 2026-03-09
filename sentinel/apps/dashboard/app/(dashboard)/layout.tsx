import { Sidebar } from "@/components/sidebar";
import { NAV_ITEMS } from "@/lib/rbac";

/**
 * Dashboard layout — wraps all authenticated pages with a sidebar.
 *
 * In the full implementation this will:
 * 1. Fetch the session via getServerSession(authOptions)
 * 2. Redirect unauthenticated users to /login
 * 3. Filter NAV_ITEMS via getVisibleNavItems(session.user.role)
 *
 * For the MVP scaffold we render the full sidebar for all users.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // MVP: show all nav items. Wire to session later.
  const visibleItems = NAV_ITEMS;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={visibleItems} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
