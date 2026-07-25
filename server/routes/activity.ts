import { Router } from "express";
import { db } from "../db";
import { activityLog } from "../schema";
import { desc } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";

export const activityRouter = Router();

const MAX_ENTRIES = 500;

activityRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(MAX_ENTRIES);
  res.json(rows);
}));
