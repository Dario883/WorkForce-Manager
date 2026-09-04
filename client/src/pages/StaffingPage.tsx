import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { addMonths, addWeeks, addYears, endOfMonth, endOfWeek, endOfYear, format, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { api, ApiError } from "../lib/api";
import type { Assignment, Person, Project } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import { Badge, Input, Select, SortableTh } from "../components/ui";
import AssignmentModal from "../components/AssignmentModal";
import { compareValues, useSortable } from "../lib/sort";

type SortKey = "personName" | "projectName" | "percentage" | "startDate";
type ViewMode = "list" | "person";
type PeriodMode = "week" | "month" | "year";

export default function StaffingPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [search, setSearch] = useState("");
  const [personFilter, setPersonFilter] = useState<number | "">("");
  const [projectFilter, setProjectFilter] = useState<number | "">("");
  const [activeOn, setActiveOn] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode | "">("");
  const [periodAnchor, setPeriodAnchor] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sortKey, sortDir, onSort } = useSortable<SortKey>("startDate");

  const filteredAssignments = assignments.filter((a) => {
    const q = search.trim().toLowerCase();
    if (q && !a.personName?.toLowerCase().includes(q) && !a.projectName?.toLowerCase().includes(q)) return false;
    if (personFilter !== "" && a.personId !== personFilter) return false;
    if (projectFilter !== "" && a.projectId !== projectFilter) return false;
    if (activeOn && (a.startDate > activeOn || a.endDate < activeOn)) return false;
    if (periodMode) {
      const period = periodMode === "week"
        ? { start: startOfWeek(periodAnchor, { weekStartsOn: 1 }), end: endOfWeek(periodAnchor, { weekStartsOn: 1 }) }
        : periodMode === "month"
        ? { start: startOfMonth(periodAnchor), end: endOfMonth(periodAnchor) }
        : { start: startOfYear(periodAnchor), end: endOfYear(periodAnchor) };
      const from = format(period.start, "yyyy-MM-dd");
      const to = format(period.end, "yyyy-MM-dd");
      if (a.startDate > to || a.endDate < from) return false;
    }
    return true;
  });

  const sortedAssignments = [...filteredAssignments].sort((a, b) => {
    const value = (x: Assignment): string | number => {
      switch (sortKey) {
        case "personName":
          return x.personName ?? "";
        case "projectName":
          return x.projectName ?? "";
        case "percentage":
          return x.percentage;
        default:
          return x.startDate;
      }
    };
    return compareValues(value(a), value(b), sortDir);
  });

  const groupedByPerson = (() => {
    const map = new Map<number, { personName: string; rows: Assignment[] }>();
    for (const a of sortedAssignments) {
      const entry = map.get(a.personId) ?? { personName: a.personName ?? "—", rows: [] };
      entry.rows.push(a);
      map.set(a.personId, entry);
    }
    return [...map.entries()]
      .map(([personId, v]) => ({ personId, ...v }))
      .sort((a, b) => a.personName.localeCompare(b.personName));
  })();

  function togglePerson(personId: number) {
    setCollapsed((prev) => ({ ...prev, [personId]: !prev[personId] }));
  }

  function shiftPeriod(direction: 1 | -1) {
    setPeriodAnchor((date) => periodMode === "week" ? addWeeks(date, direction) : periodMode === "month" ? addMonths(date, direction) : addYears(date, direction));
  }

  function load() {
    setLoading(true);
    Promise.all([
      api.get<Assignment[]>("/assignments"),
      api.get<Person[]>("/people"),
      api.get<Project[]>("/projects"),
    ])
      .then(([a, p, pr]) => {
        setAssignments(a);
        setPeople(p);
        setProjects(pr);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(id: number) {
    if (!confirm("Rimuovere questa assegnazione?")) return;
    await api.delete(`/assignments/${id}`);
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = await api.post<{ imported: number; skipped?: number }>("/assignments/import", { csv: text });
      const skippedMsg = result.skipped ? ` (${result.skipped} righe saltate per dati non validi)` : "";
      alert(`Importate ${result.imported} assegnazioni.${skippedMsg}`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? `Import fallito: ${err.message}` : "Import fallito: errore imprevisto.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Staffing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{assignments.length} assegnazioni attive</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.open("/api/assignments/csv-template", "_blank")}>
            Template CSV
          </Button>
          <Button variant="secondary" onClick={() => window.open("/api/assignments/export", "_blank")}>
            Esporta CSV
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Importa CSV
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleImport} />
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            disabled={people.length === 0 || projects.length === 0}
          >
            + Nuova assegnazione
          </Button>
        </div>
      </div>

      {(people.length === 0 || projects.length === 0) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          Servono almeno una persona e un progetto prima di poter creare un'assegnazione.
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="text"
          placeholder="Cerca per persona o progetto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={personFilter} onChange={(e) => setPersonFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Tutte le persone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Tutti i progetti</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={activeOn} onChange={(e) => setActiveOn(e.target.value)} title="Attive in questa data" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
          {(["", "week", "month", "year"] as const).map((mode) => (
            <button key={mode || "all"} onClick={() => setPeriodMode(mode)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${periodMode === mode ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"}`}>
              {mode === "" ? "Tutto" : mode === "week" ? "Settimana" : mode === "month" ? "Mese" : "Anno"}
            </button>
          ))}
        </div>
        {periodMode && <>
          <Button variant="secondary" onClick={() => shiftPeriod(-1)}>←</Button>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {periodMode === "week" ? `${format(startOfWeek(periodAnchor, { weekStartsOn: 1 }), "dd/MM/yyyy")} – ${format(endOfWeek(periodAnchor, { weekStartsOn: 1 }), "dd/MM/yyyy")}` : periodMode === "month" ? format(periodAnchor, "MMMM yyyy") : format(periodAnchor, "yyyy")}
          </span>
          <Button variant="secondary" onClick={() => shiftPeriod(1)}>→</Button>
        </>}
      </div>

      <div className="mb-4 flex justify-end">
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5">
          {(["list", "person"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                viewMode === m ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {m === "list" ? "Lista" : "Per persona"}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
          ) : assignments.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assegnazione presente</p>
          ) : filteredAssignments.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessun risultato per i filtri selezionati</p>
          ) : viewMode === "list" ? (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <SortableTh label="Persona" sortKey="personName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Progetto" sortKey="projectName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="%" sortKey="percentage" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Periodo" sortKey="startDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {sortedAssignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      <Link href={`/people/${a.personId}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                        {a.personName}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/projects/${a.projectId}`}>
                        <Badge color={a.projectColor}>{a.projectName}</Badge>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{a.percentage}%</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {a.startDate} → {a.endDate}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="mr-3 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                        onClick={() => {
                          setEditing(a);
                          setModalOpen(true);
                        }}
                      >
                        Modifica
                      </button>
                      <button className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400" onClick={() => handleDelete(a.id)}>
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Progetto</th>
                  <th className="px-5 py-3">%</th>
                  <th className="px-5 py-3">Periodo</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {groupedByPerson.map((g) => {
                  const isCollapsed = !!collapsed[g.personId];
                  return (
                    <Fragment key={g.personId}>
                      <tr className="bg-slate-50 dark:bg-slate-700/40">
                        <td colSpan={4} className="px-5 py-2">
                          <button
                            className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100"
                            onClick={() => togglePerson(g.personId)}
                          >
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 dark:border-slate-600 text-xs">
                              {isCollapsed ? "+" : "−"}
                            </span>
                            <Link href={`/people/${g.personId}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                              {g.personName}
                            </Link>
                            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                              {g.rows.length} assegnazion{g.rows.length === 1 ? "e" : "i"}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        g.rows.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                            <td className="px-5 py-3 pl-12">
                              <Link href={`/projects/${a.projectId}`}>
                                <Badge color={a.projectColor}>{a.projectName}</Badge>
                              </Link>
                            </td>
                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{a.percentage}%</td>
                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                              {a.startDate} → {a.endDate}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                className="mr-3 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                                onClick={() => {
                                  setEditing(a);
                                  setModalOpen(true);
                                }}
                              >
                                Modifica
                              </button>
                              <button className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400" onClick={() => handleDelete(a.id)}>
                                Rimuovi
                              </button>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <AssignmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        assignment={editing}
        people={people}
        projects={projects}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
