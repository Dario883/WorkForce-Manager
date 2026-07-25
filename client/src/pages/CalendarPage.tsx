import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Absence, AbsenceType, Assignment, Holiday, Project, StaffingPersonSnapshot, StaffingSnapshot } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Field, Input, Select } from "../components/ui";
import AssignmentModal from "../components/AssignmentModal";
import AbsenceModal, { ABSENCE_COLOR, ABSENCE_LABEL, ABSENCE_STATUS_LABEL, ABSENCE_TYPES } from "../components/AbsenceModal";
import {
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWeekend,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { it } from "date-fns/locale";

type ViewMode = "week" | "month" | "year";
type ViewUnit = "percentage" | "hours";
type EditUnit = "day" | "week" | "month";
type DataMode = "staffing" | "absences";

const ABSENCE_SHORT: Record<AbsenceType, string> = {
  ferie: "FER",
  malattia: "MAL",
  permesso: "PER",
  formazione: "FOR",
  altro: "ALT",
};

// A column is a single day (week view), a whole week (month view), or a
// whole month (year view). Editing/creating an assignment always targets
// [rangeStart, rangeEnd] with `unit` as the periodType/split unit, so
// month/year-view edits apply to the entire underlying week/month instead of
// a single day.
type Column = {
  key: string;
  label1: string;
  label2: string;
  rangeStart: string;
  rangeEnd: string;
  weekend: boolean;
  unit: EditUnit;
};

function allocColor(total: number) {
  if (total === 0) return "bg-slate-50 text-slate-300 dark:bg-slate-700/40 dark:text-slate-500";
  if (total < 70) return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
  if (total <= 100) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
  return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400";
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

function buildColumns(view: ViewMode, rangeStart: Date, rangeEnd: Date): Column[] {
  if (view === "week") {
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return {
        key,
        label1: format(d, "EEE", { locale: it }),
        label2: format(d, "d/M"),
        rangeStart: key,
        rangeEnd: key,
        weekend: isWeekend(d),
        unit: "day" as const,
      };
    });
  }
  if (view === "year") {
    return eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).map((monthStart) => {
      const monthEnd = endOfMonth(monthStart);
      return {
        key: format(monthStart, "yyyy-MM-dd"),
        label1: format(monthStart, "MMM", { locale: it }),
        label2: format(monthStart, "yyyy"),
        rangeStart: format(monthStart, "yyyy-MM-dd"),
        rangeEnd: format(monthEnd, "yyyy-MM-dd"),
        weekend: false,
        unit: "month" as const,
      };
    });
  }
  return eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 }).map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return {
      key: format(weekStart, "yyyy-MM-dd"),
      label1: `Sett. ${format(weekStart, "d/M")}`,
      label2: `→ ${format(weekEnd, "d/M")}`,
      rangeStart: format(weekStart, "yyyy-MM-dd"),
      rangeEnd: format(weekEnd, "yyyy-MM-dd"),
      weekend: false,
      unit: "week" as const,
    };
  });
}

// A representative day is only needed to look up the (per-day) staffing
// snapshot for a week-column in month view — the underlying data is still
// per-day, so we show the first day in the week that actually has an
// allocation (falling back to the week's Monday if none do).
function snapshotDayForColumn(person: StaffingPersonSnapshot, col: Column) {
  if (col.unit === "day") return person.days[col.key];
  const daysInRange = eachDayOfInterval({ start: new Date(col.rangeStart), end: new Date(col.rangeEnd) });
  for (const d of daysInRange) {
    const k = format(d, "yyyy-MM-dd");
    if (person.days[k] && person.days[k].total > 0) return person.days[k];
  }
  return person.days[col.rangeStart];
}

function holidayForColumn(col: Column, holidays: Holiday[]): Holiday | null {
  return holidays.find((h) => h.date >= col.rangeStart && h.date <= col.rangeEnd) ?? null;
}

// Same "any day in range" logic as snapshotDayForColumn: month/year columns
// span multiple days, so we surface the first non-rejected absence touching
// the column rather than requiring every day in the range to be covered.
function absenceForColumn(personId: number, col: Column, absences: Absence[]): Absence | null {
  return (
    absences.find(
      (a) =>
        a.personId === personId &&
        a.status !== "rifiutata" &&
        a.startDate <= col.rangeEnd &&
        a.endDate >= col.rangeStart
    ) ?? null
  );
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
// whenever their date ranges don't overlap (e.g. after splitting a period for
// a percentage change) — editing a free cell then never needs to add a row.
// If two assignments of the same project DO overlap (e.g. a genuine second
// allocation was added on top), they must stay visible and editable as
// separate rows — silently summing them would hide real data from the user.
// This is a standard interval-partitioning: assignments are packed into the
// fewest non-overlapping "lines" per project. Note the set of lines needed
// reflects ALL assignments overlapping the visible range, so a wider range
// (month) can legitimately need more lines than a narrower one (week) if the
// project has genuinely overlapping segments spread across different weeks.
function buildProjectRows(rows: Assignment[], columns: Column[]): ProjectRow[] {
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
        for (const col of columns) {
          if (col.rangeEnd < a.startDate || col.rangeStart > a.endDate) continue;
          byDay[col.key] = { assignmentId: a.id, percentage: a.percentage };
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

type EditCellTarget = {
  personId: number;
  personName: string;
  rangeStart: string;
  rangeEnd: string;
  unit: EditUnit;
};

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [viewUnit, setViewUnit] = useState<ViewUnit>("percentage");
  const [dataMode, setDataMode] = useState<DataMode>("staffing");
  const [anchor, setAnchor] = useState(new Date());
  const [snapshot, setSnapshot] = useState<StaffingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [editCell, setEditCell] = useState<EditCellTarget | null>(null);
  const [editAbsenceCell, setEditAbsenceCell] = useState<EditCellTarget | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [personAssignments, setPersonAssignments] = useState<Record<number, Assignment[]>>({});
  const [loadingRows, setLoadingRows] = useState<Record<number, boolean>>({});
  const [addFor, setAddFor] = useState<{ id: number; name: string } | null>(null);

  const range =
    view === "week"
      ? { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) }
      : view === "year"
      ? { start: startOfYear(anchor), end: endOfYear(anchor) }
      : { start: startOfMonth(anchor), end: endOfMonth(anchor) };

  function load() {
    setLoading(true);
    const from = format(range.start, "yyyy-MM-dd");
    const to = format(range.end, "yyyy-MM-dd");
    Promise.all([
      api.get<StaffingSnapshot>(`/staffing/snapshot?from=${from}&to=${to}`),
      api.get<Absence[]>("/absences"),
    ])
      .then(([snap, allAbsences]) => {
        setSnapshot(snap);
        setAbsences(allAbsences.filter((a) => a.endDate >= from && a.startDate <= to));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [view, anchor.toDateString()]);
  useEffect(() => {
    api.get<Project[]>("/projects").then(setProjects);
    api.get<Holiday[]>("/holidays").then(setHolidays);
  }, []);

  const columns = buildColumns(view, range.start, range.end);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  function shiftPeriod(dir: 1 | -1) {
    setAnchor((a) => (view === "week" ? addWeeks(a, dir) : view === "year" ? addYears(a, dir) : addMonths(a, dir)));
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
    col: Column,
    percentage: number
  ) {
    if (existingAssignmentId) {
      await api.post(`/assignments/${existingAssignmentId}/split`, {
        date: col.rangeStart,
        unit: col.unit,
        percentage,
      });
    } else {
      await api.post("/assignments", {
        personId,
        projectId,
        percentage,
        startDate: col.rangeStart,
        endDate: col.rangeEnd,
        periodType: col.unit,
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Calendario</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {format(range.start, "d MMM", { locale: it })} – {format(range.end, "d MMM yyyy", { locale: it })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5">
            {(["staffing", "absences"] as DataMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setDataMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  dataMode === m ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {m === "staffing" ? "Staffing" : "Ferie/Assenze"}
              </button>
            ))}
          </div>
          {dataMode === "staffing" && (
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5">
              {(["percentage", "hours"] as ViewUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setViewUnit(u)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    viewUnit === u ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {u === "percentage" ? "%" : "Ore"}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
            {(["week", "month", "year"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  view === m ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {m === "week" ? "Settimana" : m === "month" ? "Mese" : "Anno"}
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
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
          ) : snapshot.people.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna persona registrata</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[200px] border-b border-r border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                    Persona
                  </th>
                  {columns.map((col) => {
                    const isToday = col.rangeStart <= todayStr && todayStr <= col.rangeEnd;
                    const holiday = holidayForColumn(col, holidays);
                    return (
                      <th
                        key={col.key}
                        title={holiday?.name}
                        className={`${
                          view === "month" ? "min-w-[90px]" : view === "year" ? "min-w-[60px]" : "min-w-[70px]"
                        } border-b px-2 py-3 text-center text-xs font-medium ${
                          holiday
                            ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-500/10 dark:text-violet-400"
                            : isToday
                            ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400"
                            : "border-slate-100 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        <div className={isToday || holiday ? "font-semibold" : ""}>{col.label1}</div>
                        <div
                          className={
                            holiday
                              ? "text-violet-500 dark:text-violet-400"
                              : isToday
                              ? "text-brand-500 dark:text-brand-400"
                              : "text-slate-400 dark:text-slate-500"
                          }
                        >
                          {col.label2}
                        </div>
                      </th>
                    );
                  })}
                  <th className="min-w-[40px] border-b border-slate-100 dark:border-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {dataMode === "staffing" && snapshot.people.map((person) => {
                  const isExpanded = !!expanded[person.personId];
                  const rows = personAssignments[person.personId] ?? [];
                  const visibleRows = rows.filter(
                    (a) => a.endDate >= format(range.start, "yyyy-MM-dd") && a.startDate <= format(range.end, "yyyy-MM-dd")
                  );
                  const projectRows = buildProjectRows(visibleRows, columns);
                  return (
                    <Fragment key={person.personId}>
                      <tr className="border-b border-slate-50 dark:border-slate-700">
                        <td className="sticky left-0 z-10 border-r border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 font-medium text-slate-700 dark:text-slate-200">
                          <button
                            className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                            onClick={() => toggleExpand(person.personId)}
                            title={isExpanded ? "Comprimi" : "Espandi assegnazioni"}
                          >
                            {isExpanded ? "−" : "+"}
                          </button>
                          {person.personName}
                        </td>
                        {columns.map((col) => {
                          const cell = snapshotDayForColumn(person, col);
                          const total = cell?.total ?? 0;
                          const isToday = col.rangeStart <= todayStr && todayStr <= col.rangeEnd;
                          const label =
                            viewUnit === "percentage"
                              ? total > 0
                                ? `${total}%`
                                : "—"
                              : pctToHoursLabel(total, person.capacityHoursPerWeek, col.weekend);
                          return (
                            <td key={col.key} className={`p-1 text-center ${isToday ? "bg-brand-50/40 dark:bg-brand-500/10" : ""}`}>
                              <button
                                onClick={() =>
                                  setEditCell({
                                    personId: person.personId,
                                    personName: person.personName,
                                    rangeStart: col.rangeStart,
                                    rangeEnd: col.rangeEnd,
                                    unit: col.unit,
                                  })
                                }
                                className={`h-10 w-full rounded-md text-xs font-semibold transition hover:ring-2 hover:ring-brand-300 ${allocColor(
                                  total
                                )} ${isToday ? "ring-1 ring-brand-400" : ""}`}
                                title={cell?.items.map((i) => `${i.projectName}: ${i.percentage}%`).join("\n")}
                              >
                                {label}
                              </button>
                            </td>
                          );
                        })}
                        <td className="border-b border-slate-50 bg-white dark:border-slate-700 dark:bg-slate-800"></td>
                      </tr>

                      {isExpanded && loadingRows[person.personId] && (
                        <tr key={`${person.personId}-loading`}>
                          <td colSpan={columns.length + 2} className="bg-slate-50/40 px-4 py-2 text-xs text-slate-400 dark:bg-slate-700/30 dark:text-slate-500">
                            Caricamento assegnazioni…
                          </td>
                        </tr>
                      )}

                      {isExpanded &&
                        !loadingRows[person.personId] &&
                        projectRows.map((g) => {
                          return (
                            <Fragment key={g.key}>
                              <tr className="border-b border-slate-50 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-700/30">
                                <td className="sticky left-0 z-10 border-r border-slate-100 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-700/30 px-4 py-1.5 pl-9 text-xs text-slate-600 dark:text-slate-300">
                                  <span
                                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                                    style={{ backgroundColor: g.projectColor }}
                                  />
                                  <select
                                    value={g.projectId}
                                    title="Cambia progetto (percentuali e date restano invariate)"
                                    className="rounded border-none bg-transparent py-0.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
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
                                {columns.map((col) => {
                                  const cell = g.byDay[col.key];
                                  const isToday = col.rangeStart <= todayStr && todayStr <= col.rangeEnd;

                                  if (viewUnit === "hours" && col.weekend) {
                                    return (
                                      <td
                                        key={col.key}
                                        className={`p-1 text-center text-xs text-slate-300 dark:text-slate-600 ${isToday ? "bg-brand-50/40 dark:bg-brand-500/10" : ""}`}
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
                                    <td key={col.key} className={`p-1 ${isToday ? "bg-brand-50/40 dark:bg-brand-500/10" : ""}`}>
                                      <input
                                        type="number"
                                        defaultValue={displayValue}
                                        placeholder="—"
                                        key={`${g.key}-${col.key}-${displayValue}-${viewUnit}`}
                                        className={`h-8 w-full rounded border bg-white dark:bg-slate-900 text-center text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-brand-400 focus:outline-none ${
                                          isToday ? "border-brand-300 dark:border-brand-500" : "border-slate-200 dark:border-slate-600"
                                        }`}
                                        onBlur={(e) => {
                                          const raw = e.target.value.trim();
                                          if (raw === "") return;
                                          const rawNum = Number(raw);
                                          if (Number.isNaN(rawNum)) return;
                                          const newPct =
                                            viewUnit === "percentage" ? rawNum : hoursToPct(rawNum, person.capacityHoursPerWeek);
                                          if (pct !== null && newPct === pct) return;
                                          handleCellCommit(person.personId, g.projectId, cell?.assignmentId ?? null, col, newPct);
                                        }}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="p-1 text-center">
                                  <button
                                    className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                                    title="Rimuovi assegnazione"
                                    onClick={() => handleDeleteGroup(g.assignmentIds, person.personId)}
                                  >
                                    <TrashIcon />
                                  </button>
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })}

                      {isExpanded && !loadingRows[person.personId] && (
                        <tr key={`${person.personId}-add`} className="border-b border-slate-100 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-700/30">
                          <td colSpan={columns.length + 2} className="p-0">
                            <div className="sticky left-0 w-fit px-4 py-1.5 pl-9">
                              <button
                                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                                onClick={() => setAddFor({ id: person.personId, name: person.personName })}
                              >
                                + Nuova assegnazione
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {dataMode === "absences" &&
                  snapshot.people.map((person) => (
                    <tr key={person.personId} className="border-b border-slate-50 dark:border-slate-700">
                      <td className="sticky left-0 z-10 border-r border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 font-medium text-slate-700 dark:text-slate-200">
                        {person.personName}
                      </td>
                      {columns.map((col) => {
                        const match = absenceForColumn(person.personId, col, absences);
                        const isToday = col.rangeStart <= todayStr && todayStr <= col.rangeEnd;
                        const target: EditCellTarget = {
                          personId: person.personId,
                          personName: person.personName,
                          rangeStart: col.rangeStart,
                          rangeEnd: col.rangeEnd,
                          unit: col.unit,
                        };
                        return (
                          <td key={col.key} className={`p-1 text-center ${isToday ? "bg-brand-50/40 dark:bg-brand-500/10" : ""}`}>
                            <button
                              onClick={() => setEditAbsenceCell(target)}
                              className={`h-10 w-full rounded-md text-xs font-semibold transition hover:ring-2 hover:ring-brand-300 ${
                                match
                                  ? match.status === "in_attesa"
                                    ? "border border-dashed"
                                    : ""
                                  : "bg-slate-50 text-slate-300 dark:bg-slate-700/40 dark:text-slate-500"
                              } ${isToday ? "ring-1 ring-brand-400" : ""}`}
                              style={
                                match
                                  ? { backgroundColor: `${ABSENCE_COLOR[match.type]}1a`, color: ABSENCE_COLOR[match.type] }
                                  : undefined
                              }
                              title={match ? `${ABSENCE_LABEL[match.type]} · ${ABSENCE_STATUS_LABEL[match.status]}` : undefined}
                            >
                              {match ? (
                                <>
                                  {match.status === "in_attesa" && <span className="mr-0.5">⏳</span>}
                                  {ABSENCE_SHORT[match.type]}
                                </>
                              ) : (
                                "—"
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-50 bg-white dark:border-slate-700 dark:bg-slate-800"></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        {dataMode === "staffing" ? (
          <>
            <LegendDot className="bg-slate-50 dark:bg-slate-700/40" label="0%" />
            <LegendDot className="bg-amber-50 dark:bg-amber-950" label="< 70% (sotto-allocato)" />
            <LegendDot className="bg-emerald-50 dark:bg-emerald-950" label="70–100%" />
            <LegendDot className="bg-red-50 dark:bg-red-950" label="> 100% (sovra-allocato)" />
          </>
        ) : (
          ABSENCE_TYPES.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-slate-200 dark:border-slate-600" style={{ backgroundColor: `${ABSENCE_COLOR[t]}1a` }} />
              {ABSENCE_LABEL[t]}
            </span>
          ))
        )}
        {holidays.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-violet-300 bg-violet-50 dark:border-violet-500 dark:bg-violet-500/10" />
            Festività
          </span>
        )}
        {dataMode === "absences" && (
          <span className="flex items-center gap-1.5">⏳ In attesa di approvazione</span>
        )}
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

      {editAbsenceCell && (
        <EditAbsenceCellModal
          cell={editAbsenceCell}
          onClose={() => setEditAbsenceCell(null)}
          onSaved={() => {
            setEditAbsenceCell(null);
            load();
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
      <span className={`h-3 w-3 rounded ${className} border border-slate-200 dark:border-slate-600`} />
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
  cell: EditCellTarget;
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
        const active = all.filter((a) => a.startDate <= cell.rangeEnd && a.endDate >= cell.rangeStart);
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
            date: cell.rangeStart,
            unit: cell.unit,
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
        defaultStartDate={cell.rangeStart}
        defaultEndDate={cell.rangeEnd}
        onSaved={onSaved}
      />
    );
  }

  const periodLabel = cell.rangeStart === cell.rangeEnd ? cell.rangeStart : `${cell.rangeStart} → ${cell.rangeEnd}`;

  return (
    <Modal open onClose={onClose} title={`${cell.personName} · ${periodLabel}`}>
      {loading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
      ) : assignments.length === 0 ? (
        <div>
          <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">
            {cell.unit === "month"
              ? "Nessuna assegnazione attiva in questo mese."
              : cell.unit === "week"
              ? "Nessuna assegnazione attiva in questa settimana."
              : "Nessuna assegnazione attiva in questo giorno."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
            <Button onClick={() => setShowAdd(true)}>+ Aggiungi assegnazione</Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {cell.unit === "month"
              ? "Modifica la percentuale per questo mese soltanto — l'assegnazione verrà divisa automaticamente."
              : cell.unit === "week"
              ? "Modifica la percentuale per questa settimana soltanto — l'assegnazione verrà divisa automaticamente."
              : "Modifica la percentuale per questo giorno soltanto — l'assegnazione verrà divisa automaticamente."}
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
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
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

function EditAbsenceCellModal({
  cell,
  onClose,
  onSaved,
}: {
  cell: EditCellTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api
      .get<Absence[]>("/absences")
      .then((all) => {
        const active = all.filter(
          (a) => a.personId === cell.personId && a.startDate <= cell.rangeEnd && a.endDate >= cell.rangeStart
        );
        setItems(active);
      })
      .finally(() => setLoading(false));
  }, [cell]);

  async function handleTypeChange(id: number, type: string) {
    setSaving(id);
    try {
      await api.put(`/absences/${id}`, { type });
      onSaved();
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Rimuovere questa assenza?")) return;
    await api.delete(`/absences/${id}`);
    onSaved();
  }

  if (showAdd) {
    return (
      <AbsenceModal
        open
        onClose={onClose}
        absence={null}
        lockedPerson={{ id: cell.personId, name: cell.personName }}
        defaultStartDate={cell.rangeStart}
        defaultEndDate={cell.rangeEnd}
        onSaved={onSaved}
      />
    );
  }

  const periodLabel = cell.rangeStart === cell.rangeEnd ? cell.rangeStart : `${cell.rangeStart} → ${cell.rangeEnd}`;

  return (
    <Modal open onClose={onClose} title={`${cell.personName} · ${periodLabel}`}>
      {loading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
      ) : items.length === 0 ? (
        <div>
          <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">Nessuna assenza in questo periodo.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
            <Button onClick={() => setShowAdd(true)}>+ Aggiungi assenza</Button>
          </div>
        </div>
      ) : (
        <div>
          {items.map((a) => (
            <div key={a.id} className="mb-3 rounded-lg border border-slate-200 dark:border-slate-600 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {a.startDate} → {a.endDate}
                </span>
                <span>{ABSENCE_STATUS_LABEL[a.status]}</span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={a.type}
                  disabled={saving === a.id}
                  onChange={(e) => handleTypeChange(a.id, e.target.value)}
                >
                  {ABSENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ABSENCE_LABEL[t]}
                    </option>
                  ))}
                </Select>
                <button
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                  title="Rimuovi assenza"
                  onClick={() => handleDelete(a.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setShowAdd(true)}>
              + Aggiungi altra
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
