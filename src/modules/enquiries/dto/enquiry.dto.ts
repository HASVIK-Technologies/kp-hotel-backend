import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { namedDto } from "@/common/validation/named-dto";
import { emailSchema, isoDateSchema, mobileSchema, nameSchema, optionalText } from "@/common/validation/primitives";

/** One endpoint, four kinds of enquiry, discriminated by `kind`. */
export const createEnquirySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("Table"),
    name: nameSchema,
    mobile: mobileSchema,
    email: emailSchema.optional(),
    date: isoDateSchema,
    time: z.string(),
    guests: z.number().int().min(1).max(20),
    occasion: optionalText(60),
    notes: optionalText(300),
  }),
  z.object({
    kind: z.literal("Banquet"),
    name: nameSchema,
    email: emailSchema,
    mobile: mobileSchema,
    eventType: z.string(),
    date: isoDateSchema,
    guests: z.number().int().min(20).max(500),
    hall: z.string(),
    pkg: optionalText(30),
    message: optionalText(1000),
  }),
  z.object({
    kind: z.literal("Conference"),
    name: nameSchema,
    company: z.string().trim().min(2).max(120),
    email: emailSchema,
    mobile: mobileSchema,
    date: isoDateSchema,
    attendees: z.number().int().min(5).max(200),
    layout: z.string(),
    duration: z.enum(["half", "full"]),
    message: optionalText(1000),
  }),
  z.object({
    kind: z.literal("Contact"),
    name: nameSchema,
    email: emailSchema,
    mobile: optionalText(15),
    subject: z.string().min(1),
    message: z.string().trim().min(10).max(1000),
  }),
]);
/** Union schema: use with `new ZodValidationPipe(CreateEnquiryDto)` (a class cannot extend a union type). */
export const CreateEnquiryDto = namedDto(createZodDto(createEnquirySchema), "CreateEnquiryDto");
export type CreateEnquiryDto = z.infer<typeof createEnquirySchema>;

export const updateEnquirySchema = z.object({ status: z.enum(["New", "Contacted", "Closed"]) });
export class UpdateEnquiryDto extends createZodDto(updateEnquirySchema) {}

export const newsletterSchema = z.object({ email: emailSchema });
export class NewsletterDto extends createZodDto(newsletterSchema) {}
