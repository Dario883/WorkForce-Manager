export type ProjectStatus = "planned" | "active" | "on_hold" | "completed";
export type PeriodType = "day" | "week" | "month" | "year";
export type DeliveryType = "TK" | "T&M" | "TaaS" | "AMS";
export type AbsenceType = "ferie" | "malattia" | "permesso" | "formazione" | "altro";
export type AbsenceStatus = "in_attesa" | "approvata" | "rifiutata";

export interface Person {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
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

export interface AuthUser {
  userId: number;
  email: string;
  name: string;
}

export interface AppUser {
  id: number;
  email: string;
  name: string;
  active: boolean;
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
