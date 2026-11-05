import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { id } from "@/i18n/id";
import { fill, preferredLocale, rupiah } from "@/i18n";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe("Languages", () => {
  it("open in Indonesian unless the browser prefers English", () => {
    expect(preferredLocale("id-ID,id;q=0.9,en;q=0.8")).toBe("id");
    expect(preferredLocale("en-GB,en;q=0.9")).toBe("en");
    expect(preferredLocale("en;q=0.5,id;q=0.9")).toBe("id");
    expect(preferredLocale("ja,fr;q=0.8")).toBe("id");
    expect(preferredLocale(undefined)).toBe("id");
  });

  it("have the same texts in English and Indonesian, with the same placeholders", () => {
    expect(keys(en)).toEqual(keys(id));
    const at = (dict: object, key: string) =>
      key.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], dict) as string;
    const placeholders = (dict: object) => keys(dict).map((k) => at(dict, k).match(/\{\w+\}/g)?.sort().join());
    expect(placeholders(en)).toEqual(placeholders(id));
  });

  it("fill placeholders and write rupiah the local way", () => {
    expect(fill("Halo, {name}!", { name: "Laili" })).toBe("Halo, Laili!");
    expect(rupiah(10000, "id").replace(/\s/g, " ")).toBe("Rp 10.000");
    expect(rupiah(10000, "en")).toMatch(/IDR\s?10,000/);
  });
});
