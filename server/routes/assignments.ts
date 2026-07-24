import { Router } from "express";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "../db";
import { assignments, people, projects } from "../schema";
import { eq, and, gte, lte, asc, ilike } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

export const assignmentsRouter = Router();

const assignmentSchema = z.object({
  personId: z.number().int(),
  projectId: z.number().int(),
  percentage: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  periodType: z.enum(["day", "week", "month", "year"]).default("week"),
});

assignmentsRouter.get("/", asyncHandler(async (req, res) => {
  const { personId, projectId } = req.query;
  const conditions = [];
  if (personId) conditions.push(eq(assignments.personId, Number(personId)));
  if (projectId) conditions.push(eq(assignments.projectId, Number(projectId)));

  const rows = await db
    .select({
      id: assignments.id,
      personId: assignments.personId,
      personName: people.name,
      projectId: assignments.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      percentage: assignments.percentage,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      periodType: assignments.periodType,
    })
    .from(assignments)
    .innerJoin(people, eq(assignments.personId, people.id))
    .innerJoin(projects, eq(assignments.projectId, projects.id))
    .where(conditions.length ? and(...conditions) : undefined);

  res.json(rows);
}));

assignmentsRouter.get("/csv-template", (_req, res) => {
  const csv = Papa.unparse({
    fields: ["personName", "projectName", "percentage", "startDate", "endDate", "periodType"],
    data: [["Mario Rossi", "Migrazione ERP", "50", "2026-01-01", "2026-06-30", "week"]],
  });
  res.header("Content-Type", "text/csv");
  res.attachment("assignments-template.csv");
  res.send(csv);
});

assignmentsRouter.get("/export", asyncHandler(async (_req, res) => {
  const rows = await db
    .select({
      personName: people.name,
      projectName: projects.name,
      percentage: assignments.percentage,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      periodType: assignments.periodType,
    })
    .from(assignments)
    .innerJoin(people, eq(assignments.personId, people.id))
    .innerJoin(projects, eq(assignments.projectId, projects.id))
    .orderBy(asc(people.name));

  const csv = Papa.unparse(rows);
  res.header("Content-Type", "text/csv");
  res.attachment("assignments-export.csv");
  res.send(csv);
}));

const ASSIGNMENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PERIOD_TYPES = ["day", "week", "month", "year"];

function parseAssignmentDate(raw?: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (ASSIGNMENT_DATE_RE.test(value)) return value;
  const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

assignmentsRouter.post("/import", asyncHandler(async (req, res) => {
  const bodySchema = z.object({ csv: z.string() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "CSV mancante" });

  const result = Papa.parse(parsed.data.csv, { header: true, skipEmptyLines: true });
  const rows = result.data as Record<string, string>[];

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const personName = row.personName?.trim();
    const projectName = row.projectName?.trim();
    const startDate = parseAssignmentDate(row.startDate);
    const endDate = parseAssignmentDate(row.endDate);
    const percentage = Number(row.percentage);
    const periodTypeRaw = row.periodType?.trim().toLowerCase();
    const periodType = (VALID_PERIOD_TYPES.includes(periodTypeRaw ?? "") ? periodTypeRaw : "week") as
      | "day"
      | "week"
      | "month"
      | "year";

    if (!personName || !projectName || !startDate || !endDate || Number.isNaN(percentage)) {
      skipped++;
      continue;
    }

    const [person] = await db.select().from(people).where(ilike(people.name, personName)).limit(1);
    const [project] = await db.select().from(projects).where(ilike(projects.name, projectName)).limit(1);
    if (!person || !project) {
      skipped++;
      continue;
    }

    try {
      await db.insert(assignments).values({
        personId: person.id,
        projectId: project.id,
        percentage,
        startDate,
        endDate,
        periodType,
      });
      imported++;
    } catch (err) {
      console.error("Errore import assegnazione:", row, err);
      skipped++;
    }
  }
  res.json({ imported, skipped });
}));

assignmentsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(assignments).values(parsed.data).returning();
  res.status(201).json(created);
}));

/**
 * Like POST "/", but instead of adding a parallel row, first clears out any
 * existing assignment(s) of the same person+project that overlap the new
 * date range — truncating the non-overlapping tail/head of each, splitting
 * one in two if the new range falls entirely inside it, or dropping it
 * outright if the new range fully covers it — before inserting the new row.
 * Used by the "Nuova assegnazione" flow's "sovrascrivi" option.
 */
assignmentsRouter.post("/overwrite", asyncHandler(async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { personId, projectId, startDate, endDate } = parsed.data;

  const existing = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.personId, personId), eq(assignments.projectId, projectId)));

  for (const a of existing) {
    const overlaps = a.startDate <= endDate && a.endDate >= startDate;
    if (!overlaps) continue;

    const startsBefore = a.startDate < startDate;
    const endsAfter = a.endDate > endDate;

    if (startsBefore && endsAfter) {
      await db.insert(assignments).values({
        personId: a.personId,
        projectId: a.projectId,
        percentage: a.percentage,
        startDate: a.startDate,
        endDate: fmt(addDays(new Date(startDate), -1)),
        periodType: a.periodType,
      });
      await db
        .update(assignments)
        .set({ startDate: fmt(addDays(new Date(endDate), 1)), updatedAt: new Date() })
        .where(eq(assignments.id, a.id));
    } else if (startsBefore) {
      await db
        .update(assignments)
        .set({ endDate: fmt(addDays(new Date(startDate), -1)), updatedAt: new Date() })
        .where(eq(assignments.id, a.id));
    } else if (endsAfter) {
      await db
        .update(assignments)
        .set({ startDate: fmt(addDays(new Date(endDate), 1)), updatedAt: new Date() })
        .where(eq(assignments.id, a.id));
    } else {
      await db.delete(assignments).where(eq(assignments.id, a.id));
    }
  }

  const [created] = await db.insert(assignments).values(parsed.data).returning();
  res.status(201).json(created);
}));

assignmentsRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = assignmentSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(assignments)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(assignments.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Assegnazione non trovata" });
  res.json(updated);
}));

assignmentsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(assignments).where(eq(assignments.id, id));
  res.status(204).end();
}));

/**
 * Edits the allocation for a single unit (day/week/month/year) that falls
 * inside an existing assignment's range, splitting the original assignment
 * into up to three parts: [before] unchanged, [unit] with the new
 * percentage, [after] unchanged. Used by the calendar inline-edit UI.
 */
const splitSchema = z.object({
  date: z.string(), // any date inside the unit to edit, e.g. the clicked cell
  unit: z.enum(["day", "week", "month", "year"]),
  percentage: z.number(),
});

function unitRange(dateStr: string, unit: "day" | "week" | "month" | "year") {
  const d = new Date(dateStr);
  switch (unit) {
    case "day":
      return { start: d, end: d };
    case "week":
      return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
    case "month":
      return { start: startOfMonth(d), end: endOfMonth(d) };
    case "year":
      return { start: startOfYear(d), end: endOfYear(d) };
  }
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

assignmentsRouter.post("/:id/split", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = splitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [original] = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
  if (!original) return res.status(404).json({ error: "Assegnazione non trovata" });

  const { start: unitStart, end: unitEnd } = unitRange(parsed.data.date, parsed.data.unit);
  const origStart = new Date(original.startDate);
  const origEnd = new Date(original.endDate);

  const effectiveStart = unitStart < origStart ? origStart : unitStart;
  const effectiveEnd = unitEnd > origEnd ? origEnd : unitEnd;

  const newRows = [];

  // Part before the edited unit
  if (origStart < effectiveStart) {
    newRows.push({
      personId: original.personId,
      projectId: original.projectId,
      percentage: original.percentage,
      startDate: fmt(origStart),
      endDate: fmt(addDays(effectiveStart, -1)),
      periodType: original.periodType,
    });
  }

  // The edited unit itself, with the new percentage
  newRows.push({
    personId: original.personId,
    projectId: original.projectId,
    percentage: parsed.data.percentage,
    startDate: fmt(effectiveStart),
    endDate: fmt(effectiveEnd),
    periodType: parsed.data.unit,
  });

  // Part after the edited unit
  if (effectiveEnd < origEnd) {
    newRows.push({
      personId: original.personId,
      projectId: original.projectId,
      percentage: original.percentage,
      startDate: fmt(addDays(effectiveEnd, 1)),
      endDate: fmt(origEnd),
      periodType: original.periodType,
    });
  }

  await db.delete(assignments).where(eq(assignments.id, id));
  const created = await db.insert(assignments).values(newRows).returning();
  res.json(created);
}));
