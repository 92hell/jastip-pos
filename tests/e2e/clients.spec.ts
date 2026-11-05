import { expect, test } from "@playwright/test";
import { expectAccessible, expectUniqueIds, formAlert, signInAsDemo } from "./support";

const unique = () => `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const phone = () => `0813${Date.now().toString().slice(-8)}`;

test("a client is added, found by name or number, and a number another client has is refused (what she typed stays)", async ({ page }) => {
  await signInAsDemo(page);
  const name = `Rani ${unique()}`;
  const number = phone();
  await page.goto("/id/clients/new");
  await page.getByLabel("Nama").fill(name);
  await page.getByLabel("WhatsApp").fill(number);
  await page.getByLabel("Reseller").check();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Klien tersimpan.")).toBeVisible();
  await expect(page.getByText("Reseller", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Chat WhatsApp" })).toHaveAttribute("href", `https://wa.me/62${number.slice(1)}`);
  await expectAccessible(page, "client page");

  await page.goto("/id/clients");
  await page.getByLabel("Cari nama atau nomor WhatsApp").fill(number.slice(-6));
  await page.getByRole("button", { name: "Cari" }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expectAccessible(page, "clients list");

  await page.goto("/id/clients/new");
  await page.getByLabel("Nama").fill(`Rani lagi ${unique()}`);
  await page.getByLabel("WhatsApp").fill(`+62 ${number.slice(1)}`);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(formAlert(page)).toBeVisible();
  await expect(page.getByLabel("WhatsApp")).toHaveAccessibleDescription("Nomor ini sudah dipakai klien lain.");
  await expect(page.getByLabel("Nama")).toHaveValue(/Rani lagi/);
  await expectUniqueIds(page);
});

test("deleting a client who has orders wipes their details but keeps the orders", async ({ page }) => {
  await signInAsDemo(page);
  const name = `Hapus ${unique()}`;
  await page.goto("/id/clients/new");
  await page.getByLabel("Nama").fill(name);
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.getByRole("link", { name: "+ Pesanan baru" }).click();
  const item = page.getByRole("group", { name: "Barang 1" });
  await item.getByLabel("Nama barang").fill("Kaos");
  await item.getByLabel("Harga satuan").fill("100rb");
  await item.getByLabel("Fee jastip").selectOption("nett");
  await page.getByRole("button", { name: "Simpan pesanan" }).click();
  await expect(page.getByText(/Pesanan TLY-\d{4}-\d{4} tersimpan/)).toBeVisible();
  const orderUrl = page.url();

  await page.getByRole("link", { name }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hapus klien" }).click();
  await expect(page).toHaveURL(/\/id\/clients$/);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);

  await page.goto(orderUrl);
  await expect(page.getByText(/Klien dihapus #\d+/)).toBeVisible();
});
