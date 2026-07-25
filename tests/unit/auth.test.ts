import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  requireTab,
  requireTabWrite,
  requireAuth,
  type RequestUser,
} from "../../server/auth";

function fakeReq(overrides: Partial<Request> & { user?: RequestUser } = {}): Request {
  return { method: "GET", ...overrides } as unknown as Request;
}

function fakeRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("hashPassword / verifyPassword", () => {
  it("hashes a password and verifies it back correctly", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    expect(hash).not.toBe("Sup3rSecret!");
    await expect(verifyPassword("Sup3rSecret!", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});

describe("signSession / verifySession", () => {
  it("round-trips a valid token", () => {
    const token = signSession({ userId: 1, email: "a@b.com", name: "Admin" });
    const decoded = verifySession(token);
    expect(decoded).toMatchObject({ userId: 1, email: "a@b.com", name: "Admin" });
  });

  it("rejects a tampered/invalid token", () => {
    expect(verifySession("not-a-real-token")).toBeNull();
  });
});

describe("requireAuth", () => {
  it("blocks with 401 when req.user is missing", () => {
    const req = fakeReq();
    const res = fakeRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when req.user is present", () => {
    const req = fakeReq({ user: { userId: 1, email: "a@b.com", name: "A", permissions: null } });
    const res = fakeRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requireTab", () => {
  it("allows through when permissions is null (unrestricted)", () => {
    const req = fakeReq({ user: { userId: 1, email: "a@b.com", name: "A", permissions: null } });
    const res = fakeRes();
    const next = vi.fn();
    requireTab("people")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows through when the tab is included in permissions", () => {
    const req = fakeReq({ user: { userId: 1, email: "a@b.com", name: "A", permissions: ["people", "dashboard"] } });
    const res = fakeRes();
    const next = vi.fn();
    requireTab("people")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks with 403 when the tab is missing from permissions", () => {
    const req = fakeReq({ user: { userId: 1, email: "a@b.com", name: "A", permissions: ["dashboard"] } });
    const res = fakeRes();
    const next = vi.fn();
    requireTab("people")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireTabWrite", () => {
  const restrictedReq = () =>
    fakeReq({ user: { userId: 1, email: "a@b.com", name: "A", permissions: ["dashboard"] } });

  it("lets GET requests through even without the tab grant", () => {
    const req = { ...restrictedReq(), method: "GET" } as Request;
    const res = fakeRes();
    const next = vi.fn();
    requireTabWrite("people")(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks POST requests without the tab grant", () => {
    const req = { ...restrictedReq(), method: "POST" } as Request;
    const res = fakeRes();
    const next = vi.fn();
    requireTabWrite("people")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("lets POST requests through when the tab is granted", () => {
    const req = fakeReq({
      user: { userId: 1, email: "a@b.com", name: "A", permissions: ["people"] },
      method: "POST",
    });
    const res = fakeRes();
    const next = vi.fn();
    requireTabWrite("people")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
