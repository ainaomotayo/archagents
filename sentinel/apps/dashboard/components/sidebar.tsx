"use client";

import { NavItem } from "./nav-item";
import type { NavItem as NavItemType } from "@/lib/rbac";

interface SidebarProps {
  items: NavItemType[];
}

export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900">
      {/* Logo / branding */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-6">
        <span className="text-xl font-bold text-white">SENTINEL</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => (
          <NavItem
            key={item.href}
            label={item.label}
            href={item.href}
            icon={item.icon}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 px-6 py-4 text-xs text-slate-500">
        SENTINEL MVP v0.1
      </div>
    </aside>
  );
}
