/** Booking records. All money is integer paise. */

export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "EXPIRED" | "NO_SHOW";

export interface Booking {
  ref: string;
  status: BookingStatus;
  roomSlug: string;
  roomName: string;
  image: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  ratePlan: string;
  addonIds: string[];
  promo?: string;
  guest: { name: string; email: string; mobile: string; company?: string; gstin?: string; requests?: string };
  payMode: "online" | "hotel" | "staff";
  totalPaise: number; // incl. GST, as quoted
  invoiceId?: string;
  invoiceNumber?: string;
  holdExpiresAt?: string;
  createdAt: string;
  source: "Website" | "Phone" | "Walk-in" | "OTA";
  cancelledAt?: string;
}
