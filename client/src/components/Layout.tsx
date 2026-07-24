import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import type { Person, Project } from "@shared/types";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/people", label: "Persone", icon: "👥" },
  { href: "/projects", label: "Progetti", icon: "📁" },
  { href: "/staffing", label: "Staffing", icon: "🧩" },
  { href: "/calendar", label: "Calendario", icon: "📅" },
  { href: "/settings", label: "Impostazioni", icon: "⚙️" },
];

function GlobalSearch() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function ensureLoaded() {
    if (loaded) return;
    setLoaded(true);
    Promise.all([api.get<Person[]>("/people"), api.get<Project[]>("/projects")]).then(([p, pr]) => {
      setPeople(p);
      setProjects(pr);
    });
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const matchedPeople = q ? people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const matchedProjects = q ? projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const hasResults = matchedPeople.length > 0 || matchedProjects.length > 0;

  function goTo(href: string) {
    navigate(href);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative px-3 pt-3">
      <input
        type="text"
        placeholder="Cerca persone o progetti…"
        value={query}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      />
      {open && q && (
        <div className="absolute left-3 right-3 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {!hasResults && <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Nessun risultato</p>}
          {matchedPeople.length > 0 && (
            <div>
              <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">Persone</p>
              {matchedPeople.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goTo(`/people/${p.id}`)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {matchedProjects.length > 0 && (
            <div>
              <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">Progetti</p>
              {matchedProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goTo(`/projects/${p.id}`)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-700">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            WF
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-100">WorkForce</span>
        </div>

        <GlobalSearch />

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          <button
            onClick={toggleTheme}
            className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Tema chiaro" : "Tema scuro"}
          </button>
          <div className="mb-2 truncate px-2 text-xs text-slate-500 dark:text-slate-400">{user?.email}</div>
          <button
            onClick={() => logout()}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
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
