import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectUniqueIds, formAlert, signInAsDemo } from "./support";

const rp = (digits: string) => new RegExp(`Rp\\s${digits.replace(/\./g, "\\.")}`);

async function newClient(page: Page, name: string) {
  await page.goto("/id/clients/new");
  await page.getByLabel("Nama").fill(name);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

test("an order mixing fee types shows its total while typing, saves the same total, and can be edited", async ({ page }) => {
  await signInAsDemo(page);
  const name = `Tari ${Date.now().toString(36).slice(-5)}`;
  await newClient(page, name);
  await page.getByRole("link", { name: "+ Pesanan baru" }).click();
  await expect(page.getByLabel("Klien")).toHaveValue(/\d+/);

  // Tas 350.000 + fee 25rb per item.
  let item = page.getByRole("group", { name: "Barang 1" });
  await item.getByLabel("Nama barang").fill("Tas");
  await item.getByLabel("Harga satuan").fill("350.000");
  await item.getByLabel("Fee per barang").fill("25rb");
  // Parfum NETT.
  await page.getByRole("button", { name: "+ Tambah barang" }).click();
  item = page.getByRole("group", { name: "Barang 2" });
  await item.getByLabel("Nama barang").fill("Parfum");
  await item.getByLabel("Harga satuan").fill("420rb");
  await item.getByLabel("Fee jastip").selectOption("nett");
  // Two skincare items in one bundle, fee 50rb.
  await page.getByRole("button", { name: "+ Tambah bundling" }).click();
  const bundle = page.getByRole("group", { name: "Bundling 1" });
  await bundle.getByLabel("Nama bundling").fill("Skincare");
  await bundle.getByLabel("Fee bundling").fill("50rb");
  for (const [n, product, price, qty] of [[3, "Serum", "120rb", "1"], [4, "Toner", "80.000", "2"]] as const) {
    await page.getByRole("button", { name: "+ Tambah barang" }).click();
    item = page.getByRole("group", { name: `Barang ${n}` });
    await item.getByLabel("Nama barang").fill(product);
    await item.getByLabel("Jumlah").fill(qty);
    await item.getByLabel("Harga satuan").fill(price);
    await item.getByLabel("Fee jastip").selectOption("bundle");
    await item.getByLabel("Bundling", { exact: true }).selectOption({ label: "Skincare" });
  }
  await page.getByLabel("Diskon", { exact: true }).fill("5rb");
  await page.getByLabel(/Voucher tag Instagram/).check();

  const summary = page.getByRole("region", { name: "Ringkasan" });
  // Items 350.000 + 420.000 + 120.000 + 2 × 80.000; fees 25.000 + 50.000; then − 5.000 discount − 10.000 voucher.
  await expect(summary.getByRole("definition").nth(0)).toHaveText(rp("1.050.000"));
  await expect(summary.getByRole("definition").nth(1)).toHaveText(rp("75.000"));
  await expect(summary.getByText("belum diisi")).toBeVisible();
  await expect(summary.getByRole("definition").last()).toHaveText(rp("1.110.000"));
  await expectAccessible(page, "new order");

  await page.getByRole("button", { name: "Simpan pesanan" }).click();
  await expect(page.getByText(/Pesanan TLY-\d{4}-\d{4} tersimpan/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Ringkasan" }).getByRole("definition").last()).toHaveText(rp("1.110.000"));
  await expect(page.getByText("Fee bundling Skincare")).toBeVisible();
  await expectAccessible(page, "order page");

  await page.getByRole("link", { name: "Ubah", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ubah pesanan");
  await expectUniqueIds(page);
  await page.getByRole("textbox", { name: "Ongkir", exact: true }).fill("18rb");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByRole("region", { name: "Ringkasan" }).getByRole("definition").last()).toHaveText(rp("1.128.000"));

  await page.goto("/id/orders");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText(rp("1.128.000"));
  await expectAccessible(page, "orders list");
});

test("the order form refuses what is not an amount, marks it, and keeps everything typed", async ({ page }) => {
  await signInAsDemo(page);
  await newClient(page, `Wati ${Date.now().toString(36).slice(-5)}`);
  await page.getByRole("link", { name: "+ Pesanan baru" }).click();
  const item = page.getByRole("group", { name: "Barang 1" });
  await item.getByLabel("Nama barang").fill("Jaket");
  await item.getByLabel("Harga satuan").fill("tiga ratus");
  await item.getByLabel("Fee per barang").fill("25rb");
  await expect(page.getByText("Periksa isian yang ditandai untuk melihat total.")).toBeVisible();

  await page.getByRole("button", { name: "Simpan pesanan" }).click();
  await expect(formAlert(page)).toHaveText("Ada yang belum benar. Periksa isian yang ditandai.");
  await expect(item.getByLabel("Harga satuan")).toHaveAccessibleDescription("Isi jumlah rupiah yang valid.");
  await expect(item.getByLabel("Nama barang")).toHaveValue("Jaket");
  await expectAccessible(page, "order form with errors");
});
