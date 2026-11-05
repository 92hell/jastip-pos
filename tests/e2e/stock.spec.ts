import { expect, test } from "@playwright/test";
import { expectAccessible, expectUniqueIds, formAlert, signInAsDemo } from "./support";

test("ready stock is added, sold at the bazaar, and taken into an order, never beyond what is left", async ({ page }) => {
  await signInAsDemo(page);
  const name = `Topi Uniqlo ${Date.now().toString(36).slice(-5)}`;
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Stok" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Stok ready" })).toBeVisible();
  await expectAccessible(page, "ready stock");

  await page.getByRole("link", { name: "+ Barang stok" }).click();
  await page.getByLabel("Nama barang").fill(name);
  await page.getByLabel("Merek / toko").fill("Uniqlo");
  await page.getByLabel("Jumlah").fill("3");
  await page.getByLabel("Modal per barang").fill("80rb");
  await page.getByLabel("Harga jual").fill("120rb");
  await expectAccessible(page, "new stock item");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Sisa 3").filter({ visible: true })).toBeVisible();

  // At the bazaar: 4 is more than there is; 2 sell.
  const sell = page.getByRole("region", { name: "Jual langsung" });
  await sell.getByLabel("Jumlah").fill("4");
  await sell.getByLabel("Event").selectOption({ label: "Bazaar AEON BSD (Bazaar)" });
  await sell.getByRole("button", { name: "Catat penjualan" }).click();
  await expect(sell.getByLabel("Jumlah")).toHaveAccessibleDescription("Stok ready tidak cukup.");
  await sell.getByLabel("Jumlah").fill("2");
  await sell.getByRole("button", { name: "Catat penjualan" }).click();
  await expect(page.getByText("Penjualan tersimpan.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Sisa 1").filter({ visible: true })).toBeVisible();
  const summary = page.getByRole("region", { name: "Ringkasan stok" });
  await expect(summary.getByRole("definition").last()).toHaveText(/Rp\s80\.000/);
  await expectAccessible(page, "stock item");
  await expectUniqueIds(page);

  // In an order: 2 is more than is left; 1 goes in, already in hand.
  await page.goto("/id/orders/new");
  await page.getByLabel("Klien").selectOption({ label: "Maya Sari" });
  await page.getByLabel("Ambil dari stok ready").selectOption({ label: `${name} · sisa 1 · Rp 120.000` });
  await page.getByRole("button", { name: "+ Tambahkan" }).click();
  const line = page.getByRole("group", { name: "Barang 2" });
  await expect(line.getByLabel("Nama barang")).toHaveValue(name);
  await page.getByRole("group", { name: "Barang 1" }).getByRole("button", { name: "Hapus barang 1" }).click();
  const stockLine = page.getByRole("group", { name: "Barang 1" });
  await stockLine.getByLabel("Jumlah").fill("2");
  await page.getByRole("button", { name: "Simpan pesanan" }).click();
  await expect(formAlert(page)).toBeVisible();
  await expect(stockLine.getByLabel("Jumlah")).toHaveAccessibleDescription("Stok ready tidak cukup.");
  await stockLine.getByLabel("Jumlah").fill("1");
  await page.getByRole("button", { name: "Simpan pesanan" }).click();
  await expect(page.getByText(/Pesanan TLY-\d{4}-\d{4} tersimpan/).filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel(`Status ${name}`)).toHaveValue("arrived");

  await page.getByRole("link", { name: "Stok ready" }).click();
  await expect(page.getByText("Habis").filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/Pesanan TLY-\d{4}-\d{4} · Maya Sari/).filter({ visible: true })).toBeVisible();
});
