// Shared types used by both frontend and backend

export type Person = {
  id: number;
  name: string;
  role: string;
  email: string | null;
  weeklyCapacityHours: string;
  avatarColor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Project = {
  id: number;
  name: string;
  description: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  color: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Assignment = {
  id: number;
  personId: number;
  projectId: number;
  allocationPercent: string;
  startDate: Date;
  endDate: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectStatus = Project["status"];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Pianificazione",
  active: "Attivo",
  on_hold: "In pausa",
  completed: "Completato",
  cancelled: "Annullato",
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "bg-blue-100 text-blue-700 border-blue-200",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  on_hold: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

export const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];
