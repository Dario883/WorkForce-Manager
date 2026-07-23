import { Router } from "express";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "../db";
import { projects } from "../schema";
import { eq, asc } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";

export const projectsRouter = Router();

const projectSchema = z.object({
  name: z.string().min(1),
  client: z.string().optional().nullable(),
  status: z.enum(["planned", "active", "on_hold", "completed"]).default("planned"),
  color: z.string().default("#3457d5"),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

projectsRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(projects).orderBy(asc(projects.name));
  res.json(rows);
}));

projectsRouter.get("/csv-template", (_req, res) => {
  const csv = Papa.unparse({
    fields: ["name", "client", "status", "startDate", "endDate", "color"],
    data: [["Migrazione ERP", "Acme Spa", "active", "2026-01-01", "2026-06-30", "#3457d5"]],
  });
  res.header("Content-Type", "text/csv");
  res.attachment("projects-template.csv");
  res.send(csv);
});

projectsRouter.get("/export", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(projects).orderBy(asc(projects.name));
  const csv = Papa.unparse(
    rows.map((p) => ({
      name: p.name,
      client: p.client ?? "",
      status: p.status,
      startDate: p.startDate ?? "",
      endDate: p.endDate ?? "",
      color: p.color,
    }))
  );
  res.header("Content-Type", "text/csv");
  res.attachment("projects-export.csv");
  res.send(csv);
}));

const VALID_STATUSES = ["planned", "active", "on_hold", "completed"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseStatus(raw?: string): string {
  const normalized = raw?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized && VALID_STATUSES.includes(normalized) ? normalized : "planned";
}

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

projectsRouter.post("/import", asyncHandler(async (req, res) => {
  const bodySchema = z.object({ csv: z.string() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "CSV mancante" });

  const result = Papa.parse(parsed.data.csv, { header: true, skipEmptyLines: true });
  const rows = result.data as Record<string, string>[];

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.name?.trim()) continue;
    try {
      await db.insert(projects).values({
        name: row.name.trim(),
        client: row.client?.trim() || null,
        status: parseStatus(row.status) as any,
        startDate: parseDate(row.startDate),
        endDate: parseDate(row.endDate),
        color: row.color?.trim() || "#3457d5",
      });
      imported++;
    } catch (err) {
      console.error("Errore import progetto:", row, err);
      skipped++;
    }
  }
  res.json({ imported, skipped });
}));

projectsRouter.get("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return res.status(404).json({ error: "Progetto non trovato" });
  res.json(project);
}));

projectsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(projects).values(parsed.data).returning();
  res.status(201).json(created);
}));

projectsRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(projects)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Progetto non trovato" });
  res.json(updated);
}));

projectsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(projects).where(eq(projects.id, id));
  res.status(204).end();
}));
