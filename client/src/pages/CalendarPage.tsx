import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { StaffingSnapshot } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Field, Input } from "../components/ui";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";

type ViewMode = "week" | "month";

function allocColor(total: number) {
  if (total === 0) return "bg-slate-50 text-slate-300";
  if (total < 70) return "bg-amber-50 text-amber-700";
  if (total <= 100) return "bg-emerald-50 text-emerald-700";
  return "bg-red-50 text-red-700";
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [snapshot, setSnapshot] = useState<StaffingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [editCell, setEditCell] = useState<{ personId: number; personName: string; date: string } | null>(
    null
  );

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

  const days = eachDayOfInterval({ start: range.start, end: range.end });

  function shiftPeriod(dir: 1 | -1) {
    setAnchor((a) => (view === "week" ? addWeeks(a, dir) : addMonths(a, dir)));
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
                  <th className="sticky left-0 z-10 min-w-[160px] border-b border-r border-slate-100 bg-white px-4 py-3 text-left text-xs uppercase text-slate-500">
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
                </tr>
              </thead>
              <tbody>
                {snapshot.people.map((person) => (
                  <tr key={person.personId} className="border-b border-slate-50">
                    <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-2 font-medium text-slate-700">
                      {person.personName}
                    </td>
                    {days.map((d) => {
                      const key = format(d, "yyyy-MM-dd");
                      const cell = person.days[key];
                      return (
                        <td key={key} className="p-1 text-center">
                          <button
                            onClick={() =>
                              setEditCell({ personId: person.personId, personName: person.personName, date: key })
                            }
                            className={`h-10 w-full rounded-md text-xs font-semibold transition hover:ring-2 hover:ring-brand-300 ${allocColor(
                              cell?.total ?? 0
                            )}`}
                            title={cell?.items.map((i) => `${i.projectName}: ${i.percentage}%`).join("\n")}
                          >
                            {cell && cell.total > 0 ? `${cell.total}%` : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
          onClose={() => setEditCell(null)}
          onSaved={() => {
            setEditCell(null);
            load();
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
  onClose,
  onSaved,
}: {
  cell: { personId: number; personName: string; date: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assignments, setAssignments] = useState<
    { id: number; projectName: string; percentage: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

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

  return (
    <Modal open onClose={onClose} title={`${cell.personName} · ${cell.date}`}>
      {loading ? (
        <p className="text-sm text-slate-400">Caricamento…</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-slate-400">Nessuna assegnazione attiva in questo giorno.</p>
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
            </Field>
          ))}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvataggio…" : "Salva"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
