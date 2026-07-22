import { cn } from "@/lib/utils";

interface AllocationBarProps {
  percent: number;
  threshold?: number;
  showLabel?: boolean;
  className?: string;
  height?: string;
}

export function AllocationBar({
  percent,
  threshold = 80,
  showLabel = false,
  className,
  height = "h-2",
}: AllocationBarProps) {
  const capped = Math.min(percent, 100);
  const overflow = Math.max(0, percent - 100);

  const color =
    percent > 100
      ? "bg-rose-500"
      : percent >= threshold
        ? "bg-emerald-500"
        : "bg-amber-400";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("flex-1 bg-muted rounded-full overflow-hidden", height)}>
        <div
          className={cn("h-full rounded-full transition-all duration-300", color)}
          style={{ width: `${capped}%` }}
        />
      </div>
      {showLabel && (
        <span
          className={cn(
            "text-xs font-medium tabular-nums w-10 text-right",
            percent > 100
              ? "text-rose-600"
              : percent >= threshold
                ? "text-emerald-600"
                : "text-amber-600"
          )}
        >
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}

export function AllocationBadge({ percent }: { percent: number }) {
  const color =
    percent > 100
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : percent >= 80
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : "bg-amber-100 text-amber-700 border-amber-200";

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", color)}>
      {Math.round(percent)}%
    </span>
  );
}
