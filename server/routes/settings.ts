import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { settings } from "../schema";
import { eq } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";

export const settingsRouter = Router();

const DEFAULTS: Record<string, string> = {
  underutilization_threshold: "70", // % below which a person is "under-allocated"
  overutilization_threshold: "100", // % above which a person is "over-allocated"
};

settingsRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(settings);
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  res.json(map);
}));

const updateSchema = z.record(z.string());

settingsRouter.put("/", asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  for (const [key, value] of Object.entries(parsed.data)) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }

  const rows = await db.select().from(settings);
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  res.json(map);
}));
