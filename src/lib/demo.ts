import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { ensureOwner } from "@/lib/auth/accounts";
import { createClient } from "@/lib/clients";
import { createOrder, type OrderInput } from "@/lib/orders";
import { DEFAULT_SETTINGS, updateSettings } from "@/lib/settings";

/** Clearly fake accounts: the public demo never shows real bank details. */
export const DEMO_ACCOUNTS = [
  { bank: "BCA", holder: "Contoh Demo Jastip", number: "0000000000" },
  { bank: "Bank Jago", holder: "Contoh Demo Jastip", number: "000000000000" },
];

/** Puts the public demo back to its starting point: the demo admin and the sample shop settings. */
export async function resetDemo(db: Db, admin: { username: string; password: string }) {
  await db.execute(sql`TRUNCATE users, sessions, business_settings, clients, orders, order_bundles, order_items, order_counters RESTART IDENTITY CASCADE`);
  await ensureOwner(db, { ...admin, displayName: "Laili (demo)" });
  const saved = await updateSettings(db, {
    ...DEFAULT_SETTINGS,
    voucherAmount: String(DEFAULT_SETTINGS.voucherAmount),
    paymentAccounts: DEMO_ACCOUNTS,
  });
  if (!saved.ok) throw new Error(`Demo settings are invalid: ${JSON.stringify(saved.errors)}`);
  await seedOrders(db);
}

/** Invented clients (numbers in the unused 0812-0000-… range) and orders showing every fee type. */
async function seedOrders(db: Db) {
  const client = async (name: string, whatsapp: string, isReseller = false, notes = "") => {
    const result = await createClient(db, { name, whatsapp, address: "", notes, isReseller });
    if (!result.ok) throw new Error(`Demo client ${name}: ${JSON.stringify(result.errors)}`);
    return result.id;
  };
  const siti = await client("Siti Rahma", "0812-0000-0001", false, "Suka skincare Korea");
  const dina = await client("Dina Pratiwi", "0812-0000-0002", true, "Reseller Bintaro");
  const maya = await client("Maya Sari", "0812-0000-0003");

  const item = (name: string, store: string, unitPrice: string, fee: Partial<OrderInput["items"][number]>, quantity = 1) => ({
    name, store, quantity, unitPrice, feeMode: "nett" as const, feeAmount: "", feePercent: "", bundle: "", ...fee,
  });
  const orders: OrderInput[] = [
    {
      clientId: siti, note: "Warna navy kalau ada", discount: "", applyVoucher: true, shipping: "18rb", bundles: [],
      items: [
        item("Tas Charles & Keith", "Grand Indonesia", "899rb", { feeMode: "per_item", feeAmount: "50rb" }),
        item("Parfum Zara 100ml", "Zara AEON BSD", "459rb", { feeMode: "nett" }),
      ],
    },
    {
      clientId: dina, note: "Untuk dijual lagi", discount: "", applyVoucher: false, shipping: "", bundles: [{ key: "b1", label: "Skincare", fee: "60rb" }],
      items: [
        item("Serum Somethinc", "Watsons", "149rb", { feeMode: "bundle", bundle: "b1" }, 3),
        item("Toner Avoskin", "Guardian", "135rb", { feeMode: "bundle", bundle: "b1" }, 2),
        item("Sepatu Converse", "Converse Store", "1jt", { feeMode: "percent", feePercent: "8" }),
      ],
    },
    {
      clientId: maya, note: "", discount: "10rb", applyVoucher: false, shipping: "", bundles: [],
      items: [item("Lego Classic", "Toys Kingdom", "649rb", { feeMode: "per_item", feeAmount: "35rb" })],
    },
  ];
  for (const order of orders) {
    const result = await createOrder(db, order, null);
    if (!result.ok) throw new Error(`Demo order: ${JSON.stringify(result.errors)}`);
  }
}
