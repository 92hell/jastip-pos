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
  // Check the finished page: parts of it stream in after the first paint.
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
  expect(summary, `accessibility problems on ${name}`).toEqual([]);
}

/** The message of a refused form (not Next.js's own route announcer, which is also an alert). */
export const formAlert = (page: Page) => page.locator("form [role=alert], main [role=alert]").first();

/**
 * No two elements share an id, counting the pages Next.js keeps hidden for back navigation: a
 * label pointing at a hidden twin would label the wrong field.
 */
export async function expectUniqueIds(page: Page) {
  const duplicates = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  });
  expect(duplicates, "ids used more than once").toEqual([]);
}
