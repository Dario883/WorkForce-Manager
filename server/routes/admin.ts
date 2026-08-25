import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { requireAuth } from "../auth";
import { pool } from "../db";

export const adminRouter = Router();

const DATA_TABLES = [
  "activity_log",
  "absences",
  "assignments",
  "person_capacity_periods",
  "projects",
  "people",
  "holidays",
  "settings",
] as const;

adminRouter.use(requireAuth);

adminRouter.post(
  "/reset-data",
  asyncHandler(async (req, res) => {
    if (req.user?.permissions !== null) {
      return res.status(403).json({ error: "Solo l'admin può svuotare tutti i dati applicativi" });
    }

    await Promise.all(
      DATA_TABLES.map((table) => pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`))
    );

    res.json({
      ok: true,
      deleted: {
        tables: [...DATA_TABLES],
      },
    });
  })
);
