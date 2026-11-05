import { en } from "./en";
import { id, type Dictionary } from "./id";

export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "id";

const dictionaries: Record<Locale, Dictionary> = { id, en };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Fills {name}-style placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Rupiah as shops write it: "Rp 10.000". */
export function rupiah(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * The best supported language for an Accept-Language header: Indonesian unless the browser
 * prefers English over Indonesian.
 */
export function preferredLocale(acceptLanguage: string | null | undefined): Locale {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { lang: tag.split("-")[0], q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.lang && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);
  const best = ranked.find((entry) => isLocale(entry.lang));
  return best && isLocale(best.lang) ? best.lang : DEFAULT_LOCALE;
}
