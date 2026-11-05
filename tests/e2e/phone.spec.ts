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
  for (const [path, name] of [["/id/clients", "clients"], ["/id/orders", "orders"], ["/id/orders/new", "new order"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await fitsTheScreen(page, name);
  }
  await page.goto("/id/events");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await fitsTheScreen(page, "events");
  await page.getByRole("link", { name: /Jastip Singapore/ }).click();
  await page.getByRole("link", { name: "Daftar belanja" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await fitsTheScreen(page, "shopping list");
  await page.goto("/id/orders");
  await page.getByRole("link", { name: /TLY-/ }).first().click();
  await expect(page.getByRole("region", { name: "Ringkasan" })).toBeVisible();
  await fitsTheScreen(page, "order page");
  const link = (await page.getByRole("region", { name: "Pembayaran" }).locator("p.font-mono").textContent())!.trim();
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Invoice");
  await fitsTheScreen(page, "invoice");
});
