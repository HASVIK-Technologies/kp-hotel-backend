import { describe, expect, it } from "vitest";
import { amountInWords, computeInvoice, DEFAULT_TAX_RULES, gstinChecksumOk, paise, resolveRate } from "@/domain/tax";

const opts = { rules: DEFAULT_TAX_RULES, hotelStateCode: "09" };

describe("GST engine", () => {
  it("applies 5% to rooms up to ₹7,500 and 18% above", () => {
    const room = DEFAULT_TAX_RULES.find((r) => r.code === "ROOM_ACCOMMODATION")!;
    expect(resolveRate(room, paise(2200))).toBe(5);
    expect(resolveRate(room, paise(7500))).toBe(5);
    expect(resolveRate(room, paise(7501))).toBe(18);
  });

  it("computes CGST+SGST, rounds to the rupee and totals exactly", () => {
    const { lines, totals } = computeInvoice([{ description: "Deluxe", ruleCode: "ROOM_ACCOMMODATION", qty: 2, unitPricePaise: paise(2200) }], opts);
    expect(lines[0].taxablePaise).toBe(440000);
    expect(lines[0].cgstPaise).toBe(11000);
    expect(lines[0].sgstPaise).toBe(11000);
    expect(totals.grandTotalPaise).toBe(462000);
    expect(totals.roundOffPaise).toBe(0);
  });

  it("allocates invoice-level discounts pro-rata across mixed GST rates", () => {
    const { lines, totals } = computeInvoice(
      [
        { description: "Hall", ruleCode: "BANQUET_HALL", qty: 1, unitPricePaise: paise(10000) },
        { description: "Food", ruleCode: "RESTAURANT_FNB", qty: 1, unitPricePaise: paise(10000) },
      ],
      { ...opts, discount: { type: "percent", value: 10 } },
    );
    expect(totals.discountPaise).toBe(200000);
    expect(lines[0].taxablePaise + lines[1].taxablePaise).toBe(1800000);
    expect(lines[0].gstRate).toBe(18);
    expect(lines[1].gstRate).toBe(5);
    // 9,000 × 18% + 9,000 × 5% = 2,070
    expect(totals.taxPaise).toBe(207000);
    expect(totals.grandTotalPaise).toBe(1800000 + 207000);
  });

  it("never lets a flat discount exceed the gross", () => {
    const { totals } = computeInvoice([{ description: "x", ruleCode: "OTHER_SERVICE", qty: 1, unitPricePaise: 10000 }], { ...opts, discount: { type: "flat", valuePaise: 999999 } });
    expect(totals.taxablePaise).toBe(0);
    expect(totals.grandTotalPaise).toBe(0);
  });

  it("uses IGST for non-property services billed to another state", () => {
    const { lines } = computeInvoice([{ description: "Transfer", ruleCode: "OTHER_SERVICE", qty: 1, unitPricePaise: paise(1000) }], { ...opts, customerStateCode: "27" });
    expect(lines[0].igstPaise).toBe(18000);
    expect(lines[0].cgstPaise).toBe(0);
  });

  it("keeps CGST+SGST for property-located supplies even for out-of-state customers", () => {
    const { lines } = computeInvoice([{ description: "Hall", ruleCode: "BANQUET_HALL", qty: 1, unitPricePaise: paise(1000) }], { ...opts, customerStateCode: "27" });
    expect(lines[0].igstPaise).toBe(0);
    expect(lines[0].cgstPaise + lines[0].sgstPaise).toBe(18000);
  });

  it("rounds odd paise to the rupee with an explicit round-off", () => {
    const { totals } = computeInvoice([{ description: "x", ruleCode: "RESTAURANT_FNB", qty: 1, unitPricePaise: 12345 }], opts);
    expect(totals.grandTotalPaise % 100).toBe(0);
    expect(totals.roundOffPaise).not.toBe(0);
  });

  it("validates GSTIN checksum", () => {
    expect(gstinChecksumOk("09AABCR1234F1ZQ")).toBe(true);
    expect(gstinChecksumOk("09AABCR1234F1ZP")).toBe(false);
    expect(gstinChecksumOk("not-a-gstin")).toBe(false);
  });

  it("writes amounts in Indian words", () => {
    expect(amountInWords(paise(4620))).toBe("Four Thousand Six Hundred Twenty Rupees Only");
    expect(amountInWords(paise(1234567.5))).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Fifty Paise Only");
  });
});
