import { differenceInCalendarDays, parseISO } from "date-fns";
import { computeInvoice, DEFAULT_TAX_RULES, type Line, type LineInput, type TaxRule, type Totals } from "@/domain/tax";
import { ADDONS, PROMOS, RATE_PLANS } from "./catalog";

/**
 * The single, authoritative pricing engine. The website shows whatever `POST /quotes` returns, and bookings
 * are priced by the same function, so the quote and the invoice can never disagree.
 * Room GST is slab-based on the per-night tariff.
 */
export const HOTEL_STATE_CODE = "09";

export interface QuoteInput {
  room: { name: string; price: number };
  checkIn: string;
  checkOut: string;
  rooms: number;
  ratePlan: string;
  addonIds: string[];
  promo?: string;
}

export interface QuoteLine {
  label: string;
  amount: number;
  note?: string;
}

export interface Quote {
  nights: number;
  roomCharge: number;
  planCharge: number;
  addons: number;
  discount: number;
  subtotal: number;
  tax: number;
  roundOff: number;
  total: number;
  lines: QuoteLine[];
  promoValid: boolean;
  /** engine output in paise */
  invoiceLines: Line[];
  totals: Totals;
}

export const nightsBetween = (a?: string, b?: string) => (a && b ? Math.max(0, differenceInCalendarDays(parseISO(b), parseISO(a))) : 0);

/** Line items (paise) for a stay, used for both quoting and invoice generation. */
export function bookingLineItems(i: QuoteInput & { nights?: number }): { items: LineInput[]; nights: number; promoValid: boolean } {
  const nights = i.nights ?? nightsBetween(i.checkIn, i.checkOut);
  const plan = RATE_PLANS.find((p) => p.id === i.ratePlan) ?? RATE_PLANS[0];
  const unit = Math.round((i.room.price + plan.perNight) * 100);
  const promo = i.promo ? PROMOS[i.promo.toUpperCase()] : undefined;
  const roomGross = unit * nights * i.rooms;

  const items: LineInput[] = [
    {
      description: `${i.room.name}, ${nights} night${nights === 1 ? "" : "s"}${i.rooms > 1 ? ` × ${i.rooms} rooms` : ""}${plan.perNight ? " (with breakfast)" : ""}`,
      ruleCode: "ROOM_ACCOMMODATION",
      qty: nights * i.rooms,
      unitPricePaise: unit,
      tariffPaise: unit,
      discountPaise: promo ? Math.round((roomGross * promo.percent) / 100) : 0,
    },
  ];
  for (const a of ADDONS.filter((x) => i.addonIds.includes(x.id))) {
    if (a.price === 0) continue;
    const rule = a.id === "candlelight" ? "RESTAURANT_FNB" : a.id === "extra-bed" ? "ROOM_ACCOMMODATION" : "OTHER_SERVICE";
    items.push({
      description: a.name,
      ruleCode: rule,
      qty: a.perNight ? nights : 1,
      unitPricePaise: a.price * 100,
      tariffPaise: rule === "ROOM_ACCOMMODATION" ? unit : undefined,
    });
  }
  return { items, nights, promoValid: !!promo };
}

export function buildQuote(i: QuoteInput, rules: TaxRule[] = DEFAULT_TAX_RULES): Quote {
  const { items, nights, promoValid } = bookingLineItems(i);
  const empty = nights < 1;
  const { lines: invoiceLines, totals } = computeInvoice(empty ? [{ ...items[0], qty: 0 }] : items, { rules, hotelStateCode: HOTEL_STATE_CODE });
  const R = (p: number) => p / 100;

  const lines: QuoteLine[] = invoiceLines.map((l) => ({ label: l.description, amount: R(l.grossPaise) }));
  if (totals.discountPaise) lines.push({ label: `Promo ${i.promo?.toUpperCase()}`, amount: -R(totals.discountPaise) });
  const rates = [...new Set(invoiceLines.map((l) => l.gstRate))];
  lines.push({ label: `GST (${rates.join("% / ")}%)`, amount: R(totals.taxPaise) });
  if (totals.roundOffPaise) lines.push({ label: "Round off", amount: R(totals.roundOffPaise) });

  const planCharge = Math.round(RATE_PLANS.find((p) => p.id === i.ratePlan)?.perNight ?? 0) * nights * i.rooms;
  return {
    nights,
    roomCharge: R(invoiceLines[0]?.grossPaise ?? 0) - planCharge,
    planCharge,
    addons: R(invoiceLines.slice(1).reduce((s, l) => s + l.grossPaise, 0)),
    discount: R(totals.discountPaise),
    subtotal: R(totals.taxablePaise),
    tax: R(totals.taxPaise),
    roundOff: R(totals.roundOffPaise),
    total: R(totals.grandTotalPaise),
    lines,
    promoValid,
    invoiceLines,
    totals,
  };
}
