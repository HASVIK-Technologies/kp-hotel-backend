import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { emailSchema, optionalText } from "@/common/validation/primitives";

export const settingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    gstin: z.string().trim().toUpperCase().max(15),
    stateCode: z.string().regex(/^\d{2}$/, "Two-digit GST state code"),
    address: z.string().trim().min(5).max(300),
    phone: z.string().trim().min(5).max(20),
    email: emailSchema,
    bankName: optionalText(80),
    bankAccount: optionalText(30),
    bankIfsc: optionalText(15),
    upiId: optionalText(60),
    defaultCreditDays: z.number().int().min(0).max(120),
  })
  .partial();
export class SettingsDto extends createZodDto(settingsSchema) {}

const slab = z.object({ upToPaise: z.number().int().positive().nullable(), rate: z.number().min(0).max(40) });

const taxRule = z
  .object({
    code: z.string().min(1).max(40),
    service: z.enum(["ROOM", "RESTAURANT", "BANQUET", "CONFERENCE", "OTHER"]),
    description: z.string().min(1).max(120),
    sac: z.string().regex(/^\d{4,8}$/, "SAC/HSN must be 4–8 digits"),
    rate: z.number().min(0).max(40).optional(),
    slabs: z.array(slab).optional(),
    itcAllowed: z.boolean(),
    supplyAtProperty: z.boolean(),
    verified: z.boolean(),
    note: z.string().max(500).optional(),
  })
  .refine((r) => r.rate !== undefined || (r.slabs?.length ?? 0) > 0, { message: "Each rule needs a rate or tariff slabs", path: ["rate"] });

export const taxRulesSchema = z.object({ rules: z.array(taxRule).min(1) });
export class TaxRulesDto extends createZodDto(taxRulesSchema) {}
