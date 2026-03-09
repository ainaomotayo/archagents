"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICON_MAP } from "./icons";

interface NavItemProps {
  label: string;
  href: string;
  icon: string;
  collapsed?: boolean;
}

export function NavItem({ label, href, icon, collapsed }: NavItemProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  const Icon = ICON_MAP[icon];

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center rounded-lg transition-all duration-150 focus-ring ${
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-2.5 py-2"
      } text-[13px] font-medium ${
        isActive
          ? "bg-surface-3 text-accent"
          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      }`}
    >
      {isActive && <span className="nav-active-indicator" />}
      <span className={`flex items-center justify-center ${collapsed ? "" : "w-5"}`}>
        {Icon ? (
          <Icon
            className={`h-[16px] w-[16px] ${
              isActive
                ? "text-accent"
                : "text-text-tertiary group-hover:text-text-secondary"
            }`}
          />
        ) : null}
      </span>
      {!collapsed && label}
    </Link>
  );
}
