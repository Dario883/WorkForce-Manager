import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Assignment, Project, StaffingSnapshot } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Field, Input } from "../components/ui";
import AssignmentModal from "../components/AssignmentModal";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";

type ViewMode = "week" | "month";
type ViewUnit = "percentage" | "hours";

function allocColor(total: number) {
  if (total === 0) return "bg-slate-50 text-slate-300";
  if (total < 70) return "bg-amber-50 text-amber-700";
  if (total <= 100) return "bg-emerald-50 text-emerald-700";
  return "bg-red-50 text-red-700";
}

// Conversion assumes a 5-day (Mon-Fri) work week: weekend days have no
// daily capacity, so hours can't be derived from a weekend percentage.
function dailyCapacity(capacityHoursPerWeek: number) {
  return capacityHoursPerWeek / 5;
}

function pctToHoursLabel(pct: number, capacityHoursPerWeek: number, weekend: boolean): string {
  if (weekend) return "—";
  if (pct === 0) return "—";
  const hours = dailyCapacity(capacityHoursPerWeek) * (pct / 100);
  return `${hours.toFixed(1)}h`;
}

function hoursToPct(hours: number, capacityHoursPerWeek: number): number {
  const capacity = dailyCapacity(capacityHoursPerWeek);
  if (capacity <= 0) return 0;
  return Math.round((hours / capacity) * 100);
}

type DayCell = { assignmentId: number; percentage: number };
type ProjectRow = {
  key: string;
  projectId: number;
  projectName: string;
  projectColor: string;
  assignmentIds: number[];
  byDay: Record<string, DayCell>;
};

// Assignments for the same project are grouped into a single visual row
// whenever their date ranges don't overlap (e.g. after splitting a day for a
// percentage change) — editing a free cell then never needs to add a row.
// If two assignments of the same project DO overlap (e.g. a genuine second
// allocation was added on top), they must stay visible and editable as
// separate rows — silently summing them would hide real data from the user.
// This is a standard interval-partitioning: assignments are packed into the
// fewest non-overlapping "lines" per project.
function buildProjectRows(rows: Assignment[], dayKeys: string[]): ProjectRow[] {
  const byProject = new Map<number, Assignment[]>();
  for (const a of rows) {
    const list = byProject.get(a.projectId) ?? [];
    list.push(a);
    byProject.set(a.projectId, list);
  }

  const result: ProjectRow[] = [];
  for (const [projectId, assignments] of byProject) {
    const sorted = [...assignments].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const lines: Assignment[][] = [];
    for (const a of sorted) {
      const line = lines.find((l) => l[l.length - 1].endDate < a.startDate);
      if (line) line.push(a);
      else lines.push([a]);
    }

    lines.forEach((line, idx) => {
      const byDay: Record<string, DayCell> = {};
      for (const a of line) {
        for (const key of dayKeys) {
          if (key >= a.startDate && key <= a.endDate) {
            byDay[key] = { assignmentId: a.id, percentage: a.percentage };
          }
        }
      }
      result.push({
        key: `${projectId}-${idx}`,
        projectId,
        projectName: line[0].projectName ?? "",
        projectColor: line[0].projectColor ?? "#3457d5",
        assignmentIds: line.map((a) => a.id),
        byDay,
      });
    });
  }
  return result;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 9.4a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4L14.5 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [viewUnit, setViewUnit] = useState<ViewUnit>("percentage");
  const [anchor, setAnchor] = useState(new Date());
  const [snapshot, setSnapshot] = useState<StaffingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editCell, setEditCell] = useState<{ personId: number; personName: string; date: string } | null>(
    null
  );
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [personAssignments, setPersonAssignments] = useState<Record<number, Assignment[]>>({});
  const [loadingRows, setLoadingRows] = useState<Record<number, boolean>>({});
  const [addFor, setAddFor] = useState<{ id: number; name: string } | null>(null);

  const range =
    view === "week"
      ? { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) }
      : { start: startOfMonth(anchor), end: endOfMonth(anchor) };

  function load() {
    setLoading(true);
    const from = format(range.start, "yyyy-MM-dd");
    const to = format(range.end, "yyyy-MM-dd");
    api
      .get<StaffingSnapshot>(`/staffing/snapshot?from=${from}&to=${to}`)
      .then(setSnapshot)
      .finally(() => setLoading(false));
  }

  useEffect(load, [view, anchor.toDateString()]);
  useEffect(() => {
    api.get<Project[]>("/projects").then(setProjects);
  }, []);

  const days = eachDayOfInterval({ start: range.start, end: range.end });

  function shiftPeriod(dir: 1 | -1) {
    setAnchor((a) => (view === "week" ? addWeeks(a, dir) : addMonths(a, dir)));
  }

  function loadPersonAssignments(personId: number) {
    setLoadingRows((prev) => ({ ...prev, [personId]: true }));
    return api
      .get<Assignment[]>(`/assignments?personId=${personId}`)
      .then((rows) => setPersonAssignments((prev) => ({ ...prev, [personId]: rows })))
      .finally(() => setLoadingRows((prev) => ({ ...prev, [personId]: false })));
  }

  function toggleExpand(personId: number) {
    const willExpand = !expanded[personId];
    setExpanded((prev) => ({ ...prev, [personId]: willExpand }));
    if (willExpand) loadPersonAssignments(personId);
  }

  async function handleCellCommit(
    personId: number,
    projectId: number,
    existingAssignmentId: number | null,
    date: string,
    percentage: number
  ) {
    if (existingAssignmentId) {
      await api.post(`/assignments/${existingAssignmentId}/split`, { date, unit: "day", percentage });
    } else {
      await api.post("/assignments", {
        personId,
        projectId,
        percentage,
        startDate: date,
        endDate: date,
        periodType: "day",
      });
    }
    await Promise.all([loadPersonAssignments(personId), load()]);
  }

  async function handleDeleteGroup(assignmentIds: number[], personId: number) {
    if (!confirm("Rimuovere questa assegnazione (tutte le sue righe)?")) return;
    await Promise.all(assignmentIds.map((id) => api.delete(`/assignments/${id}`)));
    await Promise.all([loadPersonAssignments(personId), load()]);
  }

  async function handleChangeRowProject(assignmentIds: number[], personId: number, newProjectId: number) {
    await Promise.all(assignmentIds.map((id) => api.put(`/assignments/${id}`, { projectId: newProjectId })));
    await Promise.all([loadPersonAssignments(personId), load()]);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario</h1>
          <p className="text-sm text-slate-500">
            {format(range.start, "d MMM", { locale: it })} – {format(range.end, "d MMM yyyy", { locale: it })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(["percentage", "hours"] as ViewUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => setViewUnit(u)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  viewUnit === u ? "bg-brand-500 text-white" : "text-slate-600"
                }`}
              >
                {u === "percentage" ? "%" : "Ore"}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(["week", "month"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  view === m ? "bg-brand-500 text-white" : "text-slate-600"
                }`}
              >
                {m === "week" ? "Settimana" : "Mese"}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => shiftPeriod(-1)}>
            ←
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(new Date())}>
            Oggi
          </Button>
          <Button variant="secondary" onClick={() => shiftPeriod(1)}>
            →
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          {loading || !snapshot ? (
            <p className="p-6 text-center text-sm text-slate-400">Caricamento…</p>
          ) : snapshot.people.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Nessuna persona registrata</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[200px] border-b border-r border-slate-100 bg-white px-4 py-3 text-left text-xs uppercase text-slate-500">
                    Persona
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className="min-w-[70px] border-b border-slate-100 px-2 py-3 text-center text-xs font-medium text-slate-500"
                    >
                      <div>{format(d, "EEE", { locale: it })}</div>
                      <div className="text-slate-400">{format(d, "d/M")}</div>
                    </th>
                  ))}
                  <th className="min-w-[40px] border-b border-slate-100"></th>
                </tr>
              </thead>
              <tbody>
                {snapshot.people.map((person) => {
                  const isExpanded = !!expanded[person.personId];
                  const rows = personAssignments[person.personId] ?? [];
                  const visibleRows = rows.filter(
                    (a) => a.endDate >= format(range.start, "yyyy-MM-dd") && a.startDate <= format(range.end, "yyyy-MM-dd")
                  );
                  const dayKeys = days.map((d) => format(d, "yyyy-MM-dd"));
                  const projectRows = buildProjectRows(visibleRows, dayKeys);
                  return (
                    <Fragment key={person.personId}>
                      <tr className="border-b border-slate-50">
                        <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-2 font-medium text-slate-700">
                          <button
                            className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"
                            onClick={() => toggleExpand(person.personId)}
                            title={isExpanded ? "Comprimi" : "Espandi assegnazioni"}
                          >
                            {isExpanded ? "−" : "+"}
                          </button>
                          {person.personName}
                        </td>
                        {days.map((d) => {
                          const key = format(d, "yyyy-MM-dd");
                          const cell = person.days[key];
                          const total = cell?.total ?? 0;
                          const weekend = isWeekend(d);
                          const label =
                            viewUnit === "percentage"
                              ? total > 0
                                ? `${total}%`
                                : "—"
                              : pctToHoursLabel(total, person.capacityHoursPerWeek, weekend);
                          return (
                            <td key={key} className="p-1 text-center">
                              <button
                                onClick={() =>
                                  setEditCell({ personId: person.personId, personName: person.personName, date: key })
                                }
                                className={`h-10 w-full rounded-md text-xs font-semibold transition hover:ring-2 hover:ring-brand-300 ${allocColor(
                                  total
                                )}`}
                                title={cell?.items.map((i) => `${i.projectName}: ${i.percentage}%`).join("\n")}
                              >
                                {label}
                              </button>
                            </td>
                          );
                        })}
                        <td className="border-b border-slate-50 bg-white"></td>
                      </tr>

                      {isExpanded && loadingRows[person.personId] && (
                        <tr key={`${person.personId}-loading`}>
                          <td colSpan={days.length + 2} className="bg-slate-50/40 px-4 py-2 text-xs text-slate-400">
                            Caricamento assegnazioni…
                          </td>
                        </tr>
                      )}

                      {isExpanded &&
                        !loadingRows[person.personId] &&
                        projectRows.map((g) => (
                          <tr key={`${person.personId}-${g.key}`} className="border-b border-slate-50 bg-slate-50/40">
                            <td className="sticky left-0 z-10 border-r border-slate-100 bg-slate-50/40 px-4 py-1.5 pl-9 text-xs text-slate-600">
                              <span
                                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                                style={{ backgroundColor: g.projectColor }}
                              />
                              <select
                                value={g.projectId}
                                title="Cambia progetto (percentuali e date restano invariate)"
                                className="rounded border-none bg-transparent py-0.5 text-xs text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-400"
                                onChange={(e) =>
                                  handleChangeRowProject(g.assignmentIds, person.personId, Number(e.target.value))
                                }
                              >
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {days.map((d) => {
                              const key = format(d, "yyyy-MM-dd");
                              const weekend = isWeekend(d);
                              const cell = g.byDay[key];

                              if (viewUnit === "hours" && weekend) {
                                return (
                                  <td
                                    key={key}
                                    className="p-1 text-center text-xs text-slate-300"
                                    title="Passa alla vista % per modificare i weekend"
                                  >
                                    —
                                  </td>
                                );
                              }
                              const pct = cell?.percentage ?? null;
                              const displayValue =
                                pct === null
                                  ? ""
                                  : viewUnit === "percentage"
                                  ? pct
                                  : Math.round(dailyCapacity(person.capacityHoursPerWeek) * (pct / 100) * 10) / 10;
                              return (
                                <td key={key} className="p-1">
                                  <input
                                    type="number"
                                    defaultValue={displayValue}
                                    placeholder="—"
                                    key={`${g.key}-${key}-${displayValue}-${viewUnit}`}
                                    className="h-8 w-full rounded border border-slate-200 text-center text-xs placeholder:text-slate-300 focus:border-brand-400 focus:outline-none"
                                    onBlur={(e) => {
                                      const raw = e.target.value.trim();
                                      if (raw === "") return;
                                      const rawNum = Number(raw);
                                      if (Number.isNaN(rawNum)) return;
                                      const newPct = viewUnit === "percentage" ? rawNum : hoursToPct(rawNum, person.capacityHoursPerWeek);
                                      if (pct !== null && newPct === pct) return;
                                      handleCellCommit(person.personId, g.projectId, cell?.assignmentId ?? null, key, newPct);
                                    }}
                                  />
                                </td>
                              );
                            })}
                            <td className="p-1 text-center">
                              <button
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Rimuovi assegnazione"
                                onClick={() => handleDeleteGroup(g.assignmentIds, person.personId)}
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        ))}

                      {isExpanded && !loadingRows[person.personId] && (
                        <tr key={`${person.personId}-add`} className="border-b border-slate-100 bg-slate-50/40">
                          <td colSpan={days.length + 2} className="px-4 py-1.5 pl-9">
                            <button
                              className="text-xs font-medium text-brand-600 hover:underline"
                              onClick={() => setAddFor({ id: person.personId, name: person.personName })}
                            >
                              + Nuova assegnazione
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <LegendDot className="bg-slate-50" label="0%" />
        <LegendDot className="bg-amber-50" label="< 70% (sotto-allocato)" />
        <LegendDot className="bg-emerald-50" label="70–100%" />
        <LegendDot className="bg-red-50" label="> 100% (sovra-allocato)" />
      </div>

      {editCell && (
        <EditCellModal
          cell={editCell}
          viewUnit={viewUnit}
          onClose={() => setEditCell(null)}
          onSaved={() => {
            setEditCell(null);
            load();
            if (expanded[editCell.personId]) loadPersonAssignments(editCell.personId);
          }}
        />
      )}

      {addFor && (
        <AssignmentModal
          open
          onClose={() => setAddFor(null)}
          assignment={null}
          projects={projects}
          lockedPerson={addFor}
          defaultStartDate={format(range.start, "yyyy-MM-dd")}
          defaultEndDate={format(range.end, "yyyy-MM-dd")}
          onSaved={() => {
            const personId = addFor.id;
            setAddFor(null);
            load();
            loadPersonAssignments(personId);
          }}
        />
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className} border border-slate-200`} />
      {label}
    </div>
  );
}

function EditCellModal({
  cell,
  viewUnit,
  onClose,
  onSaved,
}: {
  cell: { personId: number; personName: string; date: string };
  viewUnit: ViewUnit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assignments, setAssignments] = useState<
    { id: number; projectName: string; percentage: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api
      .get<any[]>(`/assignments?personId=${cell.personId}`)
      .then((all) => {
        const dayDate = new Date(cell.date);
        const active = all.filter((a) => {
          const s = new Date(a.startDate);
          const e = new Date(a.endDate);
          return dayDate >= s && dayDate <= e;
        });
        setAssignments(active);
        setEdits(Object.fromEntries(active.map((a) => [a.id, a.percentage])));
      })
      .finally(() => setLoading(false));
    api.get<Project[]>("/projects").then(setProjects);
  }, [cell]);

  async function handleSave() {
    setSaving(true);
    try {
      for (const a of assignments) {
        const newPct = edits[a.id];
        if (newPct !== a.percentage) {
          await api.post(`/assignments/${a.id}/split`, {
            date: cell.date,
            unit: "day",
            percentage: newPct,
          });
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (showAdd) {
    return (
      <AssignmentModal
        open
        onClose={onClose}
        assignment={null}
        projects={projects}
        lockedPerson={{ id: cell.personId, name: cell.personName }}
        defaultStartDate={cell.date}
        defaultEndDate={cell.date}
        onSaved={onSaved}
      />
    );
  }

  return (
    <Modal open onClose={onClose} title={`${cell.personName} · ${cell.date}`}>
      {loading ? (
        <p className="text-sm text-slate-400">Caricamento…</p>
      ) : assignments.length === 0 ? (
        <div>
          <p className="mb-3 text-sm text-slate-400">Nessuna assegnazione attiva in questo giorno.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
            <Button onClick={() => setShowAdd(true)}>+ Aggiungi assegnazione</Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs text-slate-500">
            Modifica la percentuale per questo giorno soltanto — l'assegnazione verrà divisa automaticamente.
          </p>
          {assignments.map((a) => (
            <Field key={a.id} label={a.projectName}>
              <Input
                type="number"
                min={0}
                max={200}
                value={edits[a.id] ?? a.percentage}
                onChange={(e) => setEdits((prev) => ({ ...prev, [a.id]: Number(e.target.value) }))}
              />
              {viewUnit === "hours" && (
                <p className="mt-1 text-xs text-slate-400">
                  ≈ {((edits[a.id] ?? a.percentage) / 100).toFixed(2)} × capacità giornaliera
                </p>
              )}
            </Field>
          ))}
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setShowAdd(true)}>
              + Aggiungi altra
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvataggio…" : "Salva"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
