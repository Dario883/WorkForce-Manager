import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import type { Person } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import { Badge } from "../components/ui";

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
  const [history, setHistory] = useState<PersonAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Person>(`/people/${id}`),
      api.get<PersonAssignment[]>(`/people/${id}/assignments`),
    ])
      .then(([p, a]) => {
        setPerson(p);
        setHistory(a.sort((x, y) => (x.startDate < y.startDate ? 1 : -1)));
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-slate-400">Caricamento…</div>;
  if (!person) return <div className="text-slate-400">Persona non trovata</div>;

  return (
    <div>
      <Link href="/people" className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-600">
        ← Torna a Persone
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <span
          className="grid h-14 w-14 place-items-center rounded-full text-lg font-semibold text-white"
          style={{ backgroundColor: person.avatarColor }}
        >
          {person.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{person.name}</h1>
          <p className="text-sm text-slate-500">
            {person.role || "Ruolo non specificato"} · {person.capacityHoursPerWeek}h/settimana
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800">Storico assegnazioni</h2>
        </CardHeader>
        <CardBody>
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Nessuna assegnazione registrata</p>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {history.map((a) => (
                <li key={a.id} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: a.projectColor }}
                  />
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                    <div>
                      <Badge color={a.projectColor}>{a.projectName}</Badge>
                      <p className="mt-1 text-xs text-slate-500">
                        {a.startDate} → {a.endDate}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{a.percentage}%</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
