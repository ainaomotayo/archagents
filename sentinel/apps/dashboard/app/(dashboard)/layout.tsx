import { Sidebar } from "@/components/sidebar";
import { NAV_ITEMS } from "@/lib/rbac";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const visibleItems = NAV_ITEMS;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <Sidebar items={visibleItems} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
