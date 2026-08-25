import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import type { Person, Project } from "@shared/types";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊", tab: "dashboard" },
  { href: "/people", label: "Persone", icon: "👥", tab: "people" },
  { href: "/projects", label: "Progetti", icon: "📁", tab: "projects" },
  { href: "/per-pm", label: "Per PM", icon: "🗂️", tab: "per-pm" },
  { href: "/staffing", label: "Staffing", icon: "🧩", tab: "staffing" },
  { href: "/calendar", label: "Calendario", icon: "📅", tab: "calendar" },
  { href: "/absences", label: "Ferie/Assenze", icon: "🌴", tab: "absences" },
  { href: "/settings", label: "Impostazioni", icon: "⚙️", tab: "settings" },
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
  const { user, logout, can } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAdmin = user?.permissions === null;

  async function handleResetData() {
    if (!isAdmin) return;
    const confirmed = window.confirm("Vuoi davvero svuotare tutti i dati applicativi? Questa azione cancella persone, progetti, assegnazioni, assenze, impostazioni e log. Gli utenti admin rimarranno intatti.");
    if (!confirmed) return;

    try {
      await api.post("/admin/reset-data");
      window.alert("Dati svuotati correttamente.");
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore durante lo svuotamento dei dati.";
      window.alert(message);
    }
  }

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 sm:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-700 dark:bg-slate-800 sm:static sm:z-auto sm:w-60 sm:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : ""
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-700">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            WF
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-100">WorkForce</span>
        </div>

        <GlobalSearch />

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.filter((item) => can(item.tab)).map((item) => {
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
          {isAdmin && (
            <button
              onClick={handleResetData}
              className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <span>🗑️</span>
              Svuota dati
            </button>
          )}
          <div className="mb-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            BUILD TEST: admin menu active
          </div>
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

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800 sm:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Apri menu"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ☰
          </button>
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-xs font-bold text-white">WF</div>
          <span className="font-semibold text-slate-800 dark:text-slate-100">WorkForce</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
