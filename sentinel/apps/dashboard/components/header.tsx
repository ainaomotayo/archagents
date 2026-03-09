"use client";

import { useState } from "react";
import { IconSearch, IconBell, IconSettings, IconUser, IconShieldCheck } from "./icons";

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="flex h-[52px] items-center justify-between border-b border-border bg-surface-1/80 px-6 backdrop-blur-sm">
      {/* Left: Breadcrumb / context */}
      <div className="flex items-center gap-3">
        <span className="hidden text-[11px] font-medium uppercase tracking-widest text-text-tertiary sm:block">
          Workspace
        </span>
        <span className="hidden text-text-tertiary sm:block">/</span>
        <span className="text-[13px] font-semibold text-text-primary">
          Acme Corp
        </span>
        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
          Pro
        </span>
      </div>

      {/* Center: Search trigger */}
      <button
        onClick={() => setSearchOpen(!searchOpen)}
        className="hidden items-center gap-2 rounded-lg border border-border bg-surface-0/50 px-3 py-1.5 text-[12px] text-text-tertiary transition-all hover:border-border-accent hover:text-text-secondary md:flex"
        aria-label="Open search"
      >
        <IconSearch className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="ml-6 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
          /
        </kbd>
      </button>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-secondary focus-ring"
          aria-label="Notifications"
        >
          <IconBell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-status-fail" />
        </button>
        <a
          href="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-secondary focus-ring"
          aria-label="Settings"
        >
          <IconSettings className="h-4 w-4" />
        </a>
        <div className="ml-2 h-5 w-px bg-border" />
        <button
          className="ml-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 focus-ring"
          aria-label="User menu"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-muted text-[11px] font-bold text-text-inverse">
            A
          </div>
          <span className="hidden text-[12px] font-medium text-text-secondary sm:block">
            Admin
          </span>
        </button>
      </div>
    </header>
  );
}
