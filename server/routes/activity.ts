import { Router } from "express";
import { db } from "../db";
import { activityLog, authAudit } from "../schema";
import { asyncHandler } from "../asyncHandler";

export const activityRouter = Router();

const MAX_ENTRIES = 500;

activityRouter.get("/", asyncHandler(async (_req, res) => {
  const [activityRows, authRows] = await Promise.all([
    db.select().from(activityLog),
    db.select().from(authAudit),
  ]);
  const authenticationRows = authRows.map((row) => ({
    id: 1_000_000_000 + row.id,
    userId: row.userId ?? 0,
    userName: row.email,
    action: row.event,
    entityType: "autenticazione",
    entityId: 0,
    entityName: row.email,
    detail: row.reason,
    createdAt: row.createdAt,
  }));
  const rows = [...activityRows, ...authenticationRows]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, MAX_ENTRIES);
  res.json(rows);
}));
