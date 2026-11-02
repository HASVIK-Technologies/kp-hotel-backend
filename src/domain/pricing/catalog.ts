/**
 * Booking catalogue: rate plans, paid add-ons and promo codes. Served to the website via `GET /catalog`
 * and used by the pricing engine, so a price shown to a guest is always the price charged.
 */
export interface RatePlan {
  id: string;
  name: string;
  note: string;
  /** Extra charge per night per room, INR excl. GST */
  perNight: number;
  refundable: boolean;
}

export interface Addon {
  id: string;
  name: string;
  /** INR excl. GST */
  price: number;
  note: string;
  /** Charged once per night instead of once per stay */
  perNight?: boolean;
}

export interface Promo {
  label: string;
  percent: number;
}

export const RATE_PLANS: RatePlan[] = [
  { id: "room-only", name: "Room only", note: "Free cancellation until 48h before check-in", perNight: 0, refundable: true },
  { id: "breakfast", name: "With breakfast", note: "Most popular · non-refundable", perNight: 450, refundable: false },
];

export const ADDONS: Addon[] = [
  { id: "pickup", name: "Railway station pickup", price: 600, note: "One way, AC car" },
  { id: "late", name: "Late checkout", price: 0, note: "Until 2 PM, subject to availability" },
  { id: "extra-bed", name: "Extra bed", price: 800, note: "Per night", perNight: true },
  { id: "candlelight", name: "Candlelight dinner", price: 1800, note: "For two, at Restaurant" },
];

export const PROMOS: Record<string, Promo> = {
  WEEKEND20: { label: "Weekend Stay Offer, 20% off the room charge", percent: 20 },
  WELCOME10: { label: "Welcome offer, 10% off the room charge", percent: 10 },
};
