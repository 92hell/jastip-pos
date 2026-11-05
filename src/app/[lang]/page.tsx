import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Brand } from "@/components/Brand";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { fill, rupiah } from "@/i18n";
import { currentLocale } from "@/i18n/server";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/** The shop's public page: who she is, her rules and how to reach her. */
export default async function ShopPage() {
  const { locale, t } = await currentLocale();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center justify-end">
        <LanguageSwitch current={locale} path="" label={t.common.language} />
      </header>
      <main id="main">
        <Suspense fallback={<p>{t.common.loading}</p>}>
          <ShopProfile />
        </Suspense>
        <p className="mt-10 text-center text-sm">
          <Link href={`/${locale}/login`} className="text-primary underline">
            {t.shop.forOwner}
          </Link>
        </p>
      </main>
    </div>
  );
}

async function ShopProfile() {
  await connection();
  const { locale, t } = await currentLocale();
  const s = await getSettings(getDb());
  const rules = s.rules.split("\n").map((r) => r.trim()).filter(Boolean);
  const whatsapp = s.whatsapp.startsWith("https://") ? s.whatsapp : s.whatsapp ? `https://wa.me/${toWaNumber(s.whatsapp)}` : "";
  return (
    <>
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm">
        <h1>
          <Brand name={s.shopName} size="lg" />
        </h1>
        {s.tagline && <p className="mt-4 text-lg font-semibold">{s.tagline}</p>}
        {s.location && <p className="text-muted">{s.location}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {whatsapp && (
            <a href={whatsapp} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark" rel="noopener noreferrer">
              {t.shop.chatOnWhatsApp}
            </a>
          )}
          {s.instagram && (
            <a
              href={`https://instagram.com/${s.instagram}`}
              className="rounded-full border-2 border-ink px-5 py-2 font-semibold hover:bg-sky-soft"
              rel="noopener noreferrer"
            >
              {t.shop.instagram} @{s.instagram}
            </a>
          )}
        </div>
      </section>
      {rules.length > 0 && (
        <section aria-labelledby="rules" className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 id="rules" className="font-display text-3xl">
            {t.shop.rules}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          {s.voucherAmount > 0 && (
            <p className="mt-4 rounded-2xl bg-sky-soft p-3 font-semibold">{fill(t.shop.voucher, { amount: rupiah(s.voucherAmount, locale) })}</p>
          )}
        </section>
      )}
    </>
  );
}

/** "0812-3456-7890" → "6281234567890" for wa.me links. */
function toWaNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}
