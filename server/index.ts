import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { attachUser, requireAuth } from "./auth";
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

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(asyncHandler(attachUser));

// Public
app.use("/api/auth", authRouter);

// Protected
app.use("/api/people", requireAuth, peopleRouter);
app.use("/api/projects", requireAuth, projectsRouter);
app.use("/api/assignments", requireAuth, assignmentsRouter);
app.use("/api/staffing", requireAuth, staffingRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/absences", requireAuth, absencesRouter);
app.use("/api/holidays", requireAuth, holidaysRouter);
app.use("/api/activity", requireAuth, activityRouter);

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

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`WorkForce Manager server in ascolto sulla porta ${port}`);
});
