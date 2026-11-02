import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { parseISO } from "date-fns";
import { istToday } from "@/common/utils/time.util";
import { emailSchema, gstinSchema, mobileSchema, nameSchema, optionalText } from "@/common/validation/primitives";

export const guestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  mobile: mobileSchema,
  company: optionalText(120),
  gstin: gstinSchema,
  requests: optionalText(400),
});

const stayShape = {
  roomSlug: z.string().min(1),
  checkIn: z.string(),
  checkOut: z.string(),
  rooms: z.number().int().min(1).max(5),
  adults: z.number().int().min(1).max(8),
  children: z.number().int().min(0).max(6),
  ratePlan: z.string().default("room-only"),
  addonIds: z.array(z.string()).max(8).default([]),
  promo: z.string().trim().max(20).optional().or(z.literal("")),
};

/** Date/occupancy sanity checks shared by guest and staff bookings. */
const checkStay = (v: { checkIn: string; checkOut: string; adults: number; rooms: number }, ctx: z.RefinementCtx) => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(v.checkIn)) return void ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Select a check-in date" });
  if (!iso.test(v.checkOut)) return void ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Select a check-out date" });
  if (v.checkIn < istToday()) ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Date can't be in the past" });
  if (parseISO(v.checkOut) <= parseISO(v.checkIn)) ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in" });
  if (v.adults < v.rooms) ctx.addIssue({ code: "custom", path: ["rooms"], message: "Each room needs at least one adult" });
};

export const createBookingSchema = z
  .object({ ...stayShape, guest: guestSchema, payMode: z.enum(["online", "hotel"]) })
  .superRefine(checkStay);
export class CreateBookingDto extends createZodDto(createBookingSchema) {}

/** Phone / walk-in / OTA booking taken by staff. Always confirmed and invoiced immediately. */
export const createStaffBookingSchema = z
  .object({ ...stayShape, guest: guestSchema, source: z.enum(["Phone", "Walk-in", "OTA"]).default("Phone") })
  .superRefine(checkStay);
export class CreateStaffBookingDto extends createZodDto(createStaffBookingSchema) {}

export const bookingStatusSchema = z.object({ status: z.enum(["CHECKED_IN", "CHECKED_OUT", "NO_SHOW"]) });
export class BookingStatusDto extends createZodDto(bookingStatusSchema) {}
