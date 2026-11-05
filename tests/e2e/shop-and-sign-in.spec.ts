import { expect, test } from "@playwright/test";
import { expectAccessible, formAlert, signInAsDemo } from "./support";

test("the shop page shows who she is, her rules and the voucher, in Indonesian or English", async ({ page }) => {
  await page.goto("/id");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("JASTIP TITIPLAILIYUK");
  await expect(page.getByText("Your personal shopper")).toBeVisible();
  await expect(page.getByRole("link", { name: "Instagram @jastip_titiplailiyuk" })).toHaveAttribute("href", "https://instagram.com/jastip_titiplailiyuk");
  await expect(page.getByRole("listitem").filter({ hasText: "NETT" })).toBeVisible();
  await expect(page.getByText("Bonus voucher Rp 10.000")).toBeVisible();
  await expectAccessible(page, "shop (id)");

  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Jastip rules" })).toBeVisible();
  await expectAccessible(page, "shop (en)");
});

test("a page without a language opens in the browser's language", async ({ browser }) => {
  const english = await browser.newContext({ locale: "en-GB" });
  const page = await english.newPage();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/en\/login$/);
  await english.close();
});

test("a wrong password is refused and keeps the username; the demo admin signs in and out", async ({ page }) => {
  await page.goto("/id/login");
  await page.getByLabel("Nama pengguna").fill("demo");
  await page.getByLabel("Kata sandi").fill("not-the-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(formAlert(page)).toHaveText("Nama pengguna atau kata sandi salah.");
  await expect(page.getByLabel("Nama pengguna")).toHaveValue("demo");
  await expectAccessible(page, "login");

  await signInAsDemo(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halo, Laili (demo)!");
  await expectAccessible(page, "dashboard");
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/id\/login$/);
});

test("admin pages need a sign-in", async ({ page }) => {
  for (const path of ["/id/dashboard", "/en/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/${path.split("/")[1]}/login$`));
  }
});
