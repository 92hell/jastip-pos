/**
 * The jastip pricing engine, shared by the order form (live totals) and the server (the totals that
 * are stored; the server never trusts totals sent by the browser). Money is whole rupiah.
 *
 * Fee types, as Laili charges them, chosen per item line:
 * - per_item: a flat fee for each unit ("fee 25rb")
 * - percent:  a share of the price, in basis points (1000 = 10%), rounded to whole rupiah per line
 * - nett:     the price already includes the fee ("NETT")
 * - bundle:   the line belongs to a bundle with one flat fee for all its items ("bundling fee 50rb")
 *
 * A sold-out item costs nothing; a bundle keeps its fee while at least one of its items is still coming.
 * Then a discount and the Instagram-tag voucher come off the items and fees (never below zero, and
 * never off the ongkir), and ongkir is added once she knows it.
 */
export type Fee =
  | { mode: "per_item"; amount: number }
  | { mode: "percent"; basisPoints: number }
  | { mode: "nett" }
  | { mode: "bundle"; bundle: string };

export type FeeMode = Fee["mode"];
export const FEE_MODES: FeeMode[] = ["per_item", "percent", "nett", "bundle"];

/** soldOut: she could not buy it, so the client pays neither its price nor its fee. */
export type PricingItem = { quantity: number; unitPrice: number; fee: Fee; soldOut?: boolean };
export type PricingInput = {
  items: PricingItem[];
  bundles: { key: string; fee: number }[];
  discount: number;
  voucher: number;
  /** null until she knows it. */
  shipping: number | null;
};

export type PricedOrder = {
  lines: { subtotal: number; fee: number }[];
  bundleFees: { key: string; fee: number; items: number }[];
  itemsTotal: number;
  feesTotal: number;
  discount: number;
  voucher: number;
  shipping: number | null;
  total: number;
};

const MAX = 1_000_000_000_000;

function rupiah(value: number, what: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX) throw new RangeError(`${what} must be whole rupiah, 0 or more`);
  return value;
}

export function priceOrder(input: PricingInput): PricedOrder {
  const bundleKeys = new Set(input.bundles.map((b) => b.key));
  const bundleCounts = new Map<string, number>();

  const lines = input.items.map((item, i) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000) {
      throw new RangeError(`item ${i + 1}: quantity must be a whole number from 1`);
    }
    const subtotal = rupiah(item.quantity * rupiah(item.unitPrice, `item ${i + 1} price`), `item ${i + 1} subtotal`);
    const fee = item.fee;
    if (fee.mode === "bundle" && !bundleKeys.has(fee.bundle)) throw new RangeError(`item ${i + 1}: unknown bundle`);
    if (item.soldOut) return { subtotal: 0, fee: 0 };
    switch (fee.mode) {
      case "per_item":
        return { subtotal, fee: item.quantity * rupiah(fee.amount, `item ${i + 1} fee`) };
      case "percent":
        if (!Number.isSafeInteger(fee.basisPoints) || fee.basisPoints < 0 || fee.basisPoints > 10_000) {
          throw new RangeError(`item ${i + 1}: percentage must be 0–100%`);
        }
        return { subtotal, fee: Math.round((subtotal * fee.basisPoints) / 10_000) };
      case "nett":
        return { subtotal, fee: 0 };
      case "bundle":
        if (!bundleKeys.has(fee.bundle)) throw new RangeError(`item ${i + 1}: unknown bundle`);
        bundleCounts.set(fee.bundle, (bundleCounts.get(fee.bundle) ?? 0) + 1);
        return { subtotal, fee: 0 };
    }
  });

  const bundleFees = input.bundles.map((b) => {
    const items = bundleCounts.get(b.key) ?? 0;
    return { key: b.key, fee: items > 0 ? rupiah(b.fee, "bundle fee") : 0, items };
  });

  const itemsTotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const feesTotal = lines.reduce((sum, l) => sum + l.fee, 0) + bundleFees.reduce((sum, b) => sum + b.fee, 0);
  const beforeReductions = itemsTotal + feesTotal;
  const discount = Math.min(rupiah(input.discount, "discount"), beforeReductions);
  const voucher = Math.min(rupiah(input.voucher, "voucher"), beforeReductions - discount);
  const shipping = input.shipping === null ? null : rupiah(input.shipping, "ongkir");

  return {
    lines,
    bundleFees,
    itemsTotal,
    feesTotal,
    discount,
    voucher,
    shipping,
    total: beforeReductions - discount - voucher + (shipping ?? 0),
  };
}
