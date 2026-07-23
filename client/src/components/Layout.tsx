import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/people", label: "Persone", icon: "👥" },
  { href: "/projects", label: "Progetti", icon: "📁" },
  { href: "/staffing", label: "Staffing", icon: "🧩" },
  { href: "/calendar", label: "Calendario", icon: "📅" },
  { href: "/settings", label: "Impostazioni", icon: "⚙️" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            WF
          </div>
          <span className="font-semibold text-slate-800">WorkForce</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 truncate px-2 text-xs text-slate-500">{user?.email}</div>
          <button
            onClick={() => logout()}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Esci
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
