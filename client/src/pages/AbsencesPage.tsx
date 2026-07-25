import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { differenceInCalendarDays } from "date-fns";
import { api } from "../lib/api";
import type { Absence, AbsenceStatus, AbsenceType, Person } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import Button from "../components/Button";
import { Badge, Select, SortableTh } from "../components/ui";
import AbsenceModal, {
  ABSENCE_COLOR,
  ABSENCE_LABEL,
  ABSENCE_STATUSES,
  ABSENCE_STATUS_COLOR,
  ABSENCE_STATUS_LABEL,
  ABSENCE_TYPES,
} from "../components/AbsenceModal";
import { compareValues, useSortable } from "../lib/sort";

type SortKey = "personName" | "type" | "status" | "startDate" | "days";

function daysOf(a: Absence): number {
  return differenceInCalendarDays(new Date(a.endDate), new Date(a.startDate)) + 1;
}

export default function AbsencesPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);
  const [personFilter, setPersonFilter] = useState<number | "">("");
  const [typeFilter, setTypeFilter] = useState<AbsenceType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AbsenceStatus | "all">("all");
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sortKey, sortDir, onSort } = useSortable<SortKey>("startDate");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.get<Absence[]>("/absences"), api.get<Person[]>("/people")])
      .then(([a, p]) => {
        setAbsences(a);
        setPeople(p);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const yearOptions = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const a of absences) {
      years.add(new Date(a.startDate).getFullYear());
      years.add(new Date(a.endDate).getFullYear());
    }
    return [...years].sort((x, y) => y - x);
  }, [absences, currentYear]);

  const yearStart = `${yearFilter}-01-01`;
  const yearEnd = `${yearFilter}-12-31`;

  const filtered = absences.filter((a) => {
    if (personFilter !== "" && a.personId !== personFilter) return false;
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (a.endDate < yearStart || a.startDate > yearEnd) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const value = (x: Absence): string | number => {
      switch (sortKey) {
        case "personName":
          return x.personName ?? "";
        case "type":
          return ABSENCE_LABEL[x.type];
        case "status":
          return ABSENCE_STATUS_LABEL[x.status];
        case "days":
          return daysOf(x);
        default:
          return x.startDate;
      }
    };
    return compareValues(value(a), value(b), sortDir);
  });

  const daysByPerson = useMemo(() => {
    const map = new Map<number, { personName: string; days: number }>();
    for (const a of absences) {
      if (a.status === "rifiutata") continue;
      if (a.endDate < yearStart || a.startDate > yearEnd) continue;
      const clippedStart = a.startDate < yearStart ? yearStart : a.startDate;
      const clippedEnd = a.endDate > yearEnd ? yearEnd : a.endDate;
      const days = differenceInCalendarDays(new Date(clippedEnd), new Date(clippedStart)) + 1;
      const entry = map.get(a.personId) ?? { personName: a.personName ?? "—", days: 0 };
      entry.days += days;
      map.set(a.personId, entry);
    }
    return [...map.entries()]
      .map(([personId, v]) => ({ personId, ...v }))
      .sort((x, y) => y.days - x.days);
  }, [absences, yearStart, yearEnd]);

  async function handleDelete(id: number) {
    if (!confirm("Rimuovere questa assenza?")) return;
    await api.delete(`/absences/${id}`);
    load();
  }

  async function handleStatusChange(id: number, status: AbsenceStatus) {
    await api.put(`/absences/${id}/status`, { status });
    load();
  }

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === sorted.length ? new Set() : new Set(sorted.map((a) => a.id))));
  }

  async function handleBulkStatusChange(status: AbsenceStatus) {
    setBulkSaving(true);
    try {
      await Promise.all([...selected].map((id) => api.put(`/absences/${id}/status`, { status })));
      setSelected(new Set());
      load();
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await api.post<{ imported: number; skipped?: number }>("/absences/import", { csv: text });
    const skippedMsg = result.skipped ? ` (${result.skipped} righe saltate per dati non validi)` : "";
    alert(`Importate ${result.imported} assenze.${skippedMsg}`);
    load();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ferie / Assenze</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{absences.length} assenze registrate</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.open("/api/absences/csv-template", "_blank")}>
            Template CSV
          </Button>
          <Button variant="secondary" onClick={() => window.open("/api/absences/export", "_blank")}>
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
            disabled={people.length === 0}
          >
            + Nuova assenza
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Riepilogo giorni per persona — {yearFilter}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Esclude le assenze rifiutate</p>
        </CardHeader>
        <CardBody className="space-y-2">
          {daysByPerson.length === 0 ? (
            <p className="py-2 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assenza in questo anno</p>
          ) : (
            daysByPerson.map((p) => {
              const maxDays = Math.max(...daysByPerson.map((d) => d.days), 1);
              return (
                <Link
                  key={p.personId}
                  href={`/people/${p.personId}`}
                  className="block rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200">{p.personName}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{p.days} gg</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(p.days / maxDays) * 100}%` }}
                    />
                  </div>
                </Link>
              );
            })
          )}
        </CardBody>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={personFilter} onChange={(e) => setPersonFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Tutte le persone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AbsenceType | "all")}>
          <option value="all">Tutti i tipi</option>
          {ABSENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {ABSENCE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AbsenceStatus | "all")}>
          <option value="all">Tutti gli stati</option>
          {ABSENCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ABSENCE_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-brand-50 dark:bg-brand-500/10 px-4 py-2.5 text-sm">
          <span className="text-brand-700 dark:text-brand-400">{selected.size} selezionate</span>
          <div className="flex gap-2">
            <button
              className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
              disabled={bulkSaving}
              onClick={() => handleBulkStatusChange("approvata")}
            >
              Approva selezionate
            </button>
            <button
              className="font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
              disabled={bulkSaving}
              onClick={() => handleBulkStatusChange("rifiutata")}
            >
              Rifiuta selezionate
            </button>
          </div>
        </div>
      )}

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
          ) : absences.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assenza registrata</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessun risultato per i filtri selezionati</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="w-10 px-5 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === sorted.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                    />
                  </th>
                  <SortableTh label="Persona" sortKey="personName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Tipo" sortKey="type" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Stato" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Periodo" sortKey="startDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Giorni" sortKey="days" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <th className="px-5 py-3">Note</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {sorted.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelected(a.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                      />
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      <Link href={`/people/${a.personId}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                        {a.personName}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={ABSENCE_COLOR[a.type]}>{ABSENCE_LABEL[a.type]}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={ABSENCE_STATUS_COLOR[a.status]}>{ABSENCE_STATUS_LABEL[a.status]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {a.startDate} → {a.endDate}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{daysOf(a)}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{a.notes || "—"}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {a.status !== "approvata" && (
                        <button
                          className="mr-3 text-emerald-600 dark:text-emerald-400 hover:underline"
                          onClick={() => handleStatusChange(a.id, "approvata")}
                        >
                          Approva
                        </button>
                      )}
                      {a.status !== "rifiutata" && (
                        <button
                          className="mr-3 text-red-600 dark:text-red-400 hover:underline"
                          onClick={() => handleStatusChange(a.id, "rifiutata")}
                        >
                          Rifiuta
                        </button>
                      )}
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
          )}
        </CardBody>
      </Card>

      <AbsenceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        absence={editing}
        people={people}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
