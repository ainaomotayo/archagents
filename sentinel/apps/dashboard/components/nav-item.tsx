"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItemProps {
  label: string;
  href: string;
  icon: string;
}

const ICON_MAP: Record<string, string> = {
  home: "\u2302",
  folder: "\uD83D\uDCC1",
  search: "\uD83D\uDD0D",
  shield: "\uD83D\uDEE1\uFE0F",
  "file-text": "\uD83D\uDCC4",
  clock: "\uD83D\uDD53",
  settings: "\u2699\uFE0F",
};

export function NavItem({ label, href, icon }: NavItemProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
      }`}
    >
      <span className="w-5 text-center" aria-hidden>
        {ICON_MAP[icon] ?? "\u25CF"}
      </span>
      {label}
    </Link>
  );
}
