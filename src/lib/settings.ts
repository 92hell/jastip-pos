import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { businessSettings, type BusinessSettings, type PaymentAccount } from "@/lib/db/schema";

export type Settings = Omit<BusinessSettings, "id" | "updatedAt">;

/** The shop's public profile (from its Instagram). Payment accounts are never defaults: the owner enters them. */
export const DEFAULT_SETTINGS: Settings = {
  shopName: "JASTIP TITIPLAILIYUK",
  tagline: "Your personal shopper",
  location: "BSD, Tangerang Selatan",
  instagram: "jastip_titiplailiyuk",
  whatsapp: "",
  paymentAccounts: [],
  rules: [
    "Pengiriman hanya Senin–Jumat. Sabtu occasional, Minggu libur.",
    "Kalau tertulis “NETT”, berarti nggak kena fee jastip lagi yaa.",
    "Reseller mohon konfirmasi dulu ke aku yaa.",
    "WAJIB ada video unboxing. Tanpa video, komplain nggak bisa diproses.",
  ].join("\n"),
  voucherAmount: 10_000,
};

const text = (max: number) => z.string().trim().max(max, "too_long");

const whatsapp = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === "" ||
      /^\+?[0-9][0-9 \-]{7,18}$/.test(v) ||
      /^https:\/\/wa\.me\/[0-9]{8,15}$/.test(v) ||
      /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{6,40}$/.test(v),
    "invalid_whatsapp",
  );

const paymentAccount = z.object({
  bank: z.string().trim().min(1, "required").max(40, "too_long"),
  holder: z.string().trim().min(1, "required").max(80, "too_long"),
  number: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^[0-9]{5,30}$/, "invalid_account_number")),
});

export const settingsSchema = z.object({
  shopName: z.string().trim().min(1, "required").max(80, "too_long"),
  tagline: text(120),
  location: text(80),
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9._]{0,30}$/, "invalid_instagram")),
  whatsapp,
  paymentAccounts: z.array(paymentAccount).max(5, "too_many"),
  rules: text(2000),
  voucherAmount: z.coerce.number().int("invalid_amount").min(0, "invalid_amount").max(1_000_000, "invalid_amount"),
});

export type SettingsInput = z.input<typeof settingsSchema>;
export type FieldErrors = Record<string, string>;
export type SaveResult = { ok: true } | { ok: false; errors: FieldErrors };

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(businessSettings).where(eq(businessSettings.id, 1));
  if (!row) return DEFAULT_SETTINGS;
  return {
    shopName: row.shopName,
    tagline: row.tagline,
    location: row.location,
    instagram: row.instagram,
    whatsapp: row.whatsapp,
    paymentAccounts: row.paymentAccounts,
    rules: row.rules,
    voucherAmount: row.voucherAmount,
  };
}

/** Validates and saves; on failure nothing is saved and each bad field has an error code. */
export async function updateSettings(db: Db, input: SettingsInput): Promise<SaveResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }
  const values = { ...parsed.data, paymentAccounts: parsed.data.paymentAccounts as PaymentAccount[], updatedAt: new Date() };
  await db
    .insert(businessSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: businessSettings.id, set: values });
  return { ok: true };
}
