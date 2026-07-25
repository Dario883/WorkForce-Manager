import express from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { attachUser, requireAuth, requireTab, requireTabWrite } from "./auth";
import { asyncHandler } from "./asyncHandler";
import { authRouter } from "./routes/auth";
import { peopleRouter } from "./routes/people";
import { projectsRouter } from "./routes/projects";
import { assignmentsRouter } from "./routes/assignments";
import { staffingRouter } from "./routes/staffing";
import { settingsRouter } from "./routes/settings";
import { usersRouter } from "./routes/users";
import { absencesRouter } from "./routes/absences";
import { holidaysRouter } from "./routes/holidays";
import { activityRouter } from "./routes/activity";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(asyncHandler(attachUser));

// Public
app.use("/api/auth", authRouter);

// Protected — reads stay open across tabs (shared dashboards/aggregations
// depend on them), writes are gated per-tab; /users and /activity are only
// ever consumed by the Impostazioni tab, so they're fully gated. Within
// Impostazioni, each sub-section (Soglie/Festività/Utenti/Registro) has its
// own grant on top of the "settings" tab grant.
app.use("/api/people", requireAuth, requireTabWrite("people"), peopleRouter);
app.use("/api/projects", requireAuth, requireTabWrite("projects"), projectsRouter);
app.use("/api/assignments", requireAuth, requireTabWrite("staffing"), assignmentsRouter);
app.use("/api/staffing", requireAuth, staffingRouter);
app.use(
  "/api/settings",
  requireAuth,
  requireTabWrite("settings"),
  requireTabWrite("settings:thresholds"),
  settingsRouter
);
app.use("/api/users", requireAuth, requireTab("settings"), requireTab("settings:users"), usersRouter);
app.use("/api/absences", requireAuth, requireTabWrite("absences"), absencesRouter);
app.use(
  "/api/holidays",
  requireAuth,
  requireTabWrite("settings"),
  requireTabWrite("settings:holidays"),
  holidaysRouter
);
app.use("/api/activity", requireAuth, requireTab("settings"), requireTab("settings:activity"), activityRouter);

if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// Global error handler — must be registered last, and must take 4 args
// so Express recognizes it as an error middleware instead of a normal one.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Errore non gestito:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Errore interno del server" });
});

export default app;
