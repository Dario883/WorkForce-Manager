import type { Request } from "express";
import { db } from "./db";
import { authAudit } from "./schema";

export type AuthAuditEvent = "login_success" | "login_failed" | "mfa_failed" | "mfa_enabled" | "mfa_disabled";

export async function logAuthEvent(
  req: Request,
  email: string,
  event: AuthAuditEvent,
  options: { userId?: number; reason?: string } = {}
) {
  try {
    await db.insert(authAudit).values({
      userId: options.userId ?? null,
      email,
      event,
      reason: options.reason ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
  } catch (err) {
    console.error("Errore durante la scrittura dell'audit autenticazione:", err);
  }
}
