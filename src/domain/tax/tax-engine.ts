import type { ComputeOptions, Line, LineInput, TaxRule, Totals } from "./tax.types";

export function resolveRate(rule: TaxRule, unitTariffPaise: number): number {
  if (rule.slabs?.length) {
    const slab = rule.slabs.find((s) => s.upToPaise === null || unitTariffPaise <= s.upToPaise);
    return (slab ?? rule.slabs[rule.slabs.length - 1]).rate;
  }
  return rule.rate ?? 0;
}

const half = (n: number) => Math.round(n / 2);

/** Computes GST per line (slab-aware, CGST+SGST or IGST) and invoice totals, rounding to the nearest rupee. */
export function computeInvoice(inputs: LineInput[], opts: ComputeOptions): { lines: Line[]; totals: Totals } {
  if (!inputs.length) throw new Error("At least one line item is required");

  const rawGross = inputs.map((l) => Math.round(l.unitPricePaise * l.qty));
  const lineDisc = inputs.map((l, i) => Math.min(Math.max(l.discountPaise ?? 0, 0), rawGross[i]));
  const gross = rawGross.map((g, i) => g - lineDisc[i]); // value after line discounts
  const grossTotal = gross.reduce((a, b) => a + b, 0);

  let discountTotal = 0;
  const d = opts.discount;
  if (d?.type === "percent") discountTotal = Math.round((grossTotal * d.value) / 100);
  if (d?.type === "flat") discountTotal = Math.min(d.valuePaise, grossTotal);
  if (discountTotal < 0 || discountTotal > grossTotal) throw new Error("Invalid discount");

  // pro-rata allocation, remainder on the last line so the sum is exact
  let allocated = 0;
  const lineDiscounts = gross.map((g, i) => {
    if (i === gross.length - 1) return discountTotal - allocated;
    const x = grossTotal ? Math.floor((discountTotal * g) / grossTotal) : 0;
    allocated += x;
    return x;
  });

  const lines: Line[] = inputs.map((inp, i) => {
    const rule = opts.rules.find((r) => r.code === inp.ruleCode);
    if (!rule) throw new Error(`Unknown tax rule: ${inp.ruleCode}`);
    const taxable = gross[i] - lineDiscounts[i];
    const rate = resolveRate(rule, inp.tariffPaise ?? inp.unitPricePaise);
    const intra = rule.supplyAtProperty || !opts.customerStateCode || opts.customerStateCode === opts.hotelStateCode;
    const tax = Math.round((taxable * rate) / 100);
    const cgst = intra ? half(tax) : 0;
    const sgst = intra ? tax - cgst : 0;
    const igst = intra ? 0 : tax;
    return {
      description: inp.description, ruleCode: rule.code, service: rule.service, sac: rule.sac, qty: inp.qty,
      unitPricePaise: inp.unitPricePaise, grossPaise: rawGross[i], discountPaise: lineDisc[i] + lineDiscounts[i], taxablePaise: taxable,
      gstRate: rate, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, totalPaise: taxable + cgst + sgst + igst,
    };
  });

  const sum = (f: (l: Line) => number) => lines.reduce((a, l) => a + f(l), 0);
  const subtotal = sum((l) => l.totalPaise);
  const grand = Math.round(subtotal / 100) * 100; // round to nearest rupee, shown as "Round off"
  const totals: Totals = {
    grossPaise: rawGross.reduce((a, b) => a + b, 0),
    discountPaise: lineDisc.reduce((a, b) => a + b, 0) + discountTotal,
    taxablePaise: sum((l) => l.taxablePaise),
    cgstPaise: sum((l) => l.cgstPaise),
    sgstPaise: sum((l) => l.sgstPaise),
    igstPaise: sum((l) => l.igstPaise),
    taxPaise: sum((l) => l.cgstPaise + l.sgstPaise + l.igstPaise),
    roundOffPaise: grand - subtotal,
    grandTotalPaise: grand,
  };
  return { lines, totals };
}
