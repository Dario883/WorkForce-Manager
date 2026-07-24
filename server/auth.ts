import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";
const COOKIE_NAME = "wfm_session";
const SESSION_DAYS = 7;

export interface AuthPayload {
  userId: number;
  email: string;
  name: string;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signSession(payload: AuthPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
}

export function verifySession(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function readSessionFromRequest(req: Request): AuthPayload | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

/**
 * Attaches req.user if a valid session cookie is present; does not block the
 * request. Re-checks the user is still active on every request (rather than
 * trusting the JWT alone) so deactivating a user takes effect immediately
 * instead of waiting out the token's remaining lifetime.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const session = readSessionFromRequest(req);
  if (session) {
    const [row] = await db.select({ active: users.active }).from(users).where(eq(users.id, session.userId)).limit(1);
    if (row?.active) req.user = session;
  }
  next();
}

/** Blocks the request with 401 if no valid session is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Non autenticato" });
  }
  next();
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
