import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
});

test("creates a person, sees it in the list, then deletes it", async ({ page }) => {
  const name = `E2E Persona ${Date.now()}`;

  await page.goto("/people");
  await page.getByRole("button", { name: /nuova persona|nuovo/i }).click();
  await page.locator('label:has-text("Nome")').locator("input").fill(name);
  await page.getByRole("button", { name: /^crea|^salva/i }).click();

  await expect(page.getByText(name)).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(`tr:has-text("${name}")`).getByRole("button", { name: /elimina/i }).click();
  await expect(page.getByText(name)).not.toBeVisible();
});

test("creates a project and sees it in the projects list", async ({ page }) => {
  const name = `E2E Progetto ${Date.now()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: /nuovo progetto/i }).click();
  await page.locator('label:has-text("Nome")').locator("input").first().fill(name);
  await page.getByRole("button", { name: /^crea|^salva/i }).click();

  await expect(page.getByText(name)).toBeVisible();
});

test("filters calendar rows by selected people", async ({ page }) => {
  const suffix = Date.now();
  const selectedName = `E2E Calendar Selected ${suffix}`;
  const hiddenName = `E2E Calendar Hidden ${suffix}`;
  await page.request.post("/api/people", { data: { name: selectedName } });
  await page.request.post("/api/people", { data: { name: hiddenName } });

  await page.goto("/calendar");
  await expect(page.locator("tbody").getByText(selectedName)).toBeVisible();
  await expect(page.locator("tbody").getByText(hiddenName)).toBeVisible();

  await page.getByRole("button", { name: "Tutte le persone" }).click();
  await page.getByLabel(selectedName).check();
  await page.getByRole("button", { name: "1 persona selezionata" }).click();

  await expect(page.locator("tbody").getByText(selectedName)).toBeVisible();
  await expect(page.locator("tbody").getByText(hiddenName)).not.toBeVisible();
});
