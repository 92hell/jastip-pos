import "server-only";
import { lang } from "next/root-params";
import { dictionary, isLocale, type Locale } from "./index";

/** The language of the current page (from /id/… or /en/…), with its texts. */
export async function currentLocale(): Promise<{ locale: Locale; t: ReturnType<typeof dictionary> }> {
  const value = await lang();
  const locale: Locale = isLocale(value) ? value : "id";
  return { locale, t: dictionary(locale) };
}
