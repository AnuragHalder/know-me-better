import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { businessIsDraft } from "./business";
import { PRODUCTS, formatRupees, priceLabel } from "./pricing";

describe("price list", () => {
  it("matches exactly the products the database accepts", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    // The latest definition of the purchases.product check wins.
    const block = [...sql.matchAll(/check \(\s*product in \(([\s\S]*?)\)/g)].at(-1);
    expect(block).toBeDefined();
    const dbProducts = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(PRODUCTS.map((p) => p.id).sort()).toEqual(dbProducts);
  });

  it("has whole-rupee prices and unique ids", () => {
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(p.amountPaise % 100).toBe(0);
      expect(p.amountPaise).toBeGreaterThan(0);
    }
  });

  it("formats prices the Indian way", () => {
    expect(formatRupees(2900)).toBe("₹29");
    expect(formatRupees(69900)).toBe("₹699");
    expect(formatRupees(250000)).toBe("₹2,500");
    expect(priceLabel(PRODUCTS.find((p) => p.id === "pro_monthly")!)).toBe("₹99/month");
  });
});

describe("business details", () => {
  it("counts as a draft while placeholders remain", () => {
    expect(businessIsDraft({ legalName: "[Name]", address: ["x"] })).toBe(true);
    expect(businessIsDraft({ legalName: "Anurag", address: ["[City]"] })).toBe(true);
    expect(businessIsDraft({ legalName: "Anurag", address: ["Kolkata"], gstin: null })).toBe(false);
  });
});
