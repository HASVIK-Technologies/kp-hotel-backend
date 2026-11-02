import { applyDecorators, SetMetadata } from "@nestjs/common";
import { ApiExtension } from "@nestjs/swagger";
import type { Permission } from "../constants/permissions";

export const PERMISSION_KEY = "permission";

/**
 * Restrict a staff route to roles that hold the permission (see `common/constants/permissions.ts`).
 * The permission name is also published in the OpenAPI document as `x-permission`.
 */
export const RequirePermission = (permission: Permission) => applyDecorators(SetMetadata(PERMISSION_KEY, permission), ApiExtension("x-permission", permission));
