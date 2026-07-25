import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
}

test("a user restricted to Dashboard only sees Dashboard in the nav and is blocked elsewhere", async ({ page }) => {
  const email = `e2e-restricted-${Date.now()}@test.local`;
  const password = "Restricted1!";

  // Admin creates the restricted user via the UI.
  await loginAsAdmin(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Utenti" }).click();
  await page.getByRole("button", { name: /nuovo utente/i }).click();
  await page.locator('label:has-text("Nome")').locator("input").fill("E2E Restricted");
  await page.locator('label:has-text("Email")').locator("input").fill(email);
  await page.locator('label:has-text("Password")').locator("input").fill(password);
  await page.getByRole("button", { name: /crea utente/i }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.locator(`tr:has-text("${email}")`).getByRole("button", { name: "Modifica" }).click();
  await page.getByRole("button", { name: "Personalizza" }).click();
  await page.locator('label:has-text("Dashboard")').locator('input[type=checkbox]').check();
  await page.getByRole("button", { name: /salva modifiche/i }).click();
  await expect(page.locator("h2", { hasText: "Modifica utente" })).not.toBeVisible();

  await page.getByRole("button", { name: "Esci" }).click();

  // Log in as the restricted user: only Dashboard should appear in the nav.
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");

  const nav = page.locator("nav").first();
  await expect(nav.getByText("Dashboard")).toBeVisible();
  await expect(nav.getByText("Persone")).not.toBeVisible();
  await expect(nav.getByText("Impostazioni")).not.toBeVisible();

  // Direct navigation to a non-granted tab shows the access-denied message
  // instead of the page content.
  await page.goto("/people");
  await expect(page.getByText(/non hai accesso a questa sezione/i)).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).click();

  // Clean up: admin deletes the disposable restricted user.
  await loginAsAdmin(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Utenti" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(`tr:has-text("${email}")`).getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByText(email)).not.toBeVisible();
});
