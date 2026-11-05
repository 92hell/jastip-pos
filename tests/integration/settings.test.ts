import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "@/lib/settings";
import { db } from "./setup";

const VALID = {
  shopName: "JASTIP TITIPLAILIYUK",
  tagline: "Your personal shopper",
  location: "BSD, Tangerang Selatan",
  instagram: "@jastip_titiplailiyuk",
  whatsapp: "https://wa.me/6281200000000",
  paymentAccounts: [{ bank: "BCA", holder: "Demo Jastip", number: "000 000 0000" }],
  rules: "Kalau tertulis NETT, berarti nggak kena fee jastip.",
  voucherAmount: "10000",
};

describe("Shop settings", () => {
  it("start from the shop's public profile, with no payment accounts until the owner adds them", async () => {
    const settings = await getSettings(db);

    expect(settings).toMatchObject({
      shopName: "JASTIP TITIPLAILIYUK",
      tagline: "Your personal shopper",
      location: "BSD, Tangerang Selatan",
      instagram: "jastip_titiplailiyuk",
      paymentAccounts: [],
    });
    expect(DEFAULT_SETTINGS.paymentAccounts).toEqual([]);
  });

  it("are saved and read back, with the Instagram handle and account numbers tidied", async () => {
    const result = await updateSettings(db, VALID);

    expect(result.ok).toBe(true);
    expect(await getSettings(db)).toMatchObject({
      instagram: "jastip_titiplailiyuk",
      paymentAccounts: [{ bank: "BCA", holder: "Demo Jastip", number: "0000000000" }],
      voucherAmount: 10000,
    });
  });

  it("refuse invalid values field by field and keep what was saved", async () => {
    await updateSettings(db, VALID);

    const result = await updateSettings(db, {
      ...VALID,
      shopName: " ",
      instagram: "not a handle!",
      whatsapp: "javascript:alert(1)",
      paymentAccounts: [{ bank: "BCA", holder: "", number: "12ab" }],
      voucherAmount: "-5",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(
      ["instagram", "paymentAccounts.0.holder", "paymentAccounts.0.number", "shopName", "voucherAmount", "whatsapp"].sort(),
    );
    expect((await getSettings(db)).shopName).toBe("JASTIP TITIPLAILIYUK");
  });

  it("accept a WhatsApp number, wa.me link or group invite, and at most 5 payment accounts", async () => {
    for (const whatsapp of ["0812 3456 7890", "+62 812-3456-7890", "https://wa.me/6281234567890", "https://chat.whatsapp.com/AbCdEf123", ""]) {
      expect((await updateSettings(db, { ...VALID, whatsapp })).ok, whatsapp).toBe(true);
    }
    const six = Array.from({ length: 6 }, () => VALID.paymentAccounts[0]);
    expect((await updateSettings(db, { ...VALID, paymentAccounts: six })).ok).toBe(false);
  });
});
