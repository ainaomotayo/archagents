"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { IconSearch, IconBell, IconSettings, IconUser, IconShieldCheck } from "./icons";
import { NAV_ITEMS } from "@/lib/rbac";

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [orgName, setOrgName] = useState<string>("My Organization");
  const { data: session } = useSession();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchModalRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const userName = session?.user?.name ?? "Admin";
  const userEmail = session?.user?.email ?? "admin@sentinel.local";
  const userRole = session?.user?.role ?? "admin";
  const userInitial = userName.charAt(0).toUpperCase();

  // Fetch org name from the API
  useEffect(() => {
    fetch("/api/org")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.name) setOrgName(data.name); })
      .catch(() => {});
  }, []);

  // Keyboard shortcut: "/" to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !searchOpen && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  // Focus search input when modal opens
  useEffect(() => {
    if (searchOpen) {
      setSearchQuery("");
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [searchOpen]);

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [userMenuOpen]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [searchQuery]);

  const handleSearchSelect = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  return (
    <>
      <header className="flex h-[52px] items-center justify-between border-b border-border bg-surface-1/80 px-6 backdrop-blur-sm">
        {/* Left: Breadcrumb / context */}
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] font-medium uppercase tracking-widest text-text-tertiary sm:block">
            Workspace
          </span>
          <span className="hidden text-text-tertiary sm:block">/</span>
          <span className="text-[13px] font-semibold text-text-primary">
            {orgName}
          </span>
          <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
            Pro
          </span>
        </div>

        {/* Center: Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
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
          <Link
            href="/audit"
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-secondary focus-ring"
            aria-label="Notifications"
          >
            <IconBell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-status-fail" />
          </Link>
          <a
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-secondary focus-ring"
            aria-label="Settings"
          >
            <IconSettings className="h-4 w-4" />
          </a>
          <div className="ml-2 h-5 w-px bg-border" />
          {/* User menu */}
          <div className="relative ml-2" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 focus-ring"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-muted text-[11px] font-bold text-text-inverse">
                {userInitial}
              </div>
              <span className="hidden text-[12px] font-medium text-text-secondary sm:block">
                {userName}
              </span>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface-1 shadow-lg">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-[13px] font-semibold text-text-primary">{userName}</p>
                  <p className="text-[11px] text-text-tertiary">{userEmail}</p>
                  <span className="mt-1 inline-block rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                    {userRole}
                  </span>
                </div>
                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-[12px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                  >
                    <IconSettings className="h-3.5 w-3.5" />
                    Settings
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-2 px-4 py-2 text-[12px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-status-fail"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search Command Palette */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-surface-0/60 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          {/* Modal */}
          <div
            ref={searchModalRef}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <IconSearch className="h-4 w-4 text-text-tertiary" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-text-primary placeholder-text-tertiary outline-none"
              />
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
                Esc
              </kbd>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              {filteredItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-text-tertiary">
                  No results found
                </div>
              ) : (
                filteredItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleSearchSelect}
                    className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-[10px] text-text-tertiary">
                      {item.label.charAt(0)}
                    </span>
                    <span>{item.label}</span>
                    <span className="ml-auto text-[11px] text-text-tertiary">{item.href}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
