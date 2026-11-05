import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Signs in with the demo admin button on the sign-in page. */
export async function signInAsDemo(page: Page, locale: "id" | "en" = "id") {
  await page.goto(`/${locale}/login`);
  await page.getByRole("button", { name: locale === "id" ? "Coba sebagai admin" : "Try as the admin" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard$`));
}

/** WCAG 2.1 A/AA problems axe can find automatically. */
export async function expectAccessible(page: Page, name: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
  expect(summary, `accessibility problems on ${name}`).toEqual([]);
}

/** The message of a refused form (not Next.js's own route announcer, which is also an alert). */
export const formAlert = (page: Page) => page.locator("form [role=alert], main [role=alert]").first();
