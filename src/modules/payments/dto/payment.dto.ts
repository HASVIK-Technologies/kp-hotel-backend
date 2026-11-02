import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const mockCompleteSchema = z.object({
  outcome: z.enum(["SUCCESS", "FAILED"]),
  method: z.enum(["upi", "card", "net_banking"]).default("upi"),
});
/** Local-only: simulate the customer finishing a payment on the (mock) hosted page. */
export class MockCompleteDto extends createZodDto(mockCompleteSchema) {}
