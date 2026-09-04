export type ProjectStatus = "planned" | "active" | "on_hold" | "completed";
export type PeriodType = "day" | "week" | "month" | "year";
export type DeliveryType = "TK" | "T&M" | "TaaS" | "AMS";
export type AbsenceType = "ferie" | "malattia" | "permesso" | "formazione" | "altro";
export type AbsenceStatus = "in_attesa" | "approvata" | "rifiutata";
export type PersonType = "consulente" | "stage" | "dipendente";

export interface Person {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  type: PersonType;
  avatarColor: string;
  capacityHoursPerWeek: number;
  managerId: number | null;
  managerName?: string | null;
  isApprover: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  commessaId: string;
  name: string;
  client: string | null;
  status: ProjectStatus;
  deliveryType: DeliveryType;
  color: string;
  pmId: number | null;
  pmName?: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Absence {
  id: number;
  personId: number;
  personName?: string;
  type: AbsenceType;
  status: AbsenceStatus;
  startDate: string;
  endDate: string;
  hours: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  createdAt: string;
}

export interface CapacityPeriod {
  id: number;
  personId: number;
  startDate: string;
  endDate: string | null;
  hoursPerWeek: number;
  createdAt: string;
}

export interface Assignment {
  id: number;
  personId: number;
  personName?: string;
  projectId: number;
  projectName?: string;
  projectColor?: string;
  percentage: number;
  startDate: string;
  endDate: string;
  periodType: PeriodType;
}

export interface StaffingDay {
  total: number;
  capacityHoursPerWeek: number;
  items: { projectName: string; projectColor: string; percentage: number }[];
}

export interface StaffingPersonSnapshot {
  personId: number;
  personName: string;
  capacityHoursPerWeek: number;
  avatarColor: string;
  days: Record<string, StaffingDay>;
}

export interface StaffingSnapshot {
  from: string;
  to: string;
  people: StaffingPersonSnapshot[];
}

export const APP_TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "people", label: "Persone" },
  { key: "projects", label: "Progetti" },
  { key: "per-pm", label: "Per PM" },
  { key: "staffing", label: "Staffing" },
  { key: "calendar", label: "Calendario" },
  { key: "absences", label: "Ferie/Assenze" },
  { key: "settings", label: "Impostazioni" },
] as const;

export type AppTabKey = (typeof APP_TABS)[number]["key"];

// Sub-sections of the "settings" tab, grantable independently so an admin can
// decide who sees Soglie/Festività/Utenti/Registro attività without giving
// blanket Impostazioni access. Meaningful only alongside the "settings" key.
export const SETTINGS_SUB_TABS = [
  { key: "settings:thresholds", label: "Soglie" },
  { key: "settings:holidays", label: "Festività" },
  { key: "settings:users", label: "Utenti" },
  { key: "settings:activity", label: "Registro attività" },
] as const;

export type SettingsSubTabKey = (typeof SETTINGS_SUB_TABS)[number]["key"];

export const ALL_PERMISSION_KEYS = [...APP_TABS, ...SETTINGS_SUB_TABS] as const;

export interface AuthUser {
  userId: number;
  email: string;
  name: string;
  permissions: string[] | null;
}

export interface AppUser {
  id: number;
  email: string;
  name: string;
  active: boolean;
  permissions: string[] | null;
  createdAt: string;
}

export interface Settings {
  underutilization_threshold: string;
  overutilization_threshold: string;
  [key: string]: string;
}

export type ActivityAction = "created" | "updated" | "deleted";

export interface ActivityLogEntry {
  id: number;
  userId: number;
  userName: string;
  action: ActivityAction;
  entityType: string;
  entityId: number;
  entityName: string;
  detail: string | null;
  createdAt: string;
}
