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

  const codeInput = page.getByLabel("Codice MFA");
  for (let attempt = 0; attempt < 3; attempt++) {
    await codeInput.fill(await generate({ secret }));
    await page.getByRole("button", { name: "Verifica codice" }).click();
    try {
      await expect(page).toHaveURL("/", { timeout: 1500 });
      return;
    } catch (error) {
      const invalidCode = await page.getByText(/codice mfa non valido/i).isVisible().catch(() => false);
      if (!invalidCode || attempt === 2) throw error;
      await page.waitForTimeout(1000);
    }
  }
}

export async function completeMfaEnrollment(page: Page) {
  await expect(page.getByText(/configura un'app di autenticazione/i)).toBeVisible();
  const secret = await page.locator("p").filter({ hasText: "Secret manuale:" }).locator("span").innerText();
  await page.getByLabel("Codice MFA").fill(await generate({ secret }));
  await page.getByRole("button", { name: "Attiva MFA e accedi" }).click();
  await expect(page).toHaveURL("/");
}