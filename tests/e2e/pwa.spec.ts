import { expect, test } from "@playwright/test";
import { expectAccessible, signInAsDemo } from "./support";

test("the app can be installed: manifest, icons, iPhone home-screen icon, and a service worker that is never cached", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Titip Laili Yuk", display: "standalone", start_url: "/id/orders", theme_color: "#9fd8fd" });
  expect(manifest.icons.map((i: { purpose: string; sizes: string }) => `${i.purpose} ${i.sizes}`)).toEqual(["any 192x192", "any 512x512", "maskable 512x512"]);
  for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), "/icons/apple-touch-icon.png"]) {
    const response = await request.get(icon);
    expect(response.headers()["content-type"], icon).toBe("image/png");
  }
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-store");

  await page.goto("/id");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
});

test("a shopping list opened once still opens and can be ticked without signal; ticks are sent when signal returns", async ({ page, context }) => {
  await signInAsDemo(page);
  await page.goto("/id/events");
  await page.getByRole("link", { name: /Jastip Singapore/ }).click();
  await page.getByRole("link", { name: "Daftar belanja" }).click();
  await expect(page).toHaveURL(/\/events\/\d+\/shopping$/);
  const listUrl = page.url();
  // Once the service worker controls the page, opening the list stores it on the phone.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.reload();
  await expect(page.getByText("Sepatu Converse ×1")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Sedang offline.")).toBeVisible();
  await expect(page.getByText("Sepatu Converse ×1")).toBeVisible();
  await page.getByRole("button", { name: "Sudah dibeli: Sepatu Converse" }).click();
  await expect(page.getByRole("button", { name: "Sudah dibeli: Sepatu Converse" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 centang belum terkirim.", { exact: false })).toBeVisible();
  await expectAccessible(page, "shopping list offline");

  await context.setOffline(false);
  await expect(page.getByText("Semua centang sudah terkirim.")).toBeVisible();
  await page.goto(listUrl);
  await expect(page.getByRole("button", { name: "Sudah dibeli: Sepatu Converse" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("belum terkirim")).toHaveCount(0);

  // Without signal, other pages show the offline page instead of the browser's error.
  await context.setOffline(true);
  await page.goto("/id/clients");
  await expect(page.getByRole("heading", { name: "Sedang offline" })).toBeVisible();
  await context.setOffline(false);
});

test("signing out forgets the saved lists and unsent ticks on this phone", async ({ page }) => {
  await signInAsDemo(page);
  await page.goto("/id/events");
  await page.getByRole("link", { name: /Jastip Singapore/ }).click();
  await page.getByRole("link", { name: "Daftar belanja" }).click();
  await expect(page).toHaveURL(/\/events\/\d+\/shopping$/);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("pages-v1"))).toBe(true);
  await page.evaluate(() => localStorage.setItem("jastip-pending", JSON.stringify([{ orderId: 1, itemId: 999, status: "bought" }])));

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/id\/login$/);

  expect(await page.evaluate(() => localStorage.getItem("jastip-pending"))).toBeNull();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("pages-v1"))).toBe(false);
});
