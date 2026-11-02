export type Role = "owner" | "manager" | "accountant" | "frontdesk";
export const ROLES = ["owner", "manager", "accountant", "frontdesk"] as const satisfies readonly Role[];

/** Permission → roles allowed. Add a permission here, then reference it with `@RequirePermission(...)`. */
export const PERMISSIONS = {
  "invoice:create": ["owner", "manager", "accountant", "frontdesk"],
  "invoice:credit": ["owner", "manager", "accountant"],
  "payment:record": ["owner", "manager", "accountant", "frontdesk"],
  "payment:resolve": ["owner", "manager", "accountant"],
  "booking:manage": ["owner", "manager", "frontdesk"],
  "customer:manage": ["owner", "manager", "accountant", "frontdesk"],
  "rooms:edit": ["owner", "manager"],
  "tax:edit": ["owner", "accountant"],
  "settings:edit": ["owner"],
  "users:manage": ["owner"],
  "reports:view": ["owner", "manager", "accountant"],
  "enquiry:manage": ["owner", "manager", "frontdesk"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission): boolean => (PERMISSIONS[permission] as readonly Role[]).includes(role);
