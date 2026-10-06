import { test, expect } from "@playwright/test";
import { completeMfaEnrollment, loginAsAdmin } from "./auth";
import { E2E_ADMIN_EMAIL, E2E_ENROLL_EMAIL, E2E_ENROLL_PASSWORD } from "./global-setup";

test("shows an error on wrong credentials and stays on /login", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill("wrong-password");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/credenziali|errore/i)).toBeVisible();
});

test("logs in, sees the dashboard, and logs out back to /login", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("requires MFA enrollment on the first login", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_ENROLL_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_ENROLL_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await completeMfaEnrollment(page);
});
