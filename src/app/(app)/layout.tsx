"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthProvider, { useAuth } from "@/components/AuthProvider";

const CENTRE = process.env.NEXT_PUBLIC_CENTRE_NAME ?? "Service Centre";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/inward", label: "New inward" },
  { href: "/jobs", label: "Jobs and search" },
  { href: "/reports", label: "Reports" },
  { href: "/customers", label: "Customers" },
  { href: "/stock", label: "Stock" },
  { href: "/data", label: "Import / Export" },
  { href: "/visits", label: "Visit locations" },
  { href: "/issues", label: "Issue categories", adminOnly: true },
  { href: "/users", label: "Team", adminOnly: true },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const path = usePathname();
  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col bg-ink text-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 print:hidden">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="text-base font-semibold tracking-tight">Service Desk</div>
          <div className="mt-0.5 truncate text-xs text-slate-400">{CENTRE}</div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-1 md:flex-col md:overflow-visible">
          {NAV.filter((n) => !n.adminOnly || profile?.role === "admin").map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded bg-sky-400" />}
                {n.label}
              </Link>
            );
          })}
          <button
            onClick={signOut}
            className="ml-auto whitespace-nowrap rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white md:hidden"
          >
            Sign out
          </button>
        </nav>

        <div className="hidden items-center gap-3 border-t border-white/10 px-4 py-4 md:flex">
          <div className="mono flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{profile?.full_name}</div>
            <button onClick={signOut} className="text-xs text-slate-400 hover:text-white">
              Sign out
            </button>
          </div>
        </div>
        <div className="mono hidden px-4 pb-3 text-[10px] text-slate-500 md:block">build v13 (6 Nov)</div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8 print:p-0">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
