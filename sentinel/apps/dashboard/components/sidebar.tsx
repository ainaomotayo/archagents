"use client";

import { NavItem } from "./nav-item";
import { IconShieldCheck, IconActivity } from "./icons";
import type { NavItem as NavItemType } from "@/lib/rbac";

interface SidebarProps {
  items: NavItemType[];
}

export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="flex h-screen w-[260px] flex-shrink-0 flex-col border-r border-border bg-surface-1">
      {/* Logo */}
      <div className="flex h-[60px] items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle">
          <IconShieldCheck className="h-[18px] w-[18px] text-accent" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-wide text-text-primary">SENTINEL</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">Governance</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
          Navigation
        </p>
        {items.slice(0, 4).map((item) => (
          <NavItem key={item.href} label={item.label} href={item.href} icon={item.icon} />
        ))}

        <div className="my-4 border-t border-border-subtle" />

        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
          Compliance
        </p>
        {items.slice(4, 8).map((item) => (
          <NavItem key={item.href} label={item.label} href={item.href} icon={item.icon} />
        ))}

        {items.length > 8 && (
          <>
            <div className="my-4 border-t border-border-subtle" />
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
              System
            </p>
            {items.slice(8).map((item) => (
              <NavItem key={item.href} label={item.label} href={item.href} icon={item.icon} />
            ))}
          </>
        )}
      </nav>

      {/* Status footer */}
      <div className="border-t border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <IconActivity className="h-3.5 w-3.5 text-status-pass" />
          <span className="text-[11px] font-medium text-text-secondary">All systems operational</span>
        </div>
        <p className="mt-1 text-[10px] text-text-tertiary">v0.1.0</p>
      </div>
    </aside>
  );
}
