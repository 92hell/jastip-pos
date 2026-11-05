import Link from "next/link";
import { LOCALES, type Locale } from "@/i18n";

const NAMES: Record<Locale, string> = { id: "Bahasa Indonesia", en: "English" };

/** ID / EN links to the same page in the other language. */
export function LanguageSwitch({ current, path, label }: { current: Locale; path: string; label: string }) {
  return (
    <nav aria-label={label} className="flex overflow-hidden rounded-full border border-line bg-white text-sm font-semibold">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={`/${l}${path}`}
          hrefLang={l}
          lang={l}
          aria-current={l === current ? "true" : undefined}
          className={`px-3 py-1.5 ${l === current ? "bg-ink text-white" : "text-ink hover:bg-sky-soft"}`}
        >
          {/* The spoken name starts with the visible "ID"/"EN", so voice control can use what it sees. */}
          {l.toUpperCase()}
          <span className="sr-only"> {NAMES[l]}</span>
        </Link>
      ))}
    </nav>
  );
}
