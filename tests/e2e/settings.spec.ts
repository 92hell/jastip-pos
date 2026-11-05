import { expect, test } from "@playwright/test";
import { expectAccessible, formAlert, signInAsDemo } from "./support";

test("a refused save keeps what she typed and marks the field; fixing it saves, and the shop page shows it", async ({ page }) => {
  await signInAsDemo(page);
  await page.goto("/id/settings");
  await expect(page.getByText("Di demo ini rekening yang tampil adalah contoh")).toBeVisible();
  await expectAccessible(page, "settings");

  await page.getByLabel("Lokasi").fill("BSD City, Tangerang Selatan");
  const account = page.getByRole("group", { name: "Rekening 1" });
  await account.getByLabel("Nomor rekening").fill("12ab");
  await page.getByRole("button", { name: "Simpan" }).click();

  await expect(formAlert(page)).toHaveText("Ada yang belum benar. Periksa isian yang ditandai.");
  await expect(account.getByLabel("Nomor rekening")).toHaveAccessibleDescription("Nomor rekening hanya angka (5–30 digit).");
  await expect(page.getByLabel("Lokasi")).toHaveValue("BSD City, Tangerang Selatan");
  await expectAccessible(page, "settings with errors");

  await account.getByLabel("Nomor rekening").fill("1234 5678 90");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("status")).toHaveText("Tersimpan.");

  await page.goto("/id");
  await expect(page.getByText("BSD City, Tangerang Selatan")).toBeVisible();
});

test("payment accounts can be added up to five and removed", async ({ page }) => {
  await signInAsDemo(page, "en");
  await page.goto("/en/settings");
  const add = page.getByRole("button", { name: "+ Add an account" });
  for (let n = 3; n <= 5; n++) {
    await add.click();
    const account = page.getByRole("group", { name: `Account ${n}` });
    await account.getByLabel("Bank").fill("BRI");
    await account.getByLabel("Account name").fill("Demo");
    await account.getByLabel("Account number").fill(`12345${n}`);
  }
  await expect(add).toBeHidden();
  await page.getByRole("button", { name: "Remove account 5" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.reload();
  await expect(page.getByRole("group", { name: /^Account \d$/ })).toHaveCount(4);
});
