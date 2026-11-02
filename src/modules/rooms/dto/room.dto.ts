import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AMENITY_FLAGS, ROOM_TYPES, ROOM_VIEWS } from "../room.types";

/** An image is either a file name inside `frontend/public/images/rooms/` (preferred) or an https URL. */
const imageRef = z
  .string()
  .trim()
  .regex(/^(https:\/\/\S+|[\w\-./]+\.(jpe?g|png|webp|avif|svg))$/i, "Use an image file name like deluxe-room-1.jpg, or an https:// URL");

const roomFields = {
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(60),
  type: z.enum(ROOM_TYPES),
  view: z.enum(ROOM_VIEWS),
  headline: z.string().trim().min(5).max(120),
  blurb: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20, "Describe the room in at least 20 characters").max(1000),
  price: z.number().min(500, "Price must be at least ₹500").max(100000, "Price must be at most ₹1,00,000"),
  mrp: z.number().min(500).max(100000).optional(),
  maxGuests: z.number().int().min(1).max(10),
  beds: z.string().trim().min(2).max(60),
  size: z.number().min(8).max(300),
  amenityFlags: z.array(z.enum(AMENITY_FLAGS)).max(AMENITY_FLAGS.length).default([]),
  amenities: z.array(z.string().trim().min(2).max(60)).min(1, "Add at least one amenity").max(20),
  images: z.array(imageRef).min(1, "Add at least one image").max(8),
  inventory: z.number().int().min(0, "Inventory must be 0–100").max(100, "Inventory must be 0–100"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(99999).optional(),
};

export const createRoomSchema = z.object(roomFields).refine((r) => r.mrp === undefined || r.mrp >= r.price, {
  path: ["mrp"],
  message: "MRP must be at least the room price",
});
export class CreateRoomDto extends createZodDto(createRoomSchema) {}

/** Every field is optional on update; the slug (URL) never changes. */
export const updateRoomSchema = z
  .object(roomFields)
  .partial()
  .refine((r) => r.mrp === undefined || r.price === undefined || r.mrp >= r.price, { path: ["mrp"], message: "MRP must be at least the room price" });
export class UpdateRoomDto extends createZodDto(updateRoomSchema) {}
