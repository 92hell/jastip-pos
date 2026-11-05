import { describe, expect, it } from "vitest";
import { priceOrder, type PricingInput } from "@/lib/pricing";

const order = (overrides: Partial<PricingInput>): PricingInput => ({
  items: [],
  bundles: [],
  discount: 0,
  voucher: 0,
  shipping: null,
  ...overrides,
});

describe("Pricing an order", () => {
  it("flat fee per item: 'Tas Rp 350.000 + fee 25rb', twice", () => {
    const p = priceOrder(order({ items: [{ quantity: 2, unitPrice: 350_000, fee: { mode: "per_item", amount: 25_000 } }] }));

    expect(p.lines[0]).toEqual({ subtotal: 700_000, fee: 50_000 });
    expect(p).toMatchObject({ itemsTotal: 700_000, feesTotal: 50_000, total: 750_000 });
  });

  it("percentage fee: '10% dari harga', rounded to whole rupiah per line", () => {
    const p = priceOrder(order({
      items: [
        { quantity: 1, unitPrice: 199_000, fee: { mode: "percent", basisPoints: 1000 } },
        { quantity: 3, unitPrice: 33_333, fee: { mode: "percent", basisPoints: 750 } },
      ],
    }));

    expect(p.lines.map((l) => l.fee)).toEqual([19_900, 7_500]);
    expect(p.total).toBe(199_000 + 99_999 + 19_900 + 7_500);
  });

  it("NETT: the price already includes the fee", () => {
    const p = priceOrder(order({ items: [{ quantity: 1, unitPrice: 420_000, fee: { mode: "nett" } }] }));

    expect(p).toMatchObject({ feesTotal: 0, total: 420_000 });
  });

  it("bundle: one flat fee for several items, 'bundling 3 item fee 50rb'", () => {
    const p = priceOrder(order({
      bundles: [{ key: "a", fee: 50_000 }],
      items: [
        { quantity: 1, unitPrice: 120_000, fee: { mode: "bundle", bundle: "a" } },
        { quantity: 2, unitPrice: 80_000, fee: { mode: "bundle", bundle: "a" } },
      ],
    }));

    expect(p.lines.map((l) => l.fee)).toEqual([0, 0]);
    expect(p.bundleFees).toEqual([{ key: "a", fee: 50_000, items: 2 }]);
    expect(p).toMatchObject({ feesTotal: 50_000, total: 280_000 + 50_000 });
  });

  it("an empty bundle charges nothing", () => {
    const p = priceOrder(order({ bundles: [{ key: "a", fee: 50_000 }] }));

    expect(p.bundleFees).toEqual([{ key: "a", fee: 0, items: 0 }]);
    expect(p.total).toBe(0);
  });

  it("mixes fee types in one order, then discount, voucher and ongkir", () => {
    const p = priceOrder(order({
      bundles: [{ key: "b", fee: 30_000 }],
      items: [
        { quantity: 1, unitPrice: 350_000, fee: { mode: "per_item", amount: 25_000 } },
        { quantity: 1, unitPrice: 420_000, fee: { mode: "nett" } },
        { quantity: 1, unitPrice: 100_000, fee: { mode: "percent", basisPoints: 1000 } },
        { quantity: 2, unitPrice: 50_000, fee: { mode: "bundle", bundle: "b" } },
      ],
      discount: 5_000,
      voucher: 10_000,
      shipping: 18_000,
    }));

    expect(p).toMatchObject({
      itemsTotal: 970_000,
      feesTotal: 25_000 + 10_000 + 30_000,
      discount: 5_000,
      voucher: 10_000,
      shipping: 18_000,
      total: 970_000 + 65_000 - 5_000 - 10_000 + 18_000,
    });
  });

  it("discount and voucher never take the total below zero, nor reduce ongkir", () => {
    const p = priceOrder(order({
      items: [{ quantity: 1, unitPrice: 8_000, fee: { mode: "nett" } }],
      discount: 5_000,
      voucher: 10_000,
      shipping: 12_000,
    }));

    expect(p).toMatchObject({ discount: 5_000, voucher: 3_000, total: 12_000 });
  });

  it("ongkir not known yet is left out of the total", () => {
    const p = priceOrder(order({ items: [{ quantity: 1, unitPrice: 100_000, fee: { mode: "nett" } }], shipping: null }));

    expect(p).toMatchObject({ shipping: null, total: 100_000 });
  });

  it("refuses impossible input instead of guessing", () => {
    const bad: PricingInput[] = [
      order({ items: [{ quantity: 0, unitPrice: 1, fee: { mode: "nett" } }] }),
      order({ items: [{ quantity: 1, unitPrice: -1, fee: { mode: "nett" } }] }),
      order({ items: [{ quantity: 1, unitPrice: 1.5, fee: { mode: "nett" } }] }),
      order({ items: [{ quantity: 1, unitPrice: 1, fee: { mode: "percent", basisPoints: 10_001 } }] }),
      order({ items: [{ quantity: 1, unitPrice: 1, fee: { mode: "bundle", bundle: "missing" } }] }),
      order({ discount: -1 }),
      order({ shipping: -1 }),
    ];
    for (const input of bad) expect(() => priceOrder(input), JSON.stringify(input)).toThrow(RangeError);
  });

  it("a sold-out item is not charged: neither its price nor its fee", () => {
    const p = priceOrder(order({
      items: [
        { quantity: 1, unitPrice: 350_000, fee: { mode: "per_item", amount: 25_000 } },
        { quantity: 2, unitPrice: 100_000, fee: { mode: "percent", basisPoints: 1000 }, soldOut: true },
      ],
    }));

    expect(p.lines).toEqual([{ subtotal: 350_000, fee: 25_000 }, { subtotal: 0, fee: 0 }]);
    expect(p.total).toBe(375_000);
  });

  it("a bundle keeps its fee while any of its items is still coming, and drops it when all are sold out", () => {
    const bundle = (soldOut: [boolean, boolean]) =>
      priceOrder(order({
        bundles: [{ key: "a", fee: 50_000 }],
        items: soldOut.map((s) => ({ quantity: 1, unitPrice: 100_000, fee: { mode: "bundle" as const, bundle: "a" }, soldOut: s })),
      }));

    expect(bundle([false, true]).bundleFees).toEqual([{ key: "a", fee: 50_000, items: 1 }]);
    expect(bundle([true, true]).bundleFees).toEqual([{ key: "a", fee: 0, items: 0 }]);
    expect(bundle([true, true]).total).toBe(0);
  });
});
