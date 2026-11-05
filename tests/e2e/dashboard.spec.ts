import { expect, test } from "@playwright/test";
import { expectAccessible, signInAsDemo } from "./support";

test("the dashboard shows what needs doing, each linking to where it is done, and the money", async ({ page }) => {
  await signInAsDemo(page);
  const todo = page.getByRole("region", { name: "Perlu dikerjakan" });

  await expect(todo.getByRole("heading", { name: /barang belum dibeli/ })).toBeVisible();
  await expect(todo.getByRole("link", { name: "Jastip Singapore" })).toHaveAttribute("href", /\/id\/events\/\d+\/shopping$/);
  await expect(todo.getByRole("link", { name: /Toner Avoskin ×2 · Dina Pratiwi/ })).toBeVisible();
  await expect(todo.getByRole("link", { name: /Dina Pratiwi · kurang Rp/ })).toBeVisible();
  await expect(page.getByText("Belum dibayar klien")).toBeVisible();
  await expect(page.getByText("Fee jastip bulan ini")).toBeVisible();
  await expectAccessible(page, "dashboard");

  await todo.getByRole("link", { name: /Toner Avoskin/ }).click();
  await expect(page.getByText("menunggu jawaban klien").first()).toBeVisible();
});

test("an event page adds up its orders, the fees earned on it, and what is still owed", async ({ page }) => {
  await signInAsDemo(page);
  await page.goto("/id/events");
  await page.getByRole("link", { name: /Jastip Singapore/ }).click();
  const summary = page.getByRole("region", { name: "Ringkasan event" });
  // Fees: the bag's 50.000, the skincare bundle's 60.000 and 8% of the 1.000.000 shoes.
  await expect(summary.getByRole("definition").nth(2)).toHaveText(/Rp\s190\.000/);
  await expect(summary.getByRole("definition").nth(0)).toHaveText("2");
});
