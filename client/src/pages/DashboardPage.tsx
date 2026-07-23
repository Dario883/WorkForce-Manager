import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/Card";
import { Badge } from "../components/ui";
import type { Person, Project, Settings, StaffingSnapshot } from "@shared/types";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { it } from "date-fns/locale";

export default function DashboardPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [snapshot, setSnapshot] = useState<StaffingSnapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const from = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const to = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

    Promise.all([
      api.get<Person[]>("/people"),
      api.get<Project[]>("/projects"),
      api.get<StaffingSnapshot>(`/staffing/snapshot?from=${from}&to=${to}`),
      api.get<Settings>("/settings"),
    ])
      .then(([p, pr, snap, s]) => {
        setPeople(p);
        setProjects(pr);
        setSnapshot(snap);
        setSettings(s);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-400">Caricamento…</div>;

  const underThreshold = Number(settings?.underutilization_threshold ?? 70);
  const overThreshold = Number(settings?.overutilization_threshold ?? 100);

  const avgPerPerson =
    snapshot?.people.map((p) => {
      const values = Object.values(p.days).map((d) => d.total);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return { ...p, avg };
    }) ?? [];

  const underAllocated = avgPerPerson.filter((p) => p.avg < underThreshold);
  const overAllocated = avgPerPerson.filter((p) => p.avg > overThreshold);
  const activeProjects = projects.filter((p) => p.status === "active");

  const today = new Date();
  const weekLabel = `${format(startOfWeek(today, { weekStartsOn: 1 }), "d MMM", { locale: it })} – ${format(
    endOfWeek(today, { weekStartsOn: 1 }),
    "d MMM yyyy",
    { locale: it }
  )}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Settimana corrente · {weekLabel}</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Persone" value={people.length} icon="👥" />
        <KpiCard label="Progetti attivi" value={activeProjects.length} icon="📁" />
        <KpiCard
          label="Sotto-allocati"
          value={underAllocated.length}
          icon="⬇️"
          tone={underAllocated.length > 0 ? "warn" : "ok"}
        />
        <KpiCard
          label="Sovra-allocati"
          value={overAllocated.length}
          icon="⬆️"
          tone={overAllocated.length > 0 ? "danger" : "ok"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800">Persone sotto-allocate</h2>
            <p className="text-xs text-slate-500">Allocazione media &lt; {underThreshold}%</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {underAllocated.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">Nessuna persona sotto soglia</p>
            )}
            {underAllocated.map((p) => (
              <div key={p.personId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-700">{p.personName}</span>
                <Badge color="#d97706">{Math.round(p.avg)}%</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800">Persone sovra-allocate</h2>
            <p className="text-xs text-slate-500">Allocazione media &gt; {overThreshold}%</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {overAllocated.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">Nessuna persona sopra soglia</p>
            )}
            {overAllocated.map((p) => (
              <div key={p.personId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-700">{p.personName}</span>
                <Badge color="#dc2626">{Math.round(p.avg)}%</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
}) {
  const toneColor: Record<string, string> = {
    ok: "text-emerald-600",
    warn: "text-amber-600",
    danger: "text-red-600",
    neutral: "text-slate-900",
  };
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-xl">
          {icon}
        </div>
        <div>
          <div className={`text-2xl font-bold ${toneColor[tone]}`}>{value}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      </CardBody>
    </Card>
  );
}
