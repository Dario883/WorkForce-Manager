import { Router } from "express";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "../db";
import { absences, people } from "../schema";
import { eq, asc, ilike } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";
import { logActivity } from "../activityLog";

export const absencesRouter = Router();

const ABSENCE_TYPES = ["ferie", "malattia", "permesso", "formazione", "altro"] as const;
const ABSENCE_STATUSES = ["in_attesa", "approvata", "rifiutata"] as const;

const absenceSchema = z.object({
  personId: z.number().int().positive(),
  type: z.enum(ABSENCE_TYPES).default("ferie"),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().optional().nullable(),
});

const statusSchema = z.object({
  status: z.enum(ABSENCE_STATUSES),
});

const SELECT_COLUMNS = {
  id: absences.id,
  personId: absences.personId,
  personName: people.name,
  type: absences.type,
  status: absences.status,
  startDate: absences.startDate,
  endDate: absences.endDate,
  notes: absences.notes,
  createdAt: absences.createdAt,
  updatedAt: absences.updatedAt,
};

absencesRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(absences)
    .innerJoin(people, eq(absences.personId, people.id))
    .orderBy(asc(absences.startDate));
  res.json(rows);
}));

absencesRouter.get("/csv-template", (_req, res) => {
  const csv = Papa.unparse({
    fields: ["personName", "type", "startDate", "endDate", "notes"],
    data: [["Mario Rossi", "ferie", "2026-08-10", "2026-08-14", ""]],
  });
  res.header("Content-Type", "text/csv");
  res.attachment("absences-template.csv");
  res.send(csv);
});

absencesRouter.get("/export", asyncHandler(async (_req, res) => {
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(absences)
    .innerJoin(people, eq(absences.personId, people.id))
    .orderBy(asc(absences.startDate));
  const csv = Papa.unparse(
    rows.map((a) => ({
      personName: a.personName,
      type: a.type,
      status: a.status,
      startDate: a.startDate,
      endDate: a.endDate,
      notes: a.notes ?? "",
    }))
  );
  res.header("Content-Type", "text/csv");
  res.attachment("absences-export.csv");
  res.send(csv);
}));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(raw?: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (DATE_RE.test(value)) return value;
  const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseType(raw?: string): string {
  const normalized = raw?.trim().toLowerCase();
  return normalized && (ABSENCE_TYPES as readonly string[]).includes(normalized) ? normalized : "ferie";
}

absencesRouter.post("/import", asyncHandler(async (req, res) => {
  const bodySchema = z.object({ csv: z.string() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "CSV mancante" });

  const result = Papa.parse(parsed.data.csv, { header: true, skipEmptyLines: true });
  const rows = result.data as Record<string, string>[];

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const personName = row.personName?.trim();
    const startDate = parseDate(row.startDate);
    const endDate = parseDate(row.endDate);
    if (!personName || !startDate || !endDate || endDate < startDate) {
      skipped++;
      continue;
    }
    const [person] = await db.select().from(people).where(ilike(people.name, personName)).limit(1);
    if (!person) {
      skipped++;
      continue;
    }
    await db.insert(absences).values({
      personId: person.id,
      type: parseType(row.type) as any,
      startDate,
      endDate,
      notes: row.notes?.trim() || null,
    });
    imported++;
  }
  res.json({ imported, skipped });
}));

async function personName(personId: number): Promise<string> {
  const [person] = await db.select({ name: people.name }).from(people).where(eq(people.id, personId)).limit(1);
  return person?.name ?? "?";
}

absencesRouter.put("/:id/status", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(absences)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(absences.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Assenza non trovata" });
  await logActivity(
    req.user!,
    "updated",
    "assenza",
    updated.id,
    `${await personName(updated.personId)} (${parsed.data.status})`
  );
  res.json(updated);
}));

absencesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = absenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.endDate < parsed.data.startDate) {
    return res.status(400).json({ error: "La data di fine non può precedere la data di inizio" });
  }
  const [created] = await db.insert(absences).values(parsed.data).returning();
  await logActivity(req.user!, "created", "assenza", created.id, await personName(created.personId));
  res.status(201).json(created);
}));

absencesRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = absenceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(absences)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(absences.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Assenza non trovata" });
  await logActivity(req.user!, "updated", "assenza", updated.id, await personName(updated.personId));
  res.json(updated);
}));

absencesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(absences).where(eq(absences.id, id)).limit(1);
  await db.delete(absences).where(eq(absences.id, id));
  if (existing) await logActivity(req.user!, "deleted", "assenza", id, await personName(existing.personId));
  res.status(204).end();
}));
