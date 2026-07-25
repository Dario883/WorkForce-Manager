import { useEffect, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { api, ApiError } from "../lib/api";
import type { Absence, CapacityPeriod, Person } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import Button from "../components/Button";
import { Badge, Field, Input } from "../components/ui";
import PersonModal from "../components/PersonModal";
import { ABSENCE_COLOR, ABSENCE_LABEL, ABSENCE_STATUS_COLOR, ABSENCE_STATUS_LABEL } from "../components/AbsenceModal";

interface PersonAssignment {
  id: number;
  projectId: number;
  projectName: string;
  projectColor: string;
  percentage: number;
  startDate: string;
  endDate: string;
  periodType: string;
}

export default function PersonDetailPage({ id }: { id: number }) {
  const [person, setPerson] = useState<Person | null>(null);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [history, setHistory] = useState<PersonAssignment[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [capacityPeriods, setCapacityPeriods] = useState<CapacityPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [capacityFormOpen, setCapacityFormOpen] = useState(false);
  const [capStartDate, setCapStartDate] = useState("");
  const [capEndDate, setCapEndDate] = useState("");
  const [capHours, setCapHours] = useState(40);
  const [savingCapacity, setSavingCapacity] = useState(false);

  function load() {
    Promise.all([
      api.get<Person>(`/people/${id}`),
      api.get<PersonAssignment[]>(`/people/${id}/assignments`),
      api.get<CapacityPeriod[]>(`/people/${id}/capacity`),
      api.get<Person[]>("/people"),
      api.get<Absence[]>("/absences"),
    ])
      .then(([p, a, c, all, allAbsences]) => {
        setPerson(p);
        setHistory(a.sort((x, y) => (x.startDate < y.startDate ? 1 : -1)));
        setCapacityPeriods(c);
        setAllPeople(all);
        setAbsences(allAbsences.filter((ab) => ab.personId === id).sort((x, y) => (x.startDate < y.startDate ? -1 : 1)));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function handleAddCapacityPeriod(e: React.FormEvent) {
    e.preventDefault();
    setSavingCapacity(true);
    try {
      await api.post(`/people/${id}/capacity`, {
        startDate: capStartDate,
        endDate: capEndDate || null,
        hoursPerWeek: capHours,
      });
      setCapacityFormOpen(false);
      setCapStartDate("");
      setCapEndDate("");
      setCapHours(40);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante il salvataggio del periodo di capacità.");
    } finally {
      setSavingCapacity(false);
    }
  }

  async function handleDeleteCapacityPeriod(capacityId: number) {
    if (!confirm("Rimuovere questo periodo di capacità?")) return;
    await api.delete(`/people/${id}/capacity/${capacityId}`);
    load();
  }

  if (loading) return <div className="text-slate-400 dark:text-slate-500">Caricamento…</div>;
  if (!person) return <div className="text-slate-400 dark:text-slate-500">Persona non trovata</div>;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const currentAssignments = history.filter((a) => a.startDate <= todayStr && a.endDate >= todayStr);
  const upcomingAbsences = absences.filter((a) => a.endDate >= todayStr && a.status !== "rifiutata").slice(0, 5);

  return (
    <div>
      <Link href="/people" className="mb-4 inline-block text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400">
        ← Torna a Persone
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
            className="grid h-14 w-14 place-items-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: person.avatarColor }}
          >
            {person.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{person.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {person.role || "Ruolo non specificato"} · {person.capacityHoursPerWeek}h/settimana
              {person.managerName && person.managerId && (
                <>
                  {" "}
                  · Responsabile:{" "}
                  <Link href={`/people/${person.managerId}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                    {person.managerName}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Modifica
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti attuali</h2>
          </CardHeader>
          <CardBody className="space-y-2">
            {currentAssignments.length === 0 ? (
              <p className="py-2 text-center text-sm text-slate-400 dark:text-slate-500">Nessun progetto attivo oggi</p>
            ) : (
              currentAssignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                  <Link href={`/projects/${a.projectId}`}>
                    <Badge color={a.projectColor}>{a.projectName}</Badge>
                  </Link>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{a.percentage}%</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Assenze</h2>
            <Link href="/absences" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
              Vedi tutte →
            </Link>
          </CardHeader>
          <CardBody className="space-y-2">
            {upcomingAbsences.length === 0 ? (
              <p className="py-2 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assenza in corso o futura</p>
            ) : (
              upcomingAbsences.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                  <div>
                    <Badge color={ABSENCE_COLOR[a.type]}>{ABSENCE_LABEL[a.type]}</Badge>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      {a.startDate} → {a.endDate}
                    </span>
                  </div>
                  <Badge color={ABSENCE_STATUS_COLOR[a.status]}>{ABSENCE_STATUS_LABEL[a.status]}</Badge>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Storico assegnazioni</h2>
        </CardHeader>
        <CardBody>
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assegnazione registrata</p>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 dark:border-slate-600 pl-4">
              {history.map((a) => (
                <li key={a.id} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: a.projectColor }}
                  />
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700/40 px-4 py-3">
                    <div>
                      <Badge color={a.projectColor}>{a.projectName}</Badge>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {a.startDate} → {a.endDate}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{a.percentage}%</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Capacità nel tempo</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sovrascrive la capacità base ({person.capacityHoursPerWeek}h/sett.) in periodi specifici
            </p>
          </div>
          <Button variant="secondary" onClick={() => setCapacityFormOpen((o) => !o)}>
            + Nuovo periodo
          </Button>
        </CardHeader>
        {capacityFormOpen && (
          <CardBody className="border-b border-slate-100 dark:border-slate-700">
            <form onSubmit={handleAddCapacityPeriod} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
              <Field label="Da">
                <Input type="date" required value={capStartDate} onChange={(e) => setCapStartDate(e.target.value)} />
              </Field>
              <Field label="A (vuoto = indeterminato)">
                <Input type="date" value={capEndDate} onChange={(e) => setCapEndDate(e.target.value)} />
              </Field>
              <Field label="Ore/settimana">
                <Input
                  type="number"
                  min={1}
                  max={80}
                  required
                  value={capHours}
                  onChange={(e) => setCapHours(Number(e.target.value))}
                />
              </Field>
              <Button type="submit" disabled={savingCapacity}>
                {savingCapacity ? "Salvataggio…" : "Salva periodo"}
              </Button>
            </form>
          </CardBody>
        )}
        <CardBody className="p-0">
          {capacityPeriods.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
              Nessun periodo speciale: si applica sempre la capacità base
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Da</th>
                  <th className="px-5 py-3">A</th>
                  <th className="px-5 py-3">Ore/settimana</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {capacityPeriods.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{c.startDate}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{c.endDate ?? "indeterminato"}</td>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{c.hoursPerWeek}h</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => handleDeleteCapacityPeriod(c.id)}
                      >
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

      <PersonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        person={person}
        people={allPeople}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
