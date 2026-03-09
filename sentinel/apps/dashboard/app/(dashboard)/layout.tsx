import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
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
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
