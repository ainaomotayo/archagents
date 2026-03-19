"use client";

import { useState, createContext, useContext } from "react";
import { NavItem } from "./nav-item";
import { IconShieldCheck, IconActivity, IconChevronLeft } from "./icons";
import type { NavItem as NavItemType } from "@/lib/rbac";

const SidebarContext = createContext({ collapsed: false });
export const useSidebar = () => useContext(SidebarContext);

interface SidebarProps {
  items: NavItemType[];
}

export function Sidebar({ items }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <aside
        className={`flex h-screen flex-shrink-0 flex-col border-r border-border bg-surface-1 transition-all duration-200 ${
          collapsed ? "w-[60px]" : "w-[240px]"
        }`}
      >
        {/* Logo */}
        <div className="flex h-[52px] items-center justify-between border-b border-border px-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-subtle">
              <IconShieldCheck className="h-[18px] w-[18px] text-accent" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-[13px] font-bold tracking-wide text-text-primary">
                  SENTINEL
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-text-tertiary transition-all hover:bg-surface-2 hover:text-text-secondary ${
              collapsed ? "rotate-180" : ""
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {!collapsed && (
            <p className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-widest text-text-tertiary">
              Navigation
            </p>
          )}
          {items.slice(0, 3).map((item) => (
            <NavItem
              key={item.href}
              label={item.label}
              href={item.href}
              icon={item.icon}
              collapsed={collapsed}
              badge={item.badge}
            />
          ))}

          <div className="my-3 border-t border-border-subtle" />

          {!collapsed && (
            <p className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-widest text-text-tertiary">
              Compliance
            </p>
          )}
          {items.slice(3, 9).map((item) => (
            <NavItem
              key={item.href}
              label={item.label}
              href={item.href}
              icon={item.icon}
              collapsed={collapsed}
              badge={item.badge}
            />
          ))}

          <div className="my-3 border-t border-border-subtle" />

          {!collapsed && (
            <p className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-widest text-text-tertiary">
              Tools
            </p>
          )}
          {items.slice(9, 12).map((item) => (
            <NavItem
              key={item.href}
              label={item.label}
              href={item.href}
              icon={item.icon}
              collapsed={collapsed}
              badge={item.badge}
            />
          ))}

          {items.length > 12 && (
            <>
              <div className="my-3 border-t border-border-subtle" />
              {!collapsed && (
                <p className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-widest text-text-tertiary">
                  System
                </p>
              )}
              {items.slice(12).map((item) => (
                <NavItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  collapsed={collapsed}
                />
              ))}
            </>
          )}
        </nav>

        {/* Status footer */}
        <div className="border-t border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <IconActivity className="h-3 w-3 flex-shrink-0 text-status-pass" />
            {!collapsed && (
              <span className="text-[10px] font-medium text-text-secondary">
                All systems operational
              </span>
            )}
          </div>
          {!collapsed && (
            <p className="mt-1 pl-5 text-[9px] text-text-tertiary">v0.1.0</p>
          )}
        </div>
      </aside>
    </SidebarContext.Provider>
  );
}
