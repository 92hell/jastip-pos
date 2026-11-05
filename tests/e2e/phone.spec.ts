import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signInAsDemo } from "./support";

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
  for (const [path, name] of [["/id/clients", "clients"], ["/id/orders", "orders"], ["/id/orders/new", "new order"], ["/id/stock", "ready stock"], ["/id/stock/new", "new stock item"], ["/id/stock/1", "stock item"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await fitsTheScreen(page, name);
  }
  await page.goto("/id/events");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await fitsTheScreen(page, "events");
  await page.getByRole("link", { name: /Jastip Singapore/ }).click();
  await page.getByRole("link", { name: "Daftar belanja" }).click();
  await expect(page.getByText(/^\d+ dari \d+ sudah dibeli$/)).toBeVisible();
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

test("on a phone the main sections are tabs at the bottom; the rest is under More", async ({ page }) => {
  await signInAsDemo(page);
  const tabs = page.getByRole("navigation", { name: "Menu utama" });
  await tabs.getByRole("link", { name: /Pesanan/ }).click();
  await expect(page).toHaveURL(/\/id\/orders$/);
  await expect(tabs.getByRole("link", { name: /Pesanan/ })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: /Lainnya/ }).click();
  await expect(page.getByRole("heading", { name: "Pasang aplikasi" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pengaturan toko/ })).toBeVisible();
  await fitsTheScreen(page, "more");
  await expectAccessible(page, "more (phone)");

  await page.getByRole("link", { name: /Ganti kata sandi/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Akun" })).toBeVisible();
  await fitsTheScreen(page, "account");
});
