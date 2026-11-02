import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { emailSchema, gstinSchema, isoDateSchema, moneySchema, nameSchema, optionalText } from "@/common/validation/primitives";

export const invoiceSchema = z
  .object({
    party: z.object({
      type: z.enum(["B2C", "B2B"]),
      name: nameSchema,
      email: emailSchema,
      mobile: optionalText(15),
      company: optionalText(120),
      gstin: gstinSchema.optional(),
      address: optionalText(300),
      customerId: z.string().optional(),
    }),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(2).max(200),
          ruleCode: z.string().min(2),
          qty: z.number().positive().max(10_000),
          /** INR excl. GST */
          unitPrice: moneySchema,
          /** Per-night tariff used to pick the GST slab (rooms only) */
          tariff: moneySchema.optional(),
        }),
      )
      .min(1, "Add at least one line item")
      .max(40),
    discount: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("percent"), value: z.number().min(0).max(100) }),
        z.object({ type: z.literal("flat"), value: z.number().min(0) }),
      ])
      .optional(),
    discountNote: optionalText(80),
    dueDate: isoDateSchema.optional(),
    notes: optionalText(300),
    bookingRef: z.string().optional(),
    sendEmail: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.party.type === "B2B") {
      if (!v.party.gstin) ctx.addIssue({ code: "custom", path: ["party", "gstin"], message: "GSTIN is required for B2B invoices" });
      if (!v.party.company) ctx.addIssue({ code: "custom", path: ["party", "company"], message: "Company name is required for B2B invoices" });
    }
  });
export class CreateInvoiceDto extends createZodDto(invoiceSchema) {}

export const emailInvoiceSchema = z.object({ to: z.email().optional(), message: z.string().trim().max(500).optional() });
export class EmailInvoiceDto extends createZodDto(emailInvoiceSchema) {}

export const creditNoteSchema = z.object({ reason: z.string().trim().min(5, "Please give a reason (at least 5 characters)").max(200) });
export class CreditNoteDto extends createZodDto(creditNoteSchema) {}

export const refundSchema = z.object({
  amount: moneySchema,
  method: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "NET_BANKING"]),
  reference: optionalText(40),
});
export class RefundDto extends createZodDto(refundSchema) {}

/** Lenient shape used while the staff form is still being filled in (no names/emails needed). */
export const previewInvoiceSchema = z.object({
  items: z.array(z.object({ ruleCode: z.string().min(2), description: z.string().optional(), qty: z.number().positive().max(10_000), unitPrice: moneySchema, tariff: moneySchema.optional() })).min(1).max(40),
  discount: z
    .discriminatedUnion("type", [z.object({ type: z.literal("percent"), value: z.number().min(0).max(100) }), z.object({ type: z.literal("flat"), value: z.number().min(0) })])
    .optional(),
  partyGstin: z.string().optional(),
});
export class PreviewInvoiceDto extends createZodDto(previewInvoiceSchema) {}
