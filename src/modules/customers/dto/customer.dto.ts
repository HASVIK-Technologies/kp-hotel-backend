import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { emailSchema, gstinSchema, nameSchema, optionalText } from "@/common/validation/primitives";

export const createCustomerSchema = z.object({
  name: nameSchema,
  company: z.string().trim().min(2).max(120),
  gstin: gstinSchema.refine((v) => v !== "", "GSTIN is required"),
  email: emailSchema,
  mobile: optionalText(15),
  address: optionalText(300),
  creditDays: z.number().int().min(0).max(120).default(7),
});
export class CreateCustomerDto extends createZodDto(createCustomerSchema) {}

/** The GSTIN is the customer's identity and cannot be changed. */
export const updateCustomerSchema = z
  .object({
    name: nameSchema,
    company: z.string().trim().min(2).max(120),
    email: emailSchema,
    mobile: optionalText(15),
    address: optionalText(300),
    creditDays: z.number().int().min(0).max(120),
  })
  .partial();
export class UpdateCustomerDto extends createZodDto(updateCustomerSchema) {}
