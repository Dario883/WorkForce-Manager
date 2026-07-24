import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { differenceInCalendarDays } from "date-fns";
import { api } from "../lib/api";
import type { Absence, AbsenceType, Person } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import Button from "../components/Button";
import { Badge, Select } from "../components/ui";
import AbsenceModal, { ABSENCE_COLOR, ABSENCE_LABEL, ABSENCE_TYPES } from "../components/AbsenceModal";

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
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState<number>(currentYear);

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
    if (a.endDate < yearStart || a.startDate > yearEnd) return false;
    return true;
  });

  const daysByPerson = useMemo(() => {
    const map = new Map<number, { personName: string; days: number }>();
    for (const a of absences) {
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ferie / Assenze</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{absences.length} assenze registrate</p>
        </div>
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

      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Riepilogo giorni per persona — {yearFilter}</h2>
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

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <Select value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

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
                  <th className="px-5 py-3">Persona</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Periodo</th>
                  <th className="px-5 py-3">Giorni</th>
                  <th className="px-5 py-3">Note</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      <Link href={`/people/${a.personId}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                        {a.personName}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={ABSENCE_COLOR[a.type]}>{ABSENCE_LABEL[a.type]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {a.startDate} → {a.endDate}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{daysOf(a)}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{a.notes || "—"}</td>
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
