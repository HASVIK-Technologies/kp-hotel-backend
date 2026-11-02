import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const quoteSchema = z.object({
  roomSlug: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.number().int().min(1).max(5).default(1),
  ratePlan: z.string().default("room-only"),
  addonIds: z.array(z.string()).max(8).default([]),
  promo: z.string().trim().max(20).optional(),
});
export class QuoteDto extends createZodDto(quoteSchema) {}
