import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { emailSchema } from "@/common/validation/primitives";

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export class LoginDto extends createZodDto(loginSchema) {}
