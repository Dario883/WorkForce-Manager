import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, assignments, people, projects, settings, users } from "../drizzle/schema";
import type { InsertAssignment, InsertPerson, InsertProject } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── People ────────────────────────────────────────────────────────────────────

export async function getAllPeople() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(people).orderBy(people.name);
}

export async function getPersonById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(people).where(eq(people.id, id)).limit(1);
  return result[0];
}

export async function createPerson(data: Omit<InsertPerson, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(people).values(data);
  return result;
}

export async function updatePerson(id: number, data: Partial<Omit<InsertPerson, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(people).set(data).where(eq(people.id, id));
}

export async function deletePerson(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(people).where(eq(people.id, id));
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getAllProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).orderBy(projects.name);
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function createProject(data: Omit<InsertProject, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(projects).values(data);
}

export async function updateProject(id: number, data: Partial<Omit<InsertProject, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(projects).where(eq(projects.id, id));
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function getAllAssignments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assignments).orderBy(assignments.startDate);
}

export async function getAssignmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
  return result[0];
}

export async function getAssignmentsByPerson(personId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assignments).where(eq(assignments.personId, personId)).orderBy(assignments.startDate);
}

export async function getAssignmentsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assignments).where(eq(assignments.projectId, projectId)).orderBy(assignments.startDate);
}

export async function getAssignmentsInRange(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assignments).where(
    and(
      sql`${assignments.startDate} <= ${endDate}`,
      sql`${assignments.endDate} >= ${startDate}`
    )
  ).orderBy(assignments.startDate);
}

export async function createAssignment(data: Omit<InsertAssignment, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(assignments).values(data);
}

export async function updateAssignment(id: number, data: Partial<Omit<InsertAssignment, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(assignments).set(data).where(eq(assignments.id, id));
}

export async function deleteAssignment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(assignments).where(eq(assignments.id, id));
}

/**
 * Split an assignment by period (daily, weekly, monthly).
 * Creates new assignments for the specified period and adjusts the original assignment.
 */
export async function splitAssignmentByPeriod(
  assignmentId: number,
  newPercent: number,
  periodType: 'daily' | 'weekly' | 'monthly' | 'yearly',
  periodDate: Date
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Get the original assignment
  const original = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!original[0]) throw new Error("Assignment not found");

  const assignment = original[0];
  const origStart = new Date(assignment.startDate);
  const origEnd = new Date(assignment.endDate);
  const origPercent = parseFloat(String(assignment.allocationPercent));

  // Calculate period boundaries
  let periodStart: Date, periodEnd: Date;

  if (periodType === 'daily') {
    periodStart = new Date(periodDate);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd = new Date(periodDate);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (periodType === 'weekly') {
    // Start of week (Monday)
    periodStart = new Date(periodDate);
    const day = periodStart.getDay();
    const diff = periodStart.getDate() - day + (day === 0 ? -6 : 1);
    periodStart.setDate(diff);
    periodStart.setHours(0, 0, 0, 0);
    // End of week (Sunday)
    periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (periodType === 'monthly') {
    // monthly
    periodStart = new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0);
    periodEnd.setHours(23, 59, 59, 999);
  } else {
    // yearly
    periodStart = new Date(periodDate.getFullYear(), 0, 1);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd = new Date(periodDate.getFullYear(), 11, 31);
    periodEnd.setHours(23, 59, 59, 999);
  }

  // Clamp period to original assignment boundaries
  const actualStart = periodStart < origStart ? origStart : periodStart;
  const actualEnd = periodEnd > origEnd ? origEnd : periodEnd;

  // Delete the original assignment
  await db.delete(assignments).where(eq(assignments.id, assignmentId));

  // Create new assignments:
  // 1. Before period (if exists)
  if (origStart < actualStart) {
    await db.insert(assignments).values({
      personId: assignment.personId,
      projectId: assignment.projectId,
      allocationPercent: String(origPercent),
      startDate: origStart,
      endDate: new Date(actualStart.getTime() - 1),
      notes: assignment.notes,
    });
  }

  // 2. During period (with new percent)
  await db.insert(assignments).values({
    personId: assignment.personId,
    projectId: assignment.projectId,
    allocationPercent: String(newPercent),
    startDate: actualStart,
    endDate: actualEnd,
    notes: assignment.notes,
  });

  // 3. After period (if exists)
  if (actualEnd < origEnd) {
    await db.insert(assignments).values({
      personId: assignment.personId,
      projectId: assignment.projectId,
      allocationPercent: String(origPercent),
      startDate: new Date(actualEnd.getTime() + 1),
      endDate: origEnd,
      notes: assignment.notes,
    });
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(settings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(settings);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ── Staffing aggregations ─────────────────────────────────────────────────────

/**
 * Returns for each person their total allocation % in a date range,
 * along with the breakdown per project.
 */
export async function getStaffingSnapshot(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: assignments.id,
      personId: assignments.personId,
      projectId: assignments.projectId,
      allocationPercent: assignments.allocationPercent,
      assignmentStart: assignments.startDate,
      assignmentEnd: assignments.endDate,
    })
    .from(assignments)
    .where(
      and(
        sql`${assignments.startDate} <= ${endDate}`,
        sql`${assignments.endDate} >= ${startDate}`
      )
    );

  return rows;
}
