import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, signInAsDemo } from "./support";

// A real 1×1 PNG, as a phone would upload a (much larger) photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function orderFor(page: Page, opts: { dp?: string; items: [string, string][] }) {
  const name = `Ayu ${Date.now().toString(36).slice(-5)}`;
  await page.goto("/id/clients/new");
  await page.getByLabel("Nama").fill(name);
  await page.getByLabel("WhatsApp").fill(`0857${Date.now().toString().slice(-8)}`);
  await page.getByLabel("Alamat").fill("Jl. Rahasia No. 7");
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.getByRole("link", { name: "+ Pesanan baru" }).click();
  for (const [i, [item, price]] of opts.items.entries()) {
    if (i > 0) await page.getByRole("button", { name: "+ Tambah barang" }).click();
    const group = page.getByRole("group", { name: `Barang ${i + 1}` });
    await group.getByLabel("Nama barang").fill(item);
    await group.getByLabel("Harga satuan").fill(price);
    await group.getByLabel("Fee jastip").selectOption("nett");
  }
  if (opts.dp) await page.getByRole("textbox", { name: "DP (%)" }).fill(opts.dp);
  await page.getByRole("button", { name: "Simpan pesanan" }).click();
  await expect(page.getByText(/Pesanan TLY-\d{4}-\d{4} tersimpan/)).toBeVisible();
  return name;
}

test("a DP with a receipt photo, then the rest; the client's invoice link shows the balance but nothing private", async ({ page, browser }) => {
  await signInAsDemo(page);
  const client = await orderFor(page, { dp: "50", items: [["Tas", "1jt"]] });
  const payments = page.getByRole("region", { name: "Pembayaran" });
  await expect(payments.getByText("Belum bayar")).toBeVisible();
  await expect(payments.getByRole("textbox", { name: "Jumlah" })).toHaveValue("500000");

  await payments.getByLabel("Foto bukti transfer").setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG });
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(payments.getByText("DP lunas")).toBeVisible();
  const proof = payments.getByRole("link", { name: "Lihat bukti" });
  const proofResponse = await page.request.get((await proof.getAttribute("href"))!);
  expect(proofResponse.status()).toBe(200);
  expect(proofResponse.headers()["content-type"]).toMatch(/^image\//);
  await expectAccessible(page, "order with a payment");

  const link = (await payments.locator("p.font-mono").textContent())!.trim();
  expect(link).toMatch(/\/id\/i\/[0-9a-f]{32}$/);
  await expect(payments.getByRole("link", { name: "Kirim invoice" })).toHaveAttribute("href", new RegExp(`text=.*${encodeURIComponent(link).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  const visitor = await browser.newContext();
  const invoicePage = await visitor.newPage();
  await invoicePage.goto(link);
  await expect(invoicePage.getByRole("heading", { level: 1 })).toContainText("Invoice TLY-");
  await expect(invoicePage.getByText(`Untuk ${client}`)).toBeVisible();
  await expect(invoicePage.getByText("DP lunas")).toBeVisible();
  await expect(invoicePage.getByRole("listitem").filter({ hasText: /^BCA 0000000000 · a\.n\. Contoh Demo Jastip$/ })).toBeVisible();
  await expect(invoicePage.getByText("Jl. Rahasia")).toHaveCount(0);
  await expect(invoicePage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expectAccessible(invoicePage, "invoice");
  const anonymousProof = await invoicePage.request.get(new URL((await proof.getAttribute("href"))!, link).toString());
  expect(anonymousProof.status()).toBe(401);
  await visitor.close();

  await payments.getByRole("textbox", { name: "Jumlah" }).fill("500rb");
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(payments.getByText("Lunas", { exact: true })).toBeVisible();
});

test("after a paid item is called off, the difference is kept as credit and pays part of the next order", async ({ page }) => {
  await signInAsDemo(page);
  const client = await orderFor(page, { items: [["Tas", "800rb"], ["Dompet", "200rb"]] });
  const payments = page.getByRole("region", { name: "Pembayaran" });
  await payments.getByRole("textbox", { name: "Jumlah" }).fill("1jt");
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(payments.getByText("Lunas", { exact: true })).toBeVisible();

  await page.getByLabel("Status Dompet").selectOption({ label: "Sold out" });
  await page.getByRole("button", { name: "Simpan", exact: true }).first().click();
  await page.getByRole("button", { name: "Dibatalkan: Dompet" }).click();
  await expect(payments.getByText("Klien kelebihan bayar Rp 200.000", { exact: false })).toBeVisible();
  await payments.getByRole("button", { name: /Jadikan kredit/ }).click();
  await expect(payments.getByText("Kredit klien: Rp 200.000", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: client }).click();
  await page.getByRole("link", { name: "+ Pesanan baru" }).click();
  const item = page.getByRole("group", { name: "Barang 1" });
  await item.getByLabel("Nama barang").fill("Kaos");
  await item.getByLabel("Harga satuan").fill("150rb");
  await item.getByLabel("Fee jastip").selectOption("nett");
  await page.getByRole("button", { name: "Simpan pesanan" }).click();
  const next = page.getByRole("region", { name: "Pembayaran" });
  await next.getByLabel("Cara bayar").selectOption({ label: "Kredit klien" });
  await next.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(next.getByText("Lunas", { exact: true })).toBeVisible();
  await expect(next.getByText("Kredit klien: Rp 50.000", { exact: false })).toBeVisible();
});

test("an unknown invoice link says so, in the client's language", async ({ page }) => {
  await page.goto(`/en/i/${"0".repeat(32)}`);
  await expect(page.getByText("Invoice not found.")).toBeVisible();
});
