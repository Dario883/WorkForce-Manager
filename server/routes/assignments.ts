import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { assignments, people, projects } from "../schema";
import { eq, and, gte, lte } from "drizzle-orm";
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

assignmentsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
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
