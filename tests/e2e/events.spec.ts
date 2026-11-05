import { expect, test } from "@playwright/test";
import { expectAccessible, expectUniqueIds, formAlert, signInAsDemo } from "./support";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test("an event is checked, takes orders, and closes to new orders until reopened", async ({ page }) => {
  await signInAsDemo(page);
  const name = `Bazaar ${Date.now().toString(36).slice(-5)}`;
  await page.goto("/id/events/new");
  await page.getByLabel("Jenis").selectOption({ label: "Bazaar" });
  await page.getByLabel("Nama event").fill(name);
  await page.getByLabel("Mulai").fill(day(10));
  await page.getByLabel("Selesai").fill(day(9));
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(formAlert(page)).toBeVisible();
  await expect(page.getByLabel("Selesai")).toHaveAccessibleDescription("Tidak boleh sebelum tanggal mulai.");
  await expect(page.getByLabel("Nama event")).toHaveValue(name);
  await expectAccessible(page, "event form with errors");

  await page.getByLabel("Selesai").fill(day(11));
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Event tersimpan.")).toBeVisible();
  await expectAccessible(page, "event page");
  await expectUniqueIds(page);

  await page.getByRole("link", { name: "+ Pesanan baru" }).click();
  await expect(page.getByRole("combobox", { name: "Event", exact: true })).toHaveValue(/\d+/);
  await page.goBack();

  await page.getByRole("button", { name: "Tutup order" }).click();
  await expect(page.getByText("Event ini ditutup: tidak menerima pesanan baru.")).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Pesanan baru" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buka lagi" }).click();
  await expect(page.getByRole("link", { name: "+ Pesanan baru" })).toBeVisible();

  await page.goto("/id/events");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("Bazaar");
  await expectAccessible(page, "events list");
});

test("the shopping list groups items by store, ticks what is bought and marks what is sold out", async ({ page }) => {
  await signInAsDemo(page);
  await page.goto("/id/events");
  await page.getByRole("link", { name: /Jastip Singapore/ }).click();
  await page.getByRole("link", { name: "Daftar belanja" }).click();

  const zara = page.getByRole("region", { name: "Zara AEON BSD" });
  await expect(zara.getByText("Parfum Zara 100ml ×1")).toBeVisible();
  await expect(page.getByRole("region", { name: "Grand Indonesia" }).getByRole("button", { name: "Sudah dibeli: Tas Charles & Keith" }))
    .toHaveAttribute("aria-pressed", "true");
  await expectAccessible(page, "shopping list");
  const progress = page.getByText(/^\d+ dari \d+ sudah dibeli$/);
  const before = Number((await progress.textContent())?.match(/^(\d+)/)?.[1]);

  await zara.getByRole("button", { name: "Sudah dibeli: Parfum Zara 100ml" }).click();
  await expect(progress).toHaveText(new RegExp(`^${before + 1} dari`));

  const watsons = page.getByRole("region", { name: "Watsons" });
  await watsons.getByRole("button", { name: "Sold out: Serum Somethinc" }).click();
  await expect(watsons.getByText(/Sold out, menunggu jawaban klien/)).toBeVisible();
  const tell = watsons.getByRole("link", { name: "Kabari klien: Dina Pratiwi" });
  await expect(tell).toHaveAttribute("href", /^https:\/\/wa\.me\/6281200000002\?text=.*sold%20out/);
});
