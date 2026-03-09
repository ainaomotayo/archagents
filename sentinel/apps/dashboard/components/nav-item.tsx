"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICON_MAP } from "./icons";

interface NavItemProps {
  label: string;
  href: string;
  icon: string;
}

export function NavItem({ label, href, icon }: NavItemProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  const Icon = ICON_MAP[icon];

  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 focus-ring ${
        isActive
          ? "bg-surface-3 text-accent"
          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      }`}
    >
      {isActive && <span className="nav-active-indicator" />}
      <span className="flex w-5 items-center justify-center">
        {Icon ? <Icon className={isActive ? "text-accent" : "text-text-tertiary group-hover:text-text-secondary"} /> : null}
      </span>
      {label}
    </Link>
  );
}
