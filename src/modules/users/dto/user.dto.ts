import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ROLES } from "@/common/constants/permissions";
import { emailSchema, nameSchema } from "@/common/validation/primitives";

export const createUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: z.enum(ROLES),
  password: z.string().min(10, "Use at least 10 characters").max(100),
});
export class CreateUserDto extends createZodDto(createUserSchema) {}

export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  password: z.string().min(10, "Use at least 10 characters").max(100).optional(),
});
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
