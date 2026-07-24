import { useState } from "react";

export type SortDir = "asc" | "desc";

export function compareValues(a: string | number, b: string | number, dir: SortDir): number {
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "it", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

export function useSortable<K extends string>(initialKey: K, initialDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<K>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  function onSort(key: K) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return { sortKey, sortDir, onSort };
}
