import type { Booking } from "./booking.types";
import type { StoredBooking } from "./bookings.repository";

/** Removes internal pricing/bookkeeping fields before a booking leaves the API. */
export const toPublicBooking = (b: StoredBooking): Booking => {
  const { rulesSnapshot, attempts, roomPriceRupees, invoiceCreating, ...rest } = b;
  return rest;
};
