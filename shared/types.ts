export type ProjectStatus = "planned" | "active" | "on_hold" | "completed";
export type PeriodType = "day" | "week" | "month" | "year";

export interface Person {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  avatarColor: string;
  capacityHoursPerWeek: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  commessaId: string;
  name: string;
  client: string | null;
  status: ProjectStatus;
  color: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
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
