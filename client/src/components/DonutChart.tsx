import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-slate-700 dark:text-slate-200">{p.name}</div>
      <div className="text-slate-500 dark:text-slate-400">
        {p.value} · {pct}%
      </div>
    </div>
  );
}

export default function DonutChart({
  data,
  onSliceClick,
  valueFormat,
  size = 140,
}: {
  data: DonutDatum[];
  onSliceClick?: (name: string) => void;
  valueFormat?: (value: number) => string;
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessun dato</p>;
  }

  return (
    <div className="flex items-center gap-4">
      <div style={{ width: size, height: size }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="60%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              onClick={onSliceClick ? (entry: any) => onSliceClick(entry.name) : undefined}
              style={onSliceClick ? { cursor: "pointer" } : undefined}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-xs">
        {data.map((d) => (
          <button
            key={d.name}
            type="button"
            onClick={() => onSliceClick?.(d.name)}
            disabled={!onSliceClick}
            className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-200">
              {valueFormat ? valueFormat(d.value) : d.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
