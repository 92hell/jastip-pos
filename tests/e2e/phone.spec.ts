import { expect, test, type Page } from "@playwright/test";
import { signInAsDemo } from "./support";

async function fitsTheScreen(page: Page, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

test("every page fits a phone screen", async ({ page }) => {
  await page.goto("/id");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await fitsTheScreen(page, "shop");
  await page.goto("/id/login");
  await fitsTheScreen(page, "login");
  await signInAsDemo(page);
  await fitsTheScreen(page, "dashboard");
  await page.goto("/id/settings");
  await expect(page.getByLabel("Nama toko")).toBeVisible();
  await fitsTheScreen(page, "settings");
});
