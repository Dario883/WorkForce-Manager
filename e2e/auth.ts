import { expect, type Page } from "@playwright/test";
import { generate } from "otplib";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

export async function loginAsAdmin(page: Page) {
  const secret = process.env.E2E_ADMIN_MFA_SECRET;
  if (!secret) throw new Error("E2E_ADMIN_MFA_SECRET is not available");

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.getByLabel("Codice MFA").fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verifica codice" }).click();
  await expect(page).toHaveURL("/");
}