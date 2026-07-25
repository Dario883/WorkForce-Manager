import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { api } from "../lib/api";
import type { Person, Settings, StaffingSnapshot } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import { Badge, Input, Select, SortableTh } from "../components/ui";
import PersonModal from "../components/PersonModal";
import { compareValues, useSortable } from "../lib/sort";

type SortKey = "name" | "role" | "email" | "capacityHoursPerWeek" | "allocation";

function allocationTone(pct: number, under: number, over: number) {
  if (pct === 0) return "#94a3b8";
  if (pct < under) return "#d97706";
  if (pct <= over) return "#059669";
  return "#dc2626";
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [snapshot, setSnapshot] = useState<StaffingSnapshot | null>(null);
  const [thresholds, setThresholds] = useState({ under: 70, over: 100 });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [approverFilter, setApproverFilter] = useState<"all" | "yes" | "no">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sortKey, sortDir, onSort } = useSortable<SortKey>("name");

  const roles = [...new Set(people.map((p) => p.role).filter((r): r is string => !!r))].sort();

  const filteredPeople = people.filter((p) => {
    if (roleFilter && p.role !== roleFilter) return false;
    if (approverFilter === "yes" && !p.isApprover) return false;
    if (approverFilter === "no" && p.isApprover) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.role ?? "").toLowerCase().includes(q);
  });

  function load() {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    Promise.all([
      api.get<Person[]>("/people"),
      api.get<StaffingSnapshot>(`/staffing/snapshot?from=${today}&to=${today}`),
      api.get<Settings>("/settings"),
    ])
      .then(([p, snap, s]) => {
        setPeople(p);
        setSnapshot(snap);
        setThresholds({
          under: Number(s.underutilization_threshold ?? 70),
          over: Number(s.overutilization_threshold ?? 100),
        });
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function allocationFor(personId: number): number {
    const today = format(new Date(), "yyyy-MM-dd");
    const person = snapshot?.people.find((p) => p.personId === personId);
    return person?.days[today]?.total ?? 0;
  }

  const sortedPeople = [...filteredPeople].sort((a, b) => {
    const value = (p: Person) => {
      switch (sortKey) {
        case "role":
          return p.role ?? "";
        case "email":
          return p.email ?? "";
        case "capacityHoursPerWeek":
          return p.capacityHoursPerWeek;
        case "allocation":
          return allocationFor(p.id);
        default:
          return p.name;
      }
    };
    return compareValues(value(a), value(b), sortDir);
  });

  async function handleDelete(id: number) {
    if (!confirm("Eliminare questa persona? L'azione non è reversibile.")) return;
    await api.delete(`/people/${id}`);
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await api.post<{ imported: number }>("/people/import", { csv: text });
    alert(`Importate ${result.imported} persone.`);
    load();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleExport() {
    window.open("/api/people/export", "_blank");
  }

  function handleTemplate() {
    window.open("/api/people/csv-template", "_blank");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Persone</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{people.length} risorse totali</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleTemplate}>
            Template CSV
          </Button>
          <Button variant="secondary" onClick={handleExport}>
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
          >
            + Nuova persona
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Cerca per nome o ruolo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="sm:w-56">
          <option value="">Tutti i ruoli</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select value={approverFilter} onChange={(e) => setApproverFilter(e.target.value as "all" | "yes" | "no")} className="sm:w-56">
          <option value="all">Tutti</option>
          <option value="yes">Solo responsabili</option>
          <option value="no">Non responsabili</option>
        </Select>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
          ) : people.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna persona registrata</p>
          ) : filteredPeople.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessun risultato per la ricerca</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <SortableTh label="Nome" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Ruolo" sortKey="role" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Email" sortKey="email" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh
                    label="Capacità (h/sett.)"
                    sortKey="capacityHoursPerWeek"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="Allocazione oggi"
                    sortKey="allocation"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={onSort}
                  />
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {sortedPeople.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3">
                      <Link href={`/people/${p.id}`} className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400">
                        <span
                          className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: p.avatarColor }}
                        >
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                        {p.name}
                        {p.isApprover && <Badge color="#7c3aed">Responsabile</Badge>}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{p.role || "—"}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{p.email || "—"}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{p.capacityHoursPerWeek}h</td>
                    <td className="px-5 py-3">
                      <Badge color={allocationTone(allocationFor(p.id), thresholds.under, thresholds.over)}>
                        {allocationFor(p.id)}%
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="mr-3 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                        onClick={() => {
                          setEditing(p);
                          setModalOpen(true);
                        }}
                      >
                        Modifica
                      </button>
                      <button className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400" onClick={() => handleDelete(p.id)}>
                        Elimina
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
        person={editing}
        people={people}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
