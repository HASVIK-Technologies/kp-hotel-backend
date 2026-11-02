import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { namedDto } from "@/common/validation/named-dto";
import { isoDateSchema, moneySchema, optionalText } from "@/common/validation/primitives";

const common = {
  amount: moneySchema,
  paidAt: z.string().datetime({ offset: true }).optional(),
  note: optionalText(200),
};
const txnId = z.string().trim().regex(/^[A-Za-z0-9._-]{6,40}$/, "Enter the transaction / reference ID (6–40 letters or digits)");

/** Offline payment recorded by staff. The fields required depend on the method. */
export const recordPaymentSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("CASH"), ...common }),
  z.object({ method: z.literal("CARD"), ...common, cardLast4: z.string().regex(/^\d{4}$/, "Last 4 digits").optional(), bankReference: optionalText(40) }),
  z.object({
    method: z.literal("UPI"),
    ...common,
    upiTransactionId: txnId,
    upiVpa: z.string().trim().regex(/^[\w.-]{2,64}@[A-Za-z]{2,32}$/, "Enter a valid UPI ID").optional().or(z.literal("")),
  }),
  z.object({ method: z.literal("NET_BANKING"), ...common, bankReference: txnId }),
  z.object({ method: z.literal("BANK_TRANSFER"), ...common, bankReference: txnId }),
  z.object({
    method: z.literal("CHEQUE"),
    ...common,
    chequeNumber: z.string().regex(/^\d{6}$/, "6-digit cheque number"),
    chequeBank: z.string().trim().min(2).max(60),
    chequeDate: isoDateSchema,
  }),
]);
/** Union schema: use with `new ZodValidationPipe(RecordPaymentDto)` (a class cannot extend a union type). */
export const RecordPaymentDto = namedDto(createZodDto(recordPaymentSchema), "RecordPaymentDto");
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;

export const resolveChequeSchema = z.object({ outcome: z.enum(["CLEARED", "BOUNCED"]) });
export class ResolveChequeDto extends createZodDto(resolveChequeSchema) {}
